import {createImplicitEvaluator} from '../../public/govern-light/entrance-moving-439a65ba9b0355bf/govern-implicit-sdf.js';
import {createWhiteBounds} from '../../public/govern-light/entrance-moving-439a65ba9b0355bf/white-bounds.js';

// The cursor moves much farther per input sample than the authored vacancies.
// Transport displaced mass into the newly exposed fluid before the ordinary
// pressure correction; projection alone piles that mass onto the leading rim.
export function createCursorFlow(particles,source,flow,domain,grid,getGpuBackend){
  function samplerFor(state){
    return createImplicitEvaluator(state);
  }
  function ensureFluidBounds(sampler,state){
    if(sampler.fluidBounds)return;
    sampler.fluidBounds=createWhiteBounds(grid);
    sampler.fluidBounds.setState(state);
  }
  function interpolateState(previous,next,u){
    if(u===1)return next;
    const whiteSize=previous.whiteSize+(next.whiteSize-previous.whiteSize)*u;
    const circles=next.circles.map((c,i)=>{
      const a=previous.circles[i];
      return {...c,x:a.x+(c.x-a.x)*u,y:a.y+(c.y-a.y)*u,r:a.r+(c.r-a.r)*u};
    });
    return {...next,circles,sized:circles.map(c=>({...c,r:c.r*whiteSize})),whiteSize,
      fusionMix:previous.fusionMix+(next.fusionMix-previous.fusionMix)*u,
      pairMixes:next.pairMixes.map((m,i)=>previous.pairMixes[i]+(m-previous.pairMixes[i])*u),
      shrinks:Float64Array.from(next.shrinks,(s,i)=>previous.shrinks[i]+(s-previous.shrinks[i])*u)};
  }
  function projectResidual(sampler,support=null){
    let projected=0,maxCorrection=0;
    for(let k=0;k<particles.length;k+=3){
      if(support&&(particles[k]<support.x0||particles[k]>support.x1||particles[k+1]<support.y0||particles[k+1]>support.y1))continue;
      if(sampler.fluidBounds.pointOutside(particles[k],particles[k+1]))continue;
      let c=sampler.evaluateNearWall(particles[k],particles[k+1],12);
      if(!c||c.signedGap>=.0001)continue;
      let distance=0;
      for(let pass=0;pass<24&&c.signedGap<.0001;pass++){
        const push=Math.min(Math.max(.02,.0001-c.signedGap),2);
        particles[k]+=c.nx*push;particles[k+1]+=c.ny*push;distance+=push;
        c=sampler.evaluate(particles[k],particles[k+1]);
      }
      projected++;maxCorrection=Math.max(maxCorrection,distance);
    }
    return {projected,maxCorrection};
  }
  return {
    async apply(previous,next,{time,dt,massScale,retainedFractionAt,move,correctTexture,onFrame,isInteractive,shouldInterrupt}){
      const oldCursor=previous?.circles.at(-1),cursor=next?.circles.at(-1);
      if(!oldCursor||!cursor)return null;
      const oldRadius=oldCursor.r*previous.whiteSize,radius=cursor.r*next.whiteSize;
      if(!Number.isFinite(oldCursor.x+oldCursor.y+cursor.x+cursor.y+oldRadius+radius)||Math.max(oldRadius,radius)<=.01)return null;
      // Entering begins at the pointer's position. Never sweep from the tiny
      // offscreen sentinel through the artwork to create the new vacancy.
      if(oldRadius<=.01){
        previous={...previous,circles:previous.circles.map((c,i)=>i===previous.circles.length-1?{...c,x:cursor.x,y:cursor.y}:c)};
      }
      const a=previous.circles.at(-1),travel=Math.hypot(cursor.x-a.x,cursor.y-a.y),growth=Math.abs(radius-oldRadius);
      if(Math.max(travel,growth)<=.01)return null;
      const pieces=Math.max(1,Math.ceil(Math.max(travel,growth)/12)),results=[];
      // Four subdivisions also cover the original adaptive geometric check:
      // all authored circles move and every grain is projected at each piece.
      // The live interactive lane also accepts short pieces, so a new pointer
      // can replace their remaining work. Other callers retain adaptive retry.
      const covered=pieces>=4||isInteractive?.();
      let beforeState=previous,before=samplerFor(previous);
      for(let piece=1;piece<=pieces;piece++){
        const pieceStarted=performance.now();
        const fraction=piece/pieces,state=interpolateState(previous,next,fraction),after=samplerFor(state);
        const cursorStageMs={sampler:performance.now()-pieceStarted};
        const start=beforeState.circles.at(-1),end=state.circles.at(-1);
        const reach=Math.max(start.r*beforeState.whiteSize,end.r*state.whiteSize)*2.5;
        const support={x0:Math.min(start.x,end.x)-reach,y0:Math.min(start.y,end.y)-reach,x1:Math.max(start.x,end.x)+reach,y1:Math.max(start.y,end.y)+reach};
        const roi={x0:Math.max(domain.x0,support.x0-12),y0:Math.max(domain.y0,support.y0-12),x1:Math.min(domain.x1,support.x1+12),y1:Math.min(domain.y1,support.y1+12)};
        // Give displaced fluid room to slow down. A twelve-unit receiving
        // margin compressed it into a visible rectangular seam on reversals.
        // The wider coarse solve keeps the fine texture work local.
        const flowRoi={x0:Math.max(domain.x0,support.x0-36),y0:Math.max(domain.y0,support.y0-36),x1:Math.min(domain.x1,support.x1+36),y1:Math.min(domain.y1,support.y1+36)};
        if(roi.x1<=roi.x0||roi.y1<=roi.y0)return null;
        const flowOptions={dt:dt/pieces,roi:flowRoi,sourceBounds:support,h:4,spatialStep:1.5,
          massScale,time0:time-dt+dt*(piece-1)/pieces,time1:time-dt+dt*fraction,retainedFractionAt,
          move:(k,dx,dy)=>move(before,after,k,dx,dy)};
        let result,projection;
        const gpu=covered?getGpuBackend?.():null;
        if(gpu?.isAvailable&&gpu.supports(beforeState,state)){
          try{
            const started=performance.now();
            const prepared=flow.prepare(before,after,{...flowOptions,oldState:beforeState,nextState:state});
            cursorStageMs.prepare=performance.now()-started;
            prepared.fineROI=roi;
            const encodeStarted=performance.now();
            gpu.uploadParticles(particles);
            gpu.enqueuePreparedFlow(prepared,{projectAfter:true,finePasses:2});
            cursorStageMs.uploadEncode=performance.now()-encodeStarted;
            const readStarted=performance.now();
            const updated=await gpu.submitAndRead();
            cursorStageMs.submitRead=performance.now()-readStarted;
            particles.set(updated);
            result={...prepared.stats,ms:performance.now()-started,backend:'webgpu-cursor',
              gpuTimings:gpu.lastTimings?{...gpu.lastTimings}:undefined};
            projection={projected:0,maxCorrection:0,backend:'webgpu-cursor'};
          }catch(error){
            // Upload/dispatch/readback never mutates this CPU state. Re-run the
            // same piece on CPU after disabling a failed device/backend.
            gpu.disable(error);
            console.warn('Govern cursor transport fell back to CPU:',error);
          }
        }
        if(!result){
          // The GPU consumes the sampled fields directly. Build CPU segment
          // certificates only if this piece actually uses the CPU integrator.
          ensureFluidBounds(before,beforeState);ensureFluidBounds(after,state);
          result=flow.apply(particles,source,before,after,flowOptions);
          projection=projectResidual(after,covered?null:support);
          if(correctTexture)await correctTexture(state,after,roi,massScale);
        }
        // Each emitted state is geometrically feasible. This is the same
        // residual boundary correction used after the global physical solve.
        cursorStageMs.total=performance.now()-pieceStarted;
        results.push({...result,cursor:true,projection,cursorStageMs});
        if(onFrame&&covered){
          await onFrame({time:time-dt+dt*fraction,particles,state});
        }
        // A newer pointer supersedes the remaining trajectory only after this
        // material state is feasible and its local density is corrected.
        if(covered&&shouldInterrupt?.())return {covered,pieces:piece,results,
          interrupted:true,state,time:time-dt+dt*fraction,fraction};
        beforeState=state;before=after;
      }
      return {covered,pieces,results};
    },
  };
}
