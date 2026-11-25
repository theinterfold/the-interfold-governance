import {readPointStream} from '../motion/govern/point-stream.js';
import {packCursorHoles} from '../motion/govern/cursor-metaball.js';
import {prewarmGovernWorker} from '../motion/govern/prewarm.js';
import {createCursorPresence,cursorRegionAmount} from '../motion/govern/cursor-interaction.js';
import { advancePresentation, nextSolverTime, nextPaintDeadline } from './governHeroPlayback';
const ASSET_ROOT = '/govern-compact';
// The standalone entry URL carries the build digest into its dynamic import.
const MODULE_REVISION = new URL(import.meta.url).search;
const STEP = .1, LEAD = .1, SLOTS = 24, RATE = 2.6;
export const warmGovernHero=()=>prewarmGovernWorker(MODULE_REVISION);
function takeWorker(){
  const key=Symbol.for('interfold.govern.worker'),entry=globalThis[key];
  if(!entry||entry.claimed)return new Worker(`${ASSET_ROOT}/worker.js${MODULE_REVISION}`,{type:'module'});
  entry.claimed=true;clearTimeout(entry.timer);
  if(entry.error){entry.worker.terminate();throw entry.error;}
  return entry.worker;
}


/** Small initial drawing, lazy solver, and a bounded look-ahead buffer.
 * Interpolate accepted native grains; draw the latest pointer's shared field.
 * @param {HTMLCanvasElement} canvas
 * @param {boolean} reducedMotion
 * @param {{signal?: AbortSignal,onError?: (error: Error)=>void,animateEntrance?: boolean}} options
 * @returns {Promise<{render:(time:number)=>void,resize:()=>void,dispose:()=>void,setPlaying:(enabled:boolean)=>void}>}
 */
export async function createGovernHero(canvas, reducedMotion=false, {signal,onError,animateEntrance=true}={}) {
  const abortError=()=>new DOMException('Artwork initialization cancelled','AbortError');
  if(signal?.aborted)throw abortError();
  const assets=new AbortController();
  // Reuse the document preloads. Decode and reveal points independently of the
  // solver download; transfer the exact completed Float32 population only once.
  const seedAssets=Promise.all([
    fetch(`${ASSET_ROOT}/points.bin.gz`,{signal:assets.signal}),
    fetch(`${ASSET_ROOT}/geometry.json`,{signal:assets.signal}).then(r=>{if(!r.ok)throw Error('Geometry unavailable');return r.json();}),
  ]).then(([response,meta])=>({response,meta}),error=>({error}));
  // The self-contained worker includes both pressure kernels: no engine/WASM
  // requests need to wait for this worker to start executing.
  let createGrainRenderer;
  try{({createGrainRenderer}=await import(/* webpackIgnore: true */ `${ASSET_ROOT}/renderer.js${MODULE_REVISION}`));}
  catch(error){assets.abort();throw error;}
  if(signal?.aborted){assets.abort();throw abortError();}
  const started=performance.now(),worker=reducedMotion?null:takeWorker();
  if(worker)canvas.dataset.workerStartedAtMs=String(Math.round(worker.startedAtMs??started));
  let renderer=null,disposed=false,ready=false,solverReady=false,playing=false,busy=false,spare=null;
  let frames=[],start=0,count=0,version=0,time=0,previousElapsed=0,lastRequest=0;
  let width=0,height=0,entrance=reducedMotion||!animateEntrance?1:0,rise=null,paintDeadline=-Infinity;
  const cursorPresence=createCursorPresence();
  let cursorHull=null,pointerSeq=0,pointerAt=0;
  let seedHoles=null,seedMaskGeometry=null,subframes=0;
  let resolveReady,rejectReady;
  const completion=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  const timer=setTimeout(()=>fail(new Error('Artwork initialization timed out')),30000);
  function dispose(){
    if(disposed)return;disposed=true;assets.abort();clearTimeout(timer);signal?.removeEventListener('abort',abort);
    worker?.terminate();
    const key=Symbol.for('interfold.govern.worker');
    if(globalThis[key]?.worker===worker)delete globalThis[key];
    rise?.cancel();renderer?.dispose();frames=[];spare=null;
  }
  function abort(){if(!ready)rejectReady(abortError());dispose();}
  function fail(error){canvas.dataset.failed='true';canvas.dataset.failureReason=error.message;document.dispatchEvent(new Event('govern:motion-error'));if(!ready)rejectReady(error);dispose();if(ready)onError?.(error);}
  function push(points,frameTime,holes=seedHoles,input={}){
    let index;if(count&&Math.abs(frames[(start+count-1)%SLOTS].time-frameTime)<1e-7)index=(start+count-1)%SLOTS;else if(count<SLOTS){index=(start+count)%SLOTS;count++;}else{index=start;start=(start+1)%SLOTS;}
    const frame=frames[index];frame.points??=new Float32Array(points.length);frame.points.set(points);frame.time=frameTime;frame.version=++version;frame.holes=holes;frame.pointerSeq=input.pointerSeq??0;frame.pointerAt=input.pointerAt??0;frame.maskGeometry=input.maskGeometry??seedMaskGeometry;
  }
  function draw(){
    if(!renderer||!count||!width||!height||disposed)return;
    let lo=frames[start],hi=lo;
    for(let n=1;n<count;n++){
      const next=frames[(start+n)%SLOTS];if(time<=next.time){hi=next;break;}lo=next;hi=next;
    }
    const alpha=hi.time>lo.time?Math.max(0,Math.min(1,(time-lo.time)/(hi.time-lo.time))):0;
    const cursor=cursorPresence.sample(performance.now());
    renderer.drawInterpolated(lo,hi,alpha,1,.65,entrance,cursor);
    canvas.dataset.displayTime=(lo.time+(hi.time-lo.time)*alpha).toFixed(3);
    canvas.dataset.entrance=entrance.toFixed(3);
    if(pointerAt){canvas.dataset.pointerAgeMs=(performance.now()-pointerAt).toFixed(2);canvas.dataset.pointerSeq=String(pointerSeq);}
    canvas.dataset.cursorX=cursor.x.toFixed(3);
    canvas.dataset.cursorY=cursor.y.toFixed(3);
    canvas.dataset.cursorRadius=String(cursor.r);
  }
  function resize(){
    if(!renderer||disposed)return;
    const rect=canvas.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,2);
    const w=Math.round(rect.width*ratio),h=Math.round(rect.height*ratio);if(!w||!h)return;
    if(w!==width||h!==height){width=w;height=h;renderer.resize(w,h);}draw();
  }
  function request(){
    if(!playing||!solverReady||busy||!spare||disposed)return;
    const next=nextSolverTime(time,lastRequest,STEP,LEAD);if(next===null)return;
    busy=true;lastRequest=next;const buffer=spare;spare=null;
    worker.postMessage({type:'sample',time:next,buffer,pointer:[300,225,0]},[buffer]);
  }
  function sendPointer(){
    if(disposed)return;
    pointerAt=performance.now();pointerSeq++;
  }
  function hasLiveCursor(){return !reducedMotion&&cursorPresence.sample(performance.now()).r>0;}
  function render(elapsed){
    if(!ready||disposed)return;
    const latest=frames[(start+count-1)%SLOTS].time;
    const delta=Math.max(0,Math.min(.1,elapsed-previousElapsed));
    time=reducedMotion?0:advancePresentation(time,delta,latest,RATE,false);previousElapsed=elapsed;
    entrance=reducedMotion||!animateEntrance?1:Math.min(1,Math.max(0,elapsed)/.6);
    if(rise){if(elapsed<.6)rise.currentTime=Math.max(0,elapsed)*1000;else{rise.cancel();rise=null;}}
    const nextPaint=nextPaintDeadline(elapsed*1000,paintDeadline);
    if(hasLiveCursor()||nextPaint!==null){draw();if(nextPaint!==null)paintDeadline=nextPaint;}request();
  }
  const api={render,resize,dispose,setPointer(clientX,clientY,enabled,useParticleRegion=false){
    const rect=canvas.getBoundingClientRect(),scale=Math.min(rect.width/600,rect.height/450);
    if(!enabled||!playing||reducedMotion||!(scale>0)){cursorPresence.reset();sendPointer();draw();return false;}
    const x=300+(clientX-rect.left-rect.width/2)/scale,y=225+(clientY-rect.top-rect.height/2)/scale;
    const amount=useParticleRegion?cursorRegionAmount(x,y,cursorHull):1;
    cursorPresence.move(x,y,amount,performance.now());sendPointer();
    return amount>0;
  },exitPointer(){cursorPresence.leave(performance.now());sendPointer();draw();},
  setPlaying(enabled){playing=enabled&&!reducedMotion&&!disposed;if(!playing){cursorPresence.reset();sendPointer();draw();}request();}};
  function initializeSeed(points,total){
    frames=Array.from({length:SLOTS},()=>({time:0,version:0,points:null}));
    push(points,0);renderer=createGrainRenderer(canvas,total);
    canvas.dataset.count=String(total);canvas.dataset.profile='lighter-centre';canvas.dataset.playback='compact-buffered';
    canvas.dataset.firstFrameMs=(performance.now()-started).toFixed(0);canvas.dataset.interaction='renderer-shared-metaball';canvas.dataset.cursorBackend='webgl-shared-field';
    if(!reducedMotion&&animateEntrance){
      rise=canvas.animate([{transform:'translate3d(0,16px,0)'},{transform:'translate3d(0,0,0)'}],{duration:600,easing:'cubic-bezier(0.22,1,0.36,1)',fill:'both'});
      rise.pause();rise.currentTime=0;
    }
    clearTimeout(timer);resize();ready=true;resolveReady(api);
    canvas.dataset.firstFrameAtMs=performance.now().toFixed(0);
    if(reducedMotion)document.dispatchEvent(new Event('govern:motion-ready'));
  }
  signal?.addEventListener('abort',abort,{once:true});
  if(worker){
   worker.onerror=event=>fail(new Error(event.message||'Artwork worker failed'));
   worker.onmessage=({data})=>{
    if(disposed)return;
    if(data.type==='error'){fail(new Error(data.message));return;}
    try{
      if(data.type==='ready'){
        solverReady=true;canvas.dataset.backend=data.backend||'cpu';canvas.dataset.pressureBackend=data.pressureBackend||'js';request();
      }else if(data.type==='subframe'){
        push(new Float32Array(data.buffer),data.time,data.holes,data);
        canvas.dataset.subframes=String(++subframes);
      }else if(data.type==='frame'){
        const points=new Float32Array(data.buffer);push(points,data.time,data.holes,data);spare=points.buffer;busy=false;lastRequest=data.time;
        if(!canvas.dataset.firstSolvedAtMs){canvas.dataset.firstSolvedAtMs=performance.now().toFixed(0);document.dispatchEvent(new Event('govern:motion-ready'));}
        canvas.dataset.backend=data.backend||'cpu';canvas.dataset.transportBackend=data.transportBackend||'cpu';canvas.dataset.cursorBackend='webgl-shared-field';
        canvas.dataset.sampleMs=data.sampleMs.toFixed(2);canvas.dataset.bufferSeconds=((data.time-time)/RATE).toFixed(3);
        canvas.dataset.solverStages=JSON.stringify(data.stageMs||{});request();
      }
    }catch(error){fail(error);}
  };
   worker.postMessage({type:'init',reducedMotion});
  }
  seedAssets.then(async data=>{
    if(disposed)return;
    if(data.error)throw data.error;
    cursorHull=data.meta.cursorHull;
    seedHoles=packCursorHoles({circles:data.meta.holes});
    seedMaskGeometry={circles:Float32Array.from(data.meta.holes.flatMap(c=>[c.x,c.y,c.r,c.r])),fusionAmount:1,fusionMix:0,pairMixes:[0,0],kernelRatio:.45};
    let received=0;
    const points=await readPointStream(data.response,data.meta,(partial,total)=>{
      if(disposed)return;
      if(!ready)initializeSeed(partial,data.meta.count);
      else{
        frames[0].points.set(partial.subarray(received*3,total*3),received*3);
        frames[0].version=++version;
      }
      received=total;canvas.dataset.receivedPoints=String(total);
      if(reducedMotion)draw();
    });
    if(disposed)return;
    if(worker){
      spare=new ArrayBuffer(points.byteLength);
      worker.postMessage({type:'seed-assets',buffer:points.buffer,meta:data.meta},[points.buffer]);
    }
  }).catch(error=>{if(!disposed)fail(error);});
  return completion;
}
