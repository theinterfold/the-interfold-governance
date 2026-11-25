import {packCursorRenderField} from './cursor-render-field.js';
import {packCursorHoles} from './cursor-metaball.js';
let model,engine,queue=Promise.resolve(),resolveSeed;
let requestedTime=0,lastPublishedTime=0;
let nativeTime=0,lastMaintenanceAt=0;
let pointer={seq:0,at:0,values:[300,225,0]},activePointer=null,acceptedPointer=null;
// Yield a task without the nested setTimeout(0) four-millisecond clamp.
const inputChannel=new MessageChannel(),inputYields=[];
inputChannel.port1.onmessage=()=>inputYields.shift()?.();
const yieldToInput=()=>new Promise(resolve=>{inputYields.push(resolve);inputChannel.port2.postMessage(0);});
const pointerMetadata=()=>({pointerSeq:activePointer?.seq??0,pointerAt:activePointer?.at??0});
function publishCursorFrame({time,particles,state}){
  if(time>=requestedTime-1e-7||time<=lastPublishedTime+1e-7)return;
  lastPublishedTime=time;
  const buffer=particles.slice().buffer;
  self.postMessage({type:'subframe',time,holes:packCursorHoles(state),maskGeometry:packCursorRenderField(state),...pointerMetadata(),buffer},[buffer]);
}
function publishSubstep(frame){
  if(frame.stage==='end'&&frame.stepDuration<.08)publishCursorFrame(frame);
}
const seedAssets=new Promise(resolve=>{resolveSeed=resolve;});
const controls=time=>({vacancyTime:time*1.7,fusionTime:time*1.7,grainTime:time,travel:1.6,whiteSize:1,fusionAmount:1});
const prepare=()=>engine??=import('./model-fixed-step.js').then(async module=>({module,backends:await module.prepareModelBackends()})).catch(error=>({error}));
self.onmessage=({data})=>{
  if(data.type==='pointer'){
    if(Number.isSafeInteger(data.seq)&&data.seq>pointer.seq&&data.values?.length===3&&data.values.every(Number.isFinite))
      pointer={seq:data.seq,at:data.at,values:data.values};
    return;
  }
  if(data.type==='prepare'){prepare();return;}
  if(data.type==='seed-assets'){resolveSeed(data);return;}
  queue=queue.then(()=>handle(data)).catch(error=>self.postMessage({type:'error',message:error.message}));
};
async function handle(data){
  if(data.type==='init'){
    const loading=data.reducedMotion?null:prepare();
    const {buffer,meta}=await seedAssets;
    const seed=new Float32Array(buffer),points=[];
    if(seed.length!==meta.count*3||meta.count<10000||meta.count>60000)throw Error('Unexpected compact point count');
    for(let k=0;k<seed.length;k+=3)points.push([seed[k],seed[k+1],seed[k+2]]);
    // Reduced motion never initializes or advances the solver.
    if(data.reducedMotion)return;
    const loaded=await loading;if(loaded.error)throw loaded.error;
    const {createModel}=loaded.module;
    model=await createModel(points,meta.holes,null,{profile:points.length,backends:loaded.backends,interactiveCursor:true,onVolumeStage:publishSubstep,
      isCursorInteractive:()=>!!activePointer,shouldInterruptCursor:()=>pointer.seq>(activePointer?.seq??pointer.seq),
      onCursorFlowFrame:async frame=>{publishCursorFrame(frame);if(activePointer)await yieldToInput();}});
    await model.sample(0);
    lastMaintenanceAt=performance.now();
    self.postMessage({type:'ready',backend:model.base.fineBackend?.backendType,pressureBackend:model.base.poissonBackendType});
  }else if(data.type==='sample'&&model){
    const started=performance.now();
    const output=new Float32Array(data.buffer);
    activePointer=pointer.seq?pointer:{seq:0,at:0,values:data.pointer??pointer.values};
    model.base.setCursor(...activePointer.values,model.base.acceptedTime);
    // The interactive lane can stop between fixed-grid boundaries. Its base
    // model owns the accepted time; the adapter must not mark the whole step done.
    const interactive=activePointer.values[2]>0||model.base.state.circles.at(-1).r>.01;
    const fastWanted=interactive&&started-lastMaintenanceAt<100;
    let time=model.base.acceptedTime+(fastWanted?.04:model.step);
    requestedTime=time;
    let fast=null;
    if(fastWanted)fast=await model.base.sampleCursor(time,output);
    if(fast)acceptedPointer=activePointer;
    if(!fast){
      // One bounded native advance, with no accumulated catch-up debt. Holding
      // the accepted cursor makes this work independent of stale pointer input.
      lastMaintenanceAt=started;nativeTime+=model.step;
      time=model.base.acceptedTime+model.step;requestedTime=time;
      activePointer=acceptedPointer??activePointer;
      await model.base.sampleMaintenance(time,output,controls(nativeTime));
    }
    const acceptedTime=model.base.acceptedTime;
    const cursorPieces=model.base.lastStep?.volumeFlow?.filter(flow=>flow.cursor)??[];
    const cursorBackend=cursorPieces.length?(cursorPieces.some(flow=>flow.backend==='webgpu-cursor')?'webgpu':'cpu'):
      model.base.gpuCursorBackend?.isAvailable?'webgpu':'cpu';
    output.set(model.base.particles);
    self.postMessage({type:'frame',time:acceptedTime,...pointerMetadata(),interrupted:!!model.base.lastStep?.interrupted,fastLane:!!model.base.lastStep?.fastLane,maintenance:!!model.base.lastStep?.maintenance,nativeTime,holes:packCursorHoles(model.base.state),maskGeometry:packCursorRenderField(model.base.state),sampleMs:performance.now()-started,backend:model.base.fineBackend?.backendType,transportBackend:model.base.gpuTransportBackend?'webgpu':'cpu',cursorBackend,cursorFailure:model.base.gpuCursorBackend?.lastError??'',stageMs:model.base.lastStep?.stageMs,buffer:output.buffer},[output.buffer]);
  }
}
