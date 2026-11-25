// Self-contained so the same function can run inline in the initial HTML.
// Queue the real worker before the application/font downloads fill the origin's
// connections; the module adopts it, with no fetch/preload duplicate or Blob URL.
export function prewarmGovernWorker(query=""){
  const key=Symbol.for('interfold.govern.worker');
  if(globalThis[key]||document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  try{
    const worker=new Worker('/govern-compact/worker.js'+query,{type:'module'});
    const entry={worker,error:null,timer:0};
    globalThis[key]=entry;worker.startedAtMs=performance.now();
    worker.onerror=event=>{entry.error=new Error(event.message||'Artwork worker failed');};
    worker.postMessage({type:'prepare'});
    entry.timer=setTimeout(()=>{if(globalThis[key]===entry){worker.terminate();delete globalThis[key];}},15000);
  }catch{/* The normal mount reports initialization errors if workers are blocked. */}
}

export const governPrewarmScript=(query="")=>`(${prewarmGovernWorker.toString()})(${JSON.stringify(query)});`;
export const GOVERN_HERO_PREWARM=governPrewarmScript();
