import {prepareMeasuredPocketDensity} from './measured-pocket-density.js';
// Optional apply({pocketOnly:true}) isolates the retention-loss source.
// Use the physical fluid operator and unchanged Moser integrator. The original
// coarse engine handles physical wall displacement later. This is approximate
// operator splitting and requires full-cycle visual validation before release.
// A compact ROI still needs a receiving-fluid margin and boundary-seam checks.
/** Diagnostic finite-volume predictor for moving implicit white boundaries.
 * Positive sampler values are white. The solve transports the fluid displaced
 * by this step's boundary motion, before any point is projected onto that wall.
 */
export function createMovingWallFlow(referenceAt=()=>1,pcgBackend=null){
  const potentialCache=new Map();
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const segment=(a,b)=>a<=0?(b<=0?1:-a/(b-a)):(b<=0?-b/(a-b):0);
  function triangle(a,b,c){
    // Exact linear triangle fluid fraction without per-cell arrays.
    if(a<=0){
      if(b<=0)return c<=0?1:1-c*c/((c-a)*(c-b));
      return c<=0?1-b*b/((b-a)*(b-c)):a*a/((a-b)*(a-c));
    }
    if(b>0)return c>0?0:c*c/((c-a)*(c-b));
    return c>0?b*b/((b-a)*(b-c)):1-a*a/((a-b)*(a-c));
  }
  function apply(particles,source,oldSampler,nextSampler,options={}){
    const started=performance.now(),h=options.h??.5,dt=options.dt??.1;
    const box=options.roi;
    if(!box||!(h>0))throw new Error('Moving-wall flow requires ROI and positive spacing');
    const x0=Math.floor(box.x0/h)*h,y0=Math.floor(box.y0/h)*h;
    const nx=Math.max(4,Math.ceil((box.x1-x0)/h)),ny=Math.max(4,Math.ceil((box.y1-y0)/h)),n=nx*ny;
    const fnx=nx*2+1,fny=ny*2+1;
    const before=oldSampler.evaluateGrid(x0,y0,h*.5,fnx,fny);
    const after=nextSampler.evaluateGrid(x0,y0,h*.5,fnx,fny),rasterEnd=performance.now();
    const theta0=new Float64Array(n),theta1=new Float64Array(n),rho=new Float64Array(n);
    const fractionAt=options.retainedFractionAt??(()=>1),time0=options.time0??0,time1=options.time1??time0+dt;
    const active=new Uint8Array(n),rhs=new Float64Array(n),phi=new Float64Array(n);
    const right=new Float64Array(n),down=new Float64Array(n),diag=new Float64Array(n);
    let sourceVolume=0,positiveVolume=0,negativeVolume=0,wallSourceMass=0,extraSourceMass=0,isolatedCellSource=0;
    function cellFraction(grid,i,j){
      const a=2*j*fnx+2*i,b=a+2,c=a+2*fnx,d=c+2,center=a+fnx+1;
      return .25*(triangle(grid[a],grid[b],grid[center])+triangle(grid[b],grid[d],grid[center])+triangle(grid[d],grid[c],grid[center])+triangle(grid[c],grid[a],grid[center]));
    }
    function aperture(grid,a,stride){return .5*(segment(grid[a],grid[a+stride])+segment(grid[a+stride],grid[a+2*stride]));}
    let measured=null;
    if(options.measuredPocketCorrection){
      const rightAperture=new Float64Array(n),downAperture=new Float64Array(n);
      for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
        const k=j*nx+i;theta0[k]=cellFraction(before,i,j);theta1[k]=cellFraction(after,i,j);
        if(i<nx-1)rightAperture[k]=aperture(before,2*j*fnx+2*(i+1),fnx);
        if(j<ny-1)downAperture[k]=aperture(before,2*(j+1)*fnx+2*i,1);
      }
      measured=prepareMeasuredPocketDensity({particles,source,roi:box,h,sampler:nextSampler,referenceAt,massScale:options.massScale??1,
        pockets:options.measuredPocketCorrection.pockets,time:options.measuredPocketCorrection.time,
        grid:{x0,y0,h,nx,ny,theta:theta0,rightAperture,downAperture}});
      if(!measured.shouldApply)return {densityCorrection:measured.stats,totalResidual:measured.totalResidual,skipped:true,moved:0,maxMove:0,ms:performance.now()-started};
    }
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
      const k=j*nx+i;
      if(!measured){theta0[k]=cellFraction(before,i,j);theta1[k]=cellFraction(after,i,j);}
      const px=x0+(i+.5)*h,py=y0+(j+.5)*h;
      const baseDensity=Math.max(1e-5,referenceAt(px,py)*(options.massScale??1));
      const retain0=fractionAt(px,py,time0),retain1=fractionAt(px,py,time1);
      rho[k]=measured?Math.max(1e-5,(measured.rho0[k]+measured.rho1[k])*.5):baseDensity*Math.max(1e-5,(retain0+retain1)*.5);
      active[k]=Math.max(theta0[k],theta1[k])>1e-7&&i>0&&i<nx-1&&j>0&&j<ny-1?1:0;
      const volume=(theta0[k]-theta1[k])*h*h;
      if(active[k]){
        const extra=options.sourceAt?.(x0+(i+.5)*h,y0+(j+.5)*h,{theta0:theta0[k],theta1:theta1[k],rho:rho[k],h,dt})??0;
        if(!Number.isFinite(extra))throw new Error('Moving-wall sourceAt must return finite mass per step');
        // Product decomposition: thetaMid * delta(retain) exports only the
        // future-pocket target. retainMid * delta(theta), the physical wall
        // source, stays with the existing coarse physical transport in this mode.
        // The sequential transports are an approximation, not full-flow parity.
        const retentionVolume=(theta0[k]+theta1[k])*.5*(retain0-retain1)*h*h;
        const retainedVolume=options.pocketOnly?retentionVolume:(theta0[k]*retain0-theta1[k]*retain1)*h*h;
        rhs[k]=measured?measured.massDelta[k]:retainedVolume*baseDensity+extra;
        if(measured)extraSourceMass+=rhs[k];
        else if(options.pocketOnly)extraSourceMass+=retainedVolume*baseDensity+extra;
        else{wallSourceMass+=volume*baseDensity;extraSourceMass+=(retainedVolume-volume)*baseDensity+extra;}
        sourceVolume+=volume;positiveVolume+=Math.max(0,volume);negativeVolume+=Math.min(0,volume);
      }
    }
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
      const k=j*nx+i;
      if(i<nx-1){
        const p=2*j*fnx+2*(i+1),a=aperture(before,p,fnx),b=aperture(after,p,fnx);
        right[k]=(options.faceMode==='current'?a:(a+b)*.5)*(rho[k]+rho[k+1])*.5;
      }
      if(j<ny-1){
        const p=2*(j+1)*fnx+2*i,a=aperture(before,p,1),b=aperture(after,p,1);
        down[k]=(options.faceMode==='current'?a:(a+b)*.5)*(rho[k]+rho[k+nx])*.5;
      }
    }
    const ids=[];
    for(let j=1;j<ny-1;j++)for(let i=1;i<nx-1;i++){
      const k=j*nx+i;if(!active[k])continue;
      diag[k]=right[k-1]+right[k]+down[k-nx]+down[k];
      if(diag[k]>1e-12)ids.push(k);else{isolatedCellSource+=Math.abs(rhs[k]);active[k]=0;rhs[k]=0;}
    }
    // Closed components cannot exchange volume. Record that unsatisfied source
    // instead of allowing an incompatible Neumann system to diverge silently.
    const seen=new Uint8Array(n),queue=new Int32Array(n);
    let sealedComponentSource=0,sealedComponents=0;
    const sealedComponentDetails=[];
    for(const start of ids){
      if(seen[start])continue;
      let head=0,tail=1,sum=0,open=false,area0=0,area1=0,mass0=0,mass1=0;
      let minI=nx,maxI=0,minJ=ny,maxJ=0;queue[0]=start;seen[start]=1;
      while(head<tail){
        const k=queue[head++],i=k%nx,j=(k/nx)|0;sum+=rhs[k];
        area0+=theta0[k]*h*h;area1+=theta1[k]*h*h;
        mass0+=theta0[k]*rho[k]*h*h;mass1+=theta1[k]*rho[k]*h*h;
        minI=Math.min(minI,i);maxI=Math.max(maxI,i);minJ=Math.min(minJ,j);maxJ=Math.max(maxJ,j);
        for(let direction=0;direction<4;direction++){
          const j=direction===0?k-1:direction===1?k+1:direction===2?k-nx:k+nx;
          const w=direction===0?right[k-1]:direction===1?right[k]:direction===2?down[k-nx]:down[k];
          if(w<=1e-12)continue;
          if(!active[j]){open=true;continue;}
          if(!seen[j]){seen[j]=1;queue[tail++]=j;}
        }
      }
      if(!open){
        sealedComponents++;sealedComponentSource+=Math.abs(sum);
        sealedComponentDetails.push({cells:tail,area0,area1,mass0,mass1,source:sum,
          bounds:{x0:x0+minI*h,y0:y0+minJ*h,x1:x0+(maxI+1)*h,y1:y0+(maxJ+1)*h}});
        const mean=sum/tail;for(let index=0;index<tail;index++)rhs[queue[index]]-=mean;
      }
    }
    function matrix(input,out){
      for(const k of ids)out[k]=diag[k]*input[k]-right[k-1]*input[k-1]-right[k]*input[k+1]-down[k-nx]*input[k-nx]-down[k]*input[k+nx];
    }
    const assembleEnd=performance.now();
    function solveJs(){
    const r=rhs.slice(),z=new Float64Array(n),p=new Float64Array(n),ap=new Float64Array(n);
    // IC(0) for the five-point SPD cut-cell operator: incomplete LDL^T with
    // the original west/north sparsity. This addresses slow global/neck modes
    // while retaining the exact matrix and its volume sources.
    const factorD=new Float64Array(n),factorL=new Float64Array(n),factorU=new Float64Array(n),forward=new Float64Array(n);
    let factorClamped=0;
    if(options.preconditioner!=='jacobi')for(const k of ids){
      const left=active[k-1]?-right[k-1]/factorD[k-1]:0;
      const up=active[k-nx]?-down[k-nx]/factorD[k-nx]:0;
      factorL[k]=left;factorU[k]=up;
      const d=diag[k]-left*left*factorD[k-1]-up*up*factorD[k-nx];
      const floor=Math.max(1e-20,diag[k]*1e-9);
      if(d<floor)factorClamped++;
      factorD[k]=Math.max(floor,d);
    }
    function precondition(input,out){
      if(options.preconditioner==='jacobi'){for(const k of ids)out[k]=input[k]/diag[k];return;}
      for(const k of ids)forward[k]=input[k]-factorL[k]*forward[k-1]-factorU[k]*forward[k-nx];
      for(let index=ids.length-1;index>=0;index--){
        const k=ids[index];
        out[k]=forward[k]/factorD[k]-factorL[k+1]*out[k+1]-factorU[k+nx]*out[k+nx];
      }
    }
    let norm2=0;for(const k of ids)norm2+=rhs[k]*rhs[k];
    const cacheKey=[x0,y0,nx,ny,h,options.faceMode??'average',options.pocketOnly?'pocket':'wall',measured?'measured':'prescribed'].join(',');
    const cached=options.warmStart===false?null:potentialCache.get(cacheKey);
    let warmAccepted=false,warmInitialRelativeResidual=1,warmScale=1;
    if(cached&&cached.phi.length===n&&cached.dt>0){
      warmScale=dt/cached.dt;
      // Newly solid cells retain zero potential; only the current unknowns
      // inherit a prediction from the previous step's volume displacement.
      for(const k of ids)phi[k]=cached.phi[k]*warmScale;
      matrix(phi,ap);let warmNorm2=0;
      for(const k of ids){r[k]=rhs[k]-ap[k];warmNorm2+=r[k]*r[k];}
      warmInitialRelativeResidual=Math.sqrt(warmNorm2/Math.max(1e-30,norm2));
      if(Number.isFinite(warmNorm2)&&warmNorm2<=norm2)warmAccepted=true;
      else{phi.fill(0);r.set(rhs);}
    }
    let rz=0,initialNorm2=0;
    precondition(r,z);
    for(const k of ids){p[k]=z[k];rz+=r[k]*z[k];initialNorm2+=r[k]*r[k];}
    let residual=Math.sqrt(initialNorm2),iterations=0;
    // A good warm guess must not tighten the requested relative accuracy.
    const tolerance=(options.tolerance??.005)*Math.max(1e-12,Math.sqrt(norm2));
    for(;iterations<(options.iterations??120)&&residual>tolerance;iterations++){
      matrix(p,ap);let den=0;for(const k of ids)den+=p[k]*ap[k];
      if(!(den>1e-24))break;
      const alpha=rz/den;let nextRz=0,nextNorm=0;
      for(const k of ids){phi[k]+=alpha*p[k];r[k]-=alpha*ap[k];nextNorm+=r[k]*r[k];}
      precondition(r,z);for(const k of ids)nextRz+=r[k]*z[k];
      const beta=nextRz/Math.max(1e-30,rz);rz=nextRz;residual=Math.sqrt(nextNorm);
      for(const k of ids)p[k]=z[k]+beta*p[k];
    }
    if(options.warmStart!==false&&ids.every(k=>Number.isFinite(phi[k]))){
      potentialCache.delete(cacheKey);potentialCache.set(cacheKey,{phi,dt});
      while(potentialCache.size>8)potentialCache.delete(potentialCache.keys().next().value);
    }
      return {factorClamped,norm2,cached,warmAccepted,warmInitialRelativeResidual,warmScale,residual,iterations};
    }
    function solveWasm(){
      const cacheKey=[x0,y0,nx,ny,h,options.faceMode??'average',options.pocketOnly?'pocket':'wall',measured?'measured':'prescribed'].join(',');
      const cached=options.warmStart===false?null:potentialCache.get(cacheKey);
      const warmAvailable=!!(cached&&cached.phi.length===n&&cached.dt>0);
      const warmScale=warmAvailable?dt/cached.dt:1;
      if(warmAvailable)phi.set(cached.phi);
      const result=pcgBackend.solve({nx,active,ids,right,down,diag,rhs,phi,warmAvailable,warmScale,
        maxIterations:options.iterations??120,tolerance:options.tolerance??.005,preconditioner:options.preconditioner??'ic0'});
      if(options.warmStart!==false&&result.finitePotential){
        potentialCache.delete(cacheKey);potentialCache.set(cacheKey,{phi,dt});
        while(potentialCache.size>8)potentialCache.delete(potentialCache.keys().next().value);
      }
      return {...result,cached,warmScale};
    }
    let solved=null,backendType='js-f64-ic0',backendFallbackReason=null;
    if(pcgBackend){
      try{solved=solveWasm();backendType=pcgBackend.backendType??'wasm-f64-ic0';}
      catch(error){
        // No particles have moved yet. Discard any partial output and use the
        // unchanged JS solver, preserving its warm-start guard and f64 operator.
        backendFallbackReason=error?.message??String(error);pcgBackend=null;phi.fill(0);
      }
    }
    if(!solved)solved=solveJs();
    const {factorClamped,norm2,cached,warmAccepted,warmInitialRelativeResidual,warmScale,residual,iterations}=solved;
    const solveEnd=performance.now();
    const vx=new Float64Array(n),vy=new Float64Array(n);
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
      const k=j*nx+i;
      if(i<nx-1&&right[k]>1e-12)vx[k]=(phi[k]-phi[k+1])/h*(rho[k]+rho[k+1])*.5;
      if(j<ny-1&&down[k]>1e-12)vy[k]=(phi[k]-phi[k+nx])/h*(rho[k]+rho[k+nx])*.5;
    }
    function sample(field,faces,fx,fy){
      fx=clamp(fx,0,nx-1.001);fy=clamp(fy,0,ny-1.001);
      const i=fx|0,j=fy|0,u=fx-i,v=fy-j,k=j*nx+i;
      // A closed face has no sampled fluid flux; it is not a zero-flux
      // observation. Normalizing the valid stencil preserves a wall-adjacent
      // material velocity instead of attenuating it into a stationary rim.
      const a=faces[k]>1e-12?(1-u)*(1-v):0,b=faces[k+1]>1e-12?u*(1-v):0;
      const c=faces[k+nx]>1e-12?(1-u)*v:0,d=faces[k+nx+1]>1e-12?u*v:0;
      const sum=a+b+c+d;
      return sum>1e-12?(a*field[k]+b*field[k+1]+c*field[k+nx]+d*field[k+nx+1])/sum:0;
    }
    let moved=0,maxMove=0,maxUncappedMove=0,capped=0,actualMaxMove=0,clippedMoves=0,clippedDistance=0,wallNormalApplied=0,maxWallNormalCorrection=0;
    let advectionSubsteps=0,maxSubsteps=0,exhaustedParticles=0,maxIntegrationStep=0;
    const nearWall=new Uint8Array(n);
    for(let j=1;j<ny-1;j++)for(let i=1;i<nx-1;i++){
      const k=j*nx+i;
      if((theta0[k]>1e-7&&theta0[k]<1-1e-7)||(theta1[k]>1e-7&&theta1[k]<1-1e-7)||Math.abs(theta0[k]-theta1[k])>1e-7){
        for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++)nearWall[k+oy*nx+ox]=1;
      }
    }
    const velocityScratch={dx:0,dy:0,timeLimit:Infinity};
    function velocity(x,y,tau){
      const fx=(x-x0)/h,fy=(y-y0)/h;
      let dx=sample(vx,right,fx-1,fy-.5),dy=sample(vy,down,fx-.5,fy-1);
      // Reconstruct the solved mass flux, then divide by density at this
      // material point. Interpolating velocity first would mix large gradients
      // from nearly empty cells into adjacent fluid across the target edge.
      const retain0=fractionAt(x,y,time0),retain1=fractionAt(x,y,time1);
      const baseDensity=Math.max(1e-5,referenceAt(x,y)*(options.massScale??1));
      const density0=measured?measured.rho0At(x,y):baseDensity*retain0;
      const density1=measured?measured.rho1At(x,y):baseDensity*retain1;
      const pointDensity=measured?Math.max(1e-5,(1-tau)*density0+tau*density1):baseDensity*Math.max(1e-5,(1-tau)*retain0+tau*retain1);
      dx/=pointDensity;dy/=pointDensity;
      const ci=Math.floor(fx),cj=Math.floor(fy);
      if(!options.pocketOnly&&options.wallNormal!==false&&oldSampler.evaluate&&nextSampler.evaluate&&ci>=0&&ci<nx&&cj>=0&&cj<ny&&nearWall[cj*nx+ci]){
        const a=oldSampler.evaluate(x,y),b=nextSampler.evaluate(x,y),complement=1-tau;
        const nx0=complement*a.gradient*a.nx+tau*b.gradient*b.nx,ny0=complement*a.gradient*a.ny+tau*b.gradient*b.ny;
        const mag=Math.hypot(nx0,ny0),gap=-(complement*a.value+tau*b.value)/Math.max(1e-9,mag);
        if(mag>.01&&gap>=-.05*h&&gap<h){
          const ux=nx0/mag,uy=ny0/mag,qx=x-ux*gap,qy=y-uy*gap;
          const oldWall=oldSampler.evaluate(qx,qy),nextWall=nextSampler.evaluate(qx,qy);
          const normalGradient=complement*oldWall.gradient*(oldWall.nx*ux+oldWall.ny*uy)+tau*nextWall.gradient*(nextWall.nx*ux+nextWall.ny*uy);
          if(normalGradient>.01){
            // Material follows the moving implicit wall at this integration
            // time; its normal speed is dF/dtau divided by |grad F|.
            const vn=(nextWall.value-oldWall.value)/normalGradient;
            const correction=(vn-(dx*ux+dy*uy))*Math.min(1,1-gap/h);
            dx+=correction*ux;dy+=correction*uy;
            wallNormalApplied++;maxWallNormalCorrection=Math.max(maxWallNormalCorrection,Math.abs(correction));
          }
        }
      }
      velocityScratch.dx=dx;velocityScratch.dy=dy;
      // A slow point near the pressure maximum must still sample the rapid
      // late-time acceleration as prescribed density tends to zero.
      velocityScratch.timeLimit=measured?(density1<density0?.25*Math.max(1e-8,(1-tau)*density0+tau*density1)/(density0-density1):Infinity):(retain1<retain0?.25*Math.max(1e-8,(1-tau)*retain0+tau*retain1)/(retain0-retain1):Infinity);
      return velocityScratch;
    }
    const move=options.move??((k,dx,dy)=>{particles[k]+=dx;particles[k+1]+=dy;});
    const spatialStep=options.spatialStep??h*.5;
    for(let k=0;k<particles.length;k+=3){
      const startX=particles[k],startY=particles[k+1];
      if(startX<=x0+h||startX>=x0+(nx-1)*h||startY<=y0+h||startY>=y0+(ny-1)*h)continue;
      let tau=0,substeps=0,travelled=0;
      while(tau<1-1e-9&&substeps<512){
        const x=particles[k],y=particles[k+1],first=velocity(x,y,tau),ux=first.dx,uy=first.dy,speed=Math.hypot(ux,uy);
        maxUncappedMove=Math.max(maxUncappedMove,speed);
        if(speed<1e-9){tau=1;break;}
        let fraction=Math.min(1-tau,spatialStep/speed,first.timeLimit),dx=0,dy=0;
        // Midpoint integration consumes physical time, never discards a fast
        // flux. Halving only controls numerical spatial travel near a neck.
        for(let attempt=0;attempt<16;attempt++){
          const middle=velocity(x+ux*fraction*.5,y+uy*fraction*.5,tau+fraction*.5);
          dx=middle.dx*fraction;dy=middle.dy*fraction;
          maxUncappedMove=Math.max(maxUncappedMove,Math.hypot(middle.dx,middle.dy));
          if(Math.hypot(dx,dy)<=spatialStep*1.2||fraction<1e-8)break;
          fraction*=.5;
        }
        move(k,dx,dy);
        const actual=Math.hypot(particles[k]-x,particles[k+1]-y),clipped=Math.hypot(particles[k]-x-dx,particles[k+1]-y-dy);
        if(clipped>1e-4){clippedMoves++;clippedDistance+=clipped;}
        maxIntegrationStep=Math.max(maxIntegrationStep,actual);travelled+=actual;
        tau+=fraction;substeps++;
      }
      if(tau<1-1e-9)exhaustedParticles++;
      advectionSubsteps+=substeps;maxSubsteps=Math.max(maxSubsteps,substeps);
      const displacement=Math.hypot(particles[k]-startX,particles[k+1]-startY);
      if(travelled>1e-8){moved++;maxMove=Math.max(maxMove,displacement);actualMaxMove=Math.max(actualMaxMove,displacement);}
    }
    return {densityCorrection:measured?.stats,totalResidual:measured?.totalResidual,pocketOnly:!!options.pocketOnly,applied:moved,moved,maxMove,actualMaxMove,maxUncappedMove,capped,clippedMoves,clippedDistance,wallNormalApplied,maxWallNormalCorrection,advectionSubsteps,maxSubsteps,exhaustedParticles,maxIntegrationStep,sourceVolume,positiveVolume,negativeVolume,wallSourceMass,extraSourceMass,isolatedCellSource,sealedComponents,sealedComponentSource,sealedComponentDetails,
      backendType,backendFallbackReason,preconditioner:options.preconditioner==='jacobi'?'jacobi':'ic0',factorClamped,
      warmStart:{available:!!cached,accepted:warmAccepted,initialRelativeResidual:warmInitialRelativeResidual,scale:warmScale,cacheEntries:potentialCache.size},
      residual:residual/Math.max(1e-12,Math.sqrt(norm2)),iterations,cells:n,activeCells:ids.length,stageMs:{raster:rasterEnd-started,assemble:assembleEnd-rasterEnd,solve:solveEnd-assembleEnd,advect:performance.now()-solveEnd},ms:performance.now()-started};
  }
  return {apply,reset(){potentialCache.clear();}};
}
