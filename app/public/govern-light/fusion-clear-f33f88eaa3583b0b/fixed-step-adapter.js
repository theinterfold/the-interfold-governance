/**
 * Fixed-grid, one-step-lagged renderer for the unified Govern transport.
 * The base solver only receives times k*step. Render calls never alter the
 * simulation unless they cross a grid boundary or retarget scalar sliders.
 */
export function createFixedStepModel(base,options={}){
  const step=options.step??.1;
  if(!(Number.isFinite(step)&&step>0))throw new RangeError('step must be positive');
  const count=base.count,source=base.source;
  if(!source||source.length!==count*3)throw new TypeError('base model must expose fixed source triples');
  const previous=new Float32Array(source.length),current=new Float32Array(source.length),output=new Float32Array(source.length);
  const defaults={travel:1.6,whiteSize:1,fusionAmount:1};
  const clocks=['vacancyTime','fusionTime','grainTime'];
  const scalars=['travel','whiteSize','fusionAmount'];
  const all=[...clocks,...scalars];
  const stats={sampleCalls:0,baseSampleCalls:0,fixedSteps:0,retargets:0,resets:0};
  let initialized=false,gridIndex=0,lastObservedTime=0,lastObserved=null,gridControls=null;
  const finite=(v,fallback)=>Number.isFinite(v)?v:fallback;
  function normalize(time,controls){
    return{
      vacancyTime:finite(controls.vacancyTime,time),
      fusionTime:finite(controls.fusionTime,time),
      grainTime:finite(controls.grainTime,time),
      travel:finite(controls.travel,defaults.travel),
      whiteSize:finite(controls.whiteSize,defaults.whiteSize),
      fusionAmount:finite(controls.fusionAmount,defaults.fusionAmount),
    };
  }
  function lerpControls(a,b,u){
    const c={};for(const key of all)c[key]=a[key]+(b[key]-a[key])*u;
    return c;
  }
  async function callBase(time,buffer,controls){await base.sample(time,buffer,controls);stats.baseSampleCalls++;}
  function reset(){
    base.reset?.();initialized=false;gridIndex=0;lastObservedTime=0;lastObserved=null;gridControls=null;
    previous.set(source);current.set(source);stats.resets++;
  }
  async function init(time,requested){
    // The gallery first calls sample(0). A later first call is replayed from
    // zero using linearly inferred clocks, still at exact grid boundaries.
    const initial=time===0?requested:{...requested,vacancyTime:0,fusionTime:0,grainTime:0};
    await callBase(0,current,initial);previous.set(current);
    gridControls=initial;lastObserved=initial;lastObservedTime=0;initialized=true;
  }
  async function sample(time,out=output,controls={},onIntermediate=null){
    if(!Number.isFinite(time)||time<0)throw new RangeError('time must be nonnegative and finite');
    if(out.length!==source.length)throw new RangeError('output length must equal source length');
    stats.sampleCalls++;
    const requested=normalize(time,controls);
    if(initialized&&time<lastObservedTime-1e-8)reset();
    if(!initialized)await init(time,requested);
    const nextGrid=Math.floor((time+1e-9)/step);
    const scalarChanged=scalars.some(key=>Math.abs(requested[key]-lastObserved[key])>1e-9);
    let boundaryUsedRequestedScalars=false;
    if(nextGrid>gridIndex){
      const span=time-lastObservedTime;
      for(let index=gridIndex+1;index<=nextGrid;index++){
        const boundary=index*step;
        const u=span>1e-10?Math.max(0,Math.min(1,(boundary-lastObservedTime)/span)):1;
        const atBoundary=lerpControls(lastObserved,requested,u);
        // A scalar change happened at this observation, not earlier in the
        // unobserved interval. Keep older grid boundaries on the old values.
        if(scalarChanged&&boundary<time-1e-9)
          for(const key of scalars)atBoundary[key]=lastObserved[key];
        else if(scalarChanged)boundaryUsedRequestedScalars=true;
        previous.set(current);
        await callBase(boundary,current,atBoundary);
        gridIndex=index;gridControls=atBoundary;stats.fixedSteps++;
        // Publish completed states during a long catch-up without changing the
        // request's boundary controls or the time at which sliders take effect.
        // At an exact boundary the lagged renderer represents `previous`.
        if(onIntermediate&&!scalarChanged&&index<nextGrid)
          onIntermediate(previous,boundary);
      }
    }
    if(scalarChanged&&!boundaryUsedRequestedScalars){
      // A paused or sub-grid slider change should be visible immediately.
      // Retarget the existing solver state in place; never reset/replay.
      const retarget={...gridControls};
      for(const key of scalars)retarget[key]=requested[key];
      await callBase(gridIndex*step,current,retarget);
      previous.set(current);
      gridControls=retarget;stats.retargets++;
    }
    lastObserved=requested;lastObservedTime=time;
    // With two past states in hand, display one grid interval behind the
    // solver. This gives continuous positions without future extrapolation.
    const alpha=gridIndex===0?1:Math.max(0,Math.min(1,(time-gridIndex*step)/step));
    for(let k=0;k<out.length;k+=3){
      out[k]=previous[k]+(current[k]-previous[k])*alpha;
      out[k+1]=previous[k+1]+(current[k+1]-previous[k+1])*alpha;
      out[k+2]=source[k+2];
    }
    return out;
  }
  return{count,source,sample,reset,stats,base,step,get fixedTime(){return gridIndex*step;},get state(){return base.state;}};
}
