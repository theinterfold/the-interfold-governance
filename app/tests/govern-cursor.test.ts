import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../motion/govern/boot.js',import.meta.url),'utf8')
  .replace(/^import[^\n]+\n/,'').replace('export function mountHero','function mountHero');

class Target {
  handlers=new Map<string,Set<Function>>();
  dataset:Record<string,string>={};
  addEventListener(name:string,handler:Function){if(!this.handlers.has(name))this.handlers.set(name,new Set());this.handlers.get(name)!.add(handler);}
  removeEventListener(name:string,handler:Function){this.handlers.get(name)?.delete(handler);}
  emit(name:string,event:any={}){this.handlers.get(name)?.forEach(handler=>handler(event));}
}
async function setup(reducedMotion=false) {
  const document=Object.assign(new Target(),{hidden:false,readyState:'complete',querySelectorAll:()=>[]});
  const window=new Target(),surface=new Target(),canvas=Object.assign(new Target(),{getBoundingClientRect:()=>({left:0,top:0,width:600,height:450})});
  const art=new Target(),reduced=Object.assign(new Target(),{matches:reducedMotion}),hover=Object.assign(new Target(),{matches:true});
  const root={parentElement:surface,querySelector:(selector:string)=>selector==='canvas'?canvas:art};
  const pointers:any[]=[],playing:boolean[]=[],observers:Function[]=[];
  let error:Function=()=>{},disposed=0,exits=0;
  const renderer={setPointer:(...args:any[])=>{pointers.push(args);return args[2];},exitPointer(){exits++;},setPlaying:(on:boolean)=>playing.push(on),render(){},resize(){},dispose(){disposed++;}};
  const context:any={document,window,AbortController,console,
    matchMedia:(query:string)=>query.includes('reduced')?reduced:hover,
    warmGovernHero(){},createGovernHero:async(_canvas:any,_reduced:any,options:any)=>{error=options.onError;return renderer;},
    requestAnimationFrame:()=>1,cancelAnimationFrame(){},
    IntersectionObserver:class {constructor(callback:Function){observers.push(callback);}observe(){}disconnect(){}},
    ResizeObserver:class {constructor(callback:Function){observers.push(callback);}observe(){}disconnect(){}},
  };
  runInNewContext(source,context);
  const instance=context.mountHero(root);
  observers[0]([{isIntersecting:true}]);await Promise.resolve();await Promise.resolve();
  const move=(pointerType='mouse',interactive=false)=>surface.emit('pointermove',{pointerType,clientX:300,clientY:225,target:{closest:()=>interactive?{}:null}});
  return {surface,document,window,hover,reduced,canvas,instance,move,pointers,playing,observers,error:()=>error(),get disposed(){return disposed;},get exits(){return exits;}};
}

test('the cursor is scoped to the artwork and restores on controls, touch and leave',async()=>{
  const p=await setup();p.move();expect(p.surface.dataset.governCursor).toBe('true');expect(p.pointers.at(-1)).toEqual([300,225,true,true]);
  p.move('mouse',true);expect(p.surface.dataset.governCursor).toBe('false');expect(p.pointers.at(-1)[2]).toBe(false);
  for(const event of ['pointerleave','pointercancel']){p.move();p.surface.emit(event);expect(p.surface.dataset.governCursor).toBeUndefined();}
  expect(p.exits).toBe(1);
  p.move();p.move('touch');expect(p.surface.dataset.governCursor).toBeUndefined();
  p.instance.dispose();expect(p.disposed).toBe(1);expect([...p.surface.handlers.values()].every(set=>!set.size)).toBe(true);
});
test('suspension, geometry changes and failures cannot leave the native cursor hidden',async()=>{
  for(const reason of ['blur','scroll','resize','hidden','offscreen','hover','failure']){
    const p=await setup();p.move();
    if(reason==='blur'||reason==='scroll')p.window.emit(reason);
    if(reason==='resize')p.observers[1]();
    if(reason==='hidden'){p.document.hidden=true;p.document.emit('visibilitychange');}
    if(reason==='offscreen')p.observers[0]([{isIntersecting:false}]);
    if(reason==='hover'){p.hover.matches=false;p.hover.emit('change');}
    if(reason==='failure')p.error();
    expect(p.surface.dataset.governCursor).toBeUndefined();expect(p.pointers.at(-1)[2]).toBe(false);p.instance.dispose();
  }
});
test('reduced motion keeps native pointing and a static artwork',async()=>{
  const p=await setup(true);p.move();expect(p.surface.dataset.governCursor).toBeUndefined();expect(p.playing.every(value=>!value)).toBe(true);p.instance.dispose();
});
