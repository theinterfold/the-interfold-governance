import {createGovernHero,warmGovernHero} from '../../utils/governHeroRenderer.js';

if(!document.hidden)warmGovernHero();

// This small module runs from the document head, before React/wallet hydration.
// React adopts the same instance after hydration and disposes it on navigation.
const instances=new WeakMap();
export function mountHero(root){
  if(instances.has(root))return instances.get(root);
  const canvas=root.querySelector('canvas'),art=root.querySelector('[data-art]');
  if(!canvas||!art)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),hover=matchMedia('(hover: hover) and (pointer: fine)'),surface=root.parentElement;
  let renderer=null,loading=false,disposed=false,visible=false,active=false;
  let controller=null,token=0,frame=0,elapsed=0,previousTime=0;
  const setReady=ready=>{art.dataset.ready=String(ready);};
  const stopLoading=()=>{token++;controller?.abort();controller=null;loading=false;};
  function animate(now){
    if(!active||!renderer)return;
    if(previousTime)elapsed+=Math.min((now-previousTime)/1000,.1);
    previousTime=now;renderer.render(elapsed);frame=requestAnimationFrame(animate);
  }
  function playback(){
    const next=!!renderer&&!disposed&&visible&&!document.hidden&&!reduced.matches;
    if(!next)leave();
    renderer?.setPlaying(next);
    if(active===next)return;
    active=next;previousTime=0;
    if(active)frame=requestAnimationFrame(animate);else cancelAnimationFrame(frame);
  }
  async function load(){
    if(loading||renderer||disposed||!visible||document.hidden)return;
    loading=true;const current=++token,abort=new AbortController();controller=abort;
    try{
      const created=await createGovernHero(canvas,reduced.matches,{signal:abort.signal,onError(){leave();renderer=null;active=false;cancelAnimationFrame(frame);setReady(false);}});
      if(disposed||current!==token||abort.signal.aborted){created.dispose();return;}
      renderer=created;elapsed=0;renderer.resize();renderer.render(0);setReady(true);playback();
    }catch(error){if(error.name!=='AbortError'){canvas.dataset.failed='true';canvas.dataset.failureReason=error.message;}}
    finally{if(current===token){loading=false;controller=null;}}
  }
  function pointer(event){
    if(event.pointerType!=='mouse'||!hover.matches||reduced.matches){leave();return;}
    const allowed=active&&!event.target.closest('a,button,input,select,textarea,[role="button"]');
    const inside=renderer?.setPointer(event.clientX,event.clientY,allowed,true)??false;
    surface.dataset.governCursor=String(inside);
  }
  function leave(){renderer?.setPointer(0,0,false);delete surface.dataset.governCursor;}
  function exit(){renderer?.exitPointer();delete surface.dataset.governCursor;}
  surface.addEventListener('pointermove',pointer,{passive:true});surface.addEventListener('pointerleave',exit);
  const intersection=new IntersectionObserver(([entry])=>{
    visible=entry.isIntersecting;if(visible)void load();else stopLoading();playback();
  },{threshold:.05});
  const resize=new ResizeObserver(()=>{leave();renderer?.resize();});
  function visibility(){if(document.hidden)stopLoading();else if(visible)void load();playback();}
  function lost(event){event.preventDefault();leave();stopLoading();active=false;cancelAnimationFrame(frame);renderer?.dispose();renderer=null;setReady(false);}
  function restored(){if(visible&&!document.hidden)void load();}
  function preference(){leave();stopLoading();active=false;cancelAnimationFrame(frame);renderer?.dispose();renderer=null;setReady(false);void load();}
  intersection.observe(canvas);resize.observe(canvas);
  document.addEventListener('visibilitychange',visibility);
  canvas.addEventListener('webglcontextlost',lost);canvas.addEventListener('webglcontextrestored',restored);
  reduced.addEventListener('change',preference);
  hover.addEventListener('change',leave);
  window.addEventListener('blur',leave);
  window.addEventListener('scroll',leave,{passive:true});
  surface.addEventListener('pointercancel',leave);
  const api={dispose(){
    if(disposed)return;leave();disposed=true;active=false;stopLoading();cancelAnimationFrame(frame);
    intersection.disconnect();resize.disconnect();
    surface.removeEventListener('pointermove',pointer);surface.removeEventListener('pointerleave',exit);
    document.removeEventListener('visibilitychange',visibility);
    canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('webglcontextrestored',restored);
    reduced.removeEventListener('change',preference);renderer?.dispose();instances.delete(root);
    hover.removeEventListener('change',leave);window.removeEventListener('blur',leave);window.removeEventListener('scroll',leave);surface.removeEventListener('pointercancel',leave);
  }};
  instances.set(root,api);return api;
}
function scan(){document.querySelectorAll('[data-govern-hero]').forEach(mountHero);}
// The async module may arrive before the parser reaches the artwork.
if(document.readyState==='loading'){
  const observer=new MutationObserver(scan);observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',()=>{observer.disconnect();scan();},{once:true});
}
scan();
