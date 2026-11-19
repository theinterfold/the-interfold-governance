// The server-rendered homepage and native artwork controls work before React.
// Give the critical artwork a short network window; never hold the app for a
// failed/hidden canvas, reduced motion, or an interaction with the page.
export function scheduleGovernHydration(){
  const key=Symbol.for('interfold.govern.hydration');
  if(globalThis[key])return;
  globalThis[key]=true;
  let released=false,timer;
  const events=['govern:motion-ready','govern:motion-error','pointerdown','keydown'];
  function release(){
    if(released)return;released=true;clearTimeout(timer);
    for(const event of events)document.removeEventListener(event,release,true);
    // DOM insertion with async=false preserves the original script order.
    const insert=()=>{
      for(const placeholder of document.querySelectorAll('script[data-govern-src]')){
        const script=document.createElement('script');
        for(const attribute of placeholder.attributes){
          if(!['type','data-govern-src','defer'].includes(attribute.name))script.setAttribute(attribute.name,attribute.value);
        }
        if(placeholder.nonce)script.nonce=placeholder.nonce;
        script.async=false;script.src=placeholder.dataset.governSrc;
        placeholder.replaceWith(script);
      }
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',insert,{once:true});
    else insert();
  }
  for(const event of events)document.addEventListener(event,release,{capture:true,once:true});
  timer=setTimeout(release,Math.max(0,1500-performance.now()));
  if(document.hidden)release();
}
export const GOVERN_HYDRATION_GATE=`(${scheduleGovernHydration.toString()})();`;
