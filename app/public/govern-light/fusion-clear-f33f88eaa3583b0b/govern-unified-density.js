import {createForecastAreaSolver} from './forecast-area.js';
import {levelSetArea} from './level-set-area.js';
/** Experimental Govern transport. All particles retain their source ID and radius.
 * The white geometry is one smooth level set; a mass-continuity pressure field
 * moves particle centres into newly exposed regions and out of advancing ones.
 * This module is deliberately outside the live gallery.
 */
import {evaluateImplicitState,createImplicitEvaluator,metaballMixForApprovedPhase,metaballMixAt} from './govern-implicit-sdf.js';
import {routeClosingPocket} from './topology-rescue.js';
import {detectClosingPocket,triangleFluidArea} from './topology-hazard.js';
import {applyPairOffsetsForFusion,pairMetaballMixesForFusion} from './govern-pair-offsets.js';
import {createPnormAreaQuotaSolver} from './govern-area-quota-pnorm.js';
import {createParticleMotion} from './particleMotion-fast.js';
import {createParticleSpacing} from './particle-spacing.js';
import {createFineDensity} from './fine-density.js';
import {createWhiteBounds} from './white-bounds.js';

const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const GRID={x0:-40,y0:-40,h:3,nx:228,ny:178};
const GN=GRID.nx*GRID.ny;

function createIndependentPositions(source){
  const groups=[],assigned=new Set();
  for(const ids of [[6,8],[30,31]]){groups.push({ids});for(const id of ids)assigned.add(id);}
  source.forEach((_,i)=>{if(!assigned.has(i))groups.push({ids:[i]});});
  groups.forEach((g,i)=>{
    g.x=g.ids.reduce((v,j)=>v+source[j].x,0)/g.ids.length;
    g.y=g.ids.reduce((v,j)=>v+source[j].y,0)/g.ids.length;
    const p=i*2.39996323;g.vx=25*Math.cos(p)+5*Math.sin(g.y*.009);g.vy=23*Math.sin(p)+4*Math.cos(g.x*.008);
  });
  const mx=groups.reduce((v,g)=>v+g.vx,0)/groups.length,my=groups.reduce((v,g)=>v+g.vy,0)/groups.length;
  groups.forEach(g=>{g.vx-=mx;g.vy-=my;});
  return q=>{
    const p=groups.map(g=>({x:g.x+q*g.vx,y:g.y+q*g.vy}));
    // Follow the independent paths through contact. Separation constraints here
    // would prevent the common implicit field from joining neighbouring holes.
    // Their merger and split are determined by that field, never by repulsion.
    const circles=source.map(h=>({...h}));
    groups.forEach((g,gi)=>{for(const id of g.ids){circles[id].x+=p[gi].x-g.x;circles[id].y+=p[gi].y-g.y;}});
    return circles;
  };
}

function deposit(grid,x,y,mass){
  const {x0,y0,h,nx,ny}=GRID;
  const gx=clamp((x-x0)/h,0,nx-1.001),gy=clamp((y-y0)/h,0,ny-1.001),ix=gx|0,iy=gy|0,fx=gx-ix,fy=gy-iy,k=iy*nx+ix;
  grid[k]+=mass*(1-fx)*(1-fy);grid[k+1]+=mass*fx*(1-fy);
  grid[k+nx]+=mass*(1-fx)*fy;grid[k+nx+1]+=mass*fx*fy;
}
function blur(grid,scratch,passes){
  const {nx,ny}=GRID;
  for(let n=0;n<passes;n++){
    scratch.set(grid);
    for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){const k=y*nx+x;grid[k]=(scratch[k-1]+2*scratch[k]+scratch[k+1])*.25;}
    scratch.set(grid);
    for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){const k=y*nx+x;grid[k]=(scratch[k-nx]+2*scratch[k]+scratch[k+nx])*.25;}
  }
}
function interpolate(grid,x,y){
  const {x0,y0,h,nx,ny}=GRID,gx=clamp((x-x0)/h,0,nx-1.001),gy=clamp((y-y0)/h,0,ny-1.001);
  const ix=gx|0,iy=gy|0,fx=gx-ix,fy=gy-iy,k=iy*nx+ix;
  return (grid[k]*(1-fx)+grid[k+1]*fx)*(1-fy)+(grid[k+nx]*(1-fx)+grid[k+nx+1]*fx)*fy;
}

/** High-frequency pressure on a one-pixel grid. The 3 px continuity solve
 * conserves the cloud's mass but cannot see narrow empty filaments between
 * compressed grain rows. This correction acts only well clear of cavities. */
function createMicroRelaxer(reference){
  const x0=-40,y0=-40,nx=684,ny=534,n=nx*ny;
  const ink=new Float32Array(n),scratch=new Float32Array(n),desired=new Float32Array(n),gx=new Float32Array(n),gy=new Float32Array(n);
  function at(grid,x,y){
    const fx=clamp(x-x0,0,nx-1.001),fy=clamp(y-y0,0,ny-1.001),ix=fx|0,iy=fy|0,u=fx-ix,v=fy-iy,k=iy*nx+ix;
    return (grid[k]*(1-u)+grid[k+1]*u)*(1-v)+(grid[k+nx]*(1-u)+grid[k+nx+1]*u)*v;
  }
  for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++)desired[y*nx+x]=interpolate(reference,x+x0,y+y0)/9;
  function apply(particles,source,coarseDistance,coarseW,strength){
    const t0=performance.now();ink.fill(0);
    for(let k=0;k<particles.length;k+=3){
      const x=clamp(particles[k]-x0,0,nx-1.001),y=clamp(particles[k+1]-y0,0,ny-1.001),ix=x|0,iy=y|0,u=x-ix,v=y-iy,j=iy*nx+ix,m=source[k+2]*source[k+2];
      ink[j]+=m*(1-u)*(1-v);ink[j+1]+=m*u*(1-v);ink[j+nx]+=m*(1-u)*v;ink[j+nx+1]+=m*u*v;
    }
    for(let pass=0;pass<2;pass++){
      scratch.set(ink);
      for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){const k=y*nx+x;ink[k]=.25*(scratch[k-1]+2*scratch[k]+scratch[k+1]);}
      scratch.set(ink);
      for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){const k=y*nx+x;ink[k]=.25*(scratch[k-nx]+2*scratch[k]+scratch[k+nx]);}
    }
    for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){
      const k=y*nx+x;ink[k]-=desired[k];
    }
    for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){
      const k=y*nx+x;gx[k]=.5*(ink[k+1]-ink[k-1]);gy[k]=.5*(ink[k+nx]-ink[k-nx]);
    }
    let active=0,maxMove=0;
    for(let k=0;k<particles.length;k+=3){
      const x=particles[k],y=particles[k+1];
      if(interpolate(coarseDistance,x,y)<8||interpolate(coarseW,x,y)>.2)continue;
      const target=at(desired,x,y);if(target<.28)continue;
      const gain=strength/Math.max(.25,target);
      let dx=-gain*at(gx,x,y),dy=-gain*at(gy,x,y),len=Math.sqrt(dx*dx+dy*dy);
      if(len>.25){dx*=.25/len;dy*=.25/len;len=.25;}
      particles[k]+=dx;particles[k+1]+=dy;active++;maxMove=Math.max(maxMove,len);
    }
    return{ms:performance.now()-t0,active,maxMove};
  }
  return{apply};
}

/** Inpaint the source cavity depressions before using the source cloud as density reference. */
function referenceDensity(points,holes){
  const ref=new Float64Array(GN),scratch=new Float64Array(GN),unknown=new Uint8Array(GN),active=new Uint8Array(GN);
  let totalMass=0;
  for(const p of points){const mass=p[2]*p[2];deposit(ref,p[0],p[1],mass);totalMass+=mass;}
  blur(ref,scratch,2);
  const {x0,y0,h,nx,ny}=GRID;
  for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){
    const px=x0+x*h,py=y0+y*h,k=y*nx+x;
    for(const c of holes)if(Math.sqrt((px-c.x)**2+(py-c.y)**2)<c.r+8){unknown[k]=1;break;}
  }
  // Neumann-like harmonic extension from the surrounding cloud. Initialising
  // from a broad blur makes the Jacobi fill converge without a cavity imprint.
  const seed=new Float64Array(ref);blur(seed,scratch,9);
  for(let k=0;k<GN;k++)if(unknown[k])ref[k]=seed[k];
  for(let pass=0;pass<150;pass++){
    scratch.set(ref);
    for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){
      const k=y*nx+x;if(unknown[k])ref[k]=(scratch[k-1]+scratch[k+1]+scratch[k-nx]+scratch[k+nx])*.25;
    }
  }
  blur(ref,scratch,5);
  const threshold=totalMass/GN*.001;
  for(let k=0;k<GN;k++)active[k]=ref[k]>threshold?1:0;
  return{ref,active,totalMass,unknown};
}

function createPoisson(options={}){
  const rhs=new Float64Array(GN),phi=new Float64Array(GN),r=new Float64Array(GN),z=new Float64Array(GN),p=new Float64Array(GN),Ap=new Float64Array(GN),diag=new Float64Array(GN),weight=new Float64Array(GN),edgeLeft=new Float64Array(GN),edgeRight=new Float64Array(GN),edgeUp=new Float64Array(GN),edgeDown=new Float64Array(GN),dx=new Float32Array(GN),dy=new Float32Array(GN);
  const previousActive=new Uint8Array(GN);
  const {nx,ny,h}=GRID,invH2=1/(h*h);
  let active,knownMask=null,allActive=null,interiorActive=null,boundaryActive=null;
  function prepareActive(mask){
    if(mask===knownMask&&!options.dynamicFluidMask)return;
    const all=[],interior=[],boundary=[];
    for(let k=0;k<GN;k++)if(mask[k]){
      all.push(k);
      const x=k%nx,y=(k/nx)|0;
      if(x>0&&x<nx-1&&y>0&&y<ny-1)interior.push(k);else boundary.push(k);
    }
    allActive=Uint32Array.from(all);interiorActive=Uint32Array.from(interior);boundaryActive=Uint32Array.from(boundary);knownMask=mask;
  }
  function applyA(input,output){
    for(let i=0;i<boundaryActive.length;i++)output[boundaryActive[i]]=0;
    for(let i=0;i<interiorActive.length;i++){
      const k=interiorActive[i];let sum=0;
      if(edgeLeft[k])sum+=edgeLeft[k]*(input[k]-input[k-1])*invH2;
      if(edgeRight[k])sum+=edgeRight[k]*(input[k]-input[k+1])*invH2;
      if(edgeUp[k])sum+=edgeUp[k]*(input[k]-input[k-nx])*invH2;
      if(edgeDown[k])sum+=edgeDown[k]*(input[k]-input[k+nx])*invH2;
      output[k]=sum;
    }
  }
  function solve(current,target,activeMask,totalMass,maxIterations=70){
    active=activeMask;prepareActive(activeMask);
    const floor=totalMass/GN*.003;let sum=0,count=0;
    for(let k=0;k<GN;k++){
      if(!active[k]||!previousActive[k])phi[k]=0;
      weight[k]=Math.max(floor,(current[k]+target[k])*.5);
      rhs[k]=active[k]?target[k]-current[k]:0;
      if(active[k]){sum+=rhs[k];count++;}
    }
    previousActive.set(active);
    const mean=sum/Math.max(1,count);let norm2=0;
    for(let i=0;i<interiorActive.length;i++){
      const k=interiorActive[i];
      rhs[k]-=mean;norm2+=rhs[k]*rhs[k];let d=0;
      let j=k-1;edgeLeft[k]=active[j]?.5*(weight[k]+weight[j]):0;if(edgeLeft[k])d+=edgeLeft[k]*invH2;
      j=k+1;edgeRight[k]=active[j]?.5*(weight[k]+weight[j]):0;if(edgeRight[k])d+=edgeRight[k]*invH2;
      j=k-nx;edgeUp[k]=active[j]?.5*(weight[k]+weight[j]):0;if(edgeUp[k])d+=edgeUp[k]*invH2;
      j=k+nx;edgeDown[k]=active[j]?.5*(weight[k]+weight[j]):0;if(edgeDown[k])d+=edgeDown[k]*invH2;
      diag[k]=Math.max(1e-12,d);
    }
    applyA(phi,Ap);
    for(let i=0;i<allActive.length;i++){const k=allActive[i];r[k]=rhs[k]-Ap[k];z[k]=r[k]/diag[k];p[k]=z[k];}
    let rz=0;for(let i=0;i<allActive.length;i++){const k=allActive[i];rz+=r[k]*z[k];}
    let iterations=0,residual=Math.sqrt(norm2);
    for(;iterations<maxIterations&&residual>Math.sqrt(norm2)*.005;iterations++){
      applyA(p,Ap);let den=0;for(let i=0;i<allActive.length;i++){const k=allActive[i];den+=p[k]*Ap[k];}
      if(!(den>1e-20))break;const alpha=rz/den;let newRz=0,n2=0;
      for(let i=0;i<allActive.length;i++){const k=allActive[i];
        phi[k]+=alpha*p[k];r[k]-=alpha*Ap[k];z[k]=r[k]/diag[k];newRz+=r[k]*z[k];n2+=r[k]*r[k];
      }
      residual=Math.sqrt(n2);const beta=newRz/Math.max(1e-20,rz);rz=newRz;
      for(let i=0;i<allActive.length;i++){const k=allActive[i];p[k]=z[k]+beta*p[k];}
    }
    dx.fill(0);dy.fill(0);
    for(let i=0;i<interiorActive.length;i++){
      const k=interiorActive[i];
      dx[k]=options.staggeredPressure?(active[k+1]?phi[k+1]-phi[k]:0)/h:((active[k+1]?phi[k+1]:phi[k])-(active[k-1]?phi[k-1]:phi[k]))/(2*h);
      dy[k]=options.staggeredPressure?(active[k+nx]?phi[k+nx]-phi[k]:0)/h:((active[k+nx]?phi[k+nx]:phi[k])-(active[k-nx]?phi[k-nx]:phi[k]))/(2*h);
    }
    return{dx,dy,iterations,residual,initialResidual:Math.sqrt(norm2)};
  }
  return{solve,reset(){phi.fill(0);previousActive.fill(0);}};
}

export function createUnifiedGovern(points,sourceHoles,options={}){
  const count=points.length,source=Float32Array.from(points.flat()),particles=new Float32Array(source),output=new Float32Array(source);
  const independentPositions=createIndependentPositions(sourceHoles),grainMotion=createParticleMotion(points,sourceHoles,{unconstrained:!!options.feasibleTransport});
  const forecastArea=options.areaMode==='global'?createForecastAreaSolver(GRID):null;
  const density=referenceDensity(points,sourceHoles),poisson=options.poissonBackend??createPoisson(options);
  const micro=options.microStrength?createMicroRelaxer(density.ref):null;
  const spacing=options.spacingStrength?createParticleSpacing(count,GRID,density.ref):null;
  const fine=options.fineBackendFactory?options.fineBackendFactory(GRID,density.ref,density.totalMass):(options.fineStrength?createFineDensity(GRID,density.ref,density.totalMass):null);
  const target=new Float64Array(GN),current=new Float64Array(GN),scratch=new Float64Array(GN),W=new Float32Array(GN),powerSum=new Float32Array(GN),pairK=Array.from({length:4},()=>new Float32Array(GN)),distance=new Float32Array(GN),previousDistance=new Float32Array(GN),fluidActive=new Uint8Array(GN),normalX=new Float32Array(GN),normalY=new Float32Array(GN),grainFrame=new Float32Array(source),previousParticles=new Float32Array(source),previousRenderedOutput=new Float32Array(source),previousGrainFrame=new Float32Array(source);
  const radial={};let exactSampler=null,quotaSolver=null,shrinks=new Float64Array(sourceHoles.length),lastSize=NaN,lastRenderTime=NaN,lastTime=0,fixedIndex=0,lastState=null,lastControls=null,uniformShrink=0,sourceAreaCoarse=0,effectiveControls=null,lastInputGeom=null,lastClock={vacancyTime:0,fusionTime:0,grainTime:0},saddleHazardUntil=-Infinity,lastFineBucket=0,closingHazards=[];
  let gpuTransportBackend=null;
  const projectionHits=new Uint16Array(count),crowdedOccupancy=new Uint8Array(1024*640),contactWatchFlags=new Uint8Array(count);let recentlyProjected=[],contactWatch=[];
  const timings=[],stats={steps:0,totalMs:0,maxMs:0,poissonIterations:0,insideBefore:0,insideAfter:0,projected:0,areaError:0,minPressureJacobian:Infinity,negativePressureCells:0,lowPressureCells:0};let lastStep=null,lastOutput=null;
  function makeState(time,controls){
    const q=Math.sin((controls.vacancyTime??time)*.085)*clamp((controls.travel??1.6)/1.6,0,1);
    const positions=independentPositions(q),circles=applyPairOffsetsForFusion(positions,sourceHoles,{fusionTime:controls.fusionTime??time,fusionAmount:controls.fusionAmount??1});
    const size=clamp(controls.whiteSize??1,.25,2),fusionAmount=clamp(controls.fusionAmount??1,0,1);
    const fusionTime=controls.fusionTime??time;
    // Only the initial source geometry needs a transition. Returning to the
    // source position must not turn every neck off and on again.
    const startup=clamp(Math.max(controls.vacancyTime??time,fusionTime)*.085/.05,0,1);
    const fusionMix=fusionAmount*startup**3*(10+startup*(-15+6*startup));
    // The same spatial contact rule applies to all holes. The original pairs
    // retain their approved centre paths, not a special forced neck shape.
    const pairMixes=[fusionMix,fusionMix];
    if(size!==lastSize){
      if(options.areaMode!=='global'){
        const sourceSized=sourceHoles.map(h=>({...h,r:h.r*size}));quotaSolver=createPnormAreaQuotaSolver(sourceSized,{step:options.quotaStep??1});
      }
      if(options.areaMode==='global'&&Number.isFinite(lastSize))uniformShrink*=size/lastSize;
      else uniformShrink=0;
      shrinks=new Float64Array(sourceHoles.length);shrinks.fill(uniformShrink);lastSize=size;
      sourceAreaCoarse=NaN;
    }
    const sized=circles.map(h=>({...h,r:h.r*size}));
    const quota=options.areaMode==='global'?{area:NaN,maxQuotaError:NaN,iterations:0}:quotaSolver.solve(sized,{shrinks,fusionAmount,fusionMix,pairMixes,maxIter:options.quotaIterations??(Math.abs(q)<.06?4:1),tolerance:.004});
    stats.areaError=quota.maxQuotaError;
    return{circles,sized,shrinks,whiteSize:size,fusionAmount,fusionMix,pairMixes,q,quota,kernelRatio:options.kernelRatio??.75};
  }
  function makeForecastState(time,controls){
    const prediction=makeState(time,controls);
    return forecastArea?forecastArea.solve(prediction,{sourceArea:sourceAreaCoarse}):prediction;
  }
  const whiteBounds=options.boundsBroadphase?createWhiteBounds(GRID):null;
  function buildTarget(state){
    const {x0,y0,h,nx,ny}=GRID;distance.fill(50);target.fill(0);
    function raster(shape=state,offsets=shrinks){
      const kr=.1+(shape.kernelRatio-.1)*shape.fusionAmount;
      const mix=shape.fusionMix,kind=mix<1e-5?0:mix>1-1e-5?1:2,power=kind===2?1/mix:0;
      function addContribution(p,value){
      if(kind===0)W[p]=Math.max(W[p],value);
      else if(kind===1)W[p]+=value;
      else if(value>W[p]){powerSum[p]=powerSum[p]*Math.pow(W[p]/value,power)+1;W[p]=value;}
      else if(value>0&&W[p]>0)powerSum[p]+=Math.pow(value/W[p],power);
    }
      W.fill(0);powerSum.fill(0);for(const p of pairK)p.fill(0);
    for(let i=0;i<shape.sized.length;i++){
      const c=shape.sized[i],R=c.r-offsets[i],reach=R+1.5*c.r,L=1.5*c.r,kappa=kr*c.r;
      const ix0=clamp(Math.floor((c.x-reach-x0)/h),0,nx-1),ix1=clamp(Math.ceil((c.x+reach-x0)/h),0,nx-1);
      const iy0=clamp(Math.floor((c.y-reach-y0)/h),0,ny-1),iy1=clamp(Math.ceil((c.y+reach-y0)/h),0,ny-1);
      for(let iy=iy0;iy<=iy1;iy++){
        const py=y0+iy*h,dy=py-c.y,row=iy*nx;
        for(let ix=ix0;ix<=ix1;ix++){
          const px=x0+ix*h,dx=px-c.x,d=Math.sqrt(dx*dx+dy*dy)-R;if(d>=L)continue;
          const u=Math.max(0,d/L),u2=u*u,u3=u2*u,G=1-10*u3+15*u3*u-6*u3*u2;
          const value=Math.exp(-d/kappa)*G,p=row+ix;
          const pairSlot=i===6?0:i===8?1:i===30?2:i===31?3:-1;
          if(pairSlot>=0)pairK[pairSlot][p]=value;
          else addContribution(p,value);
        }
      }
    }
    for(let pair=0;pair<2;pair++){
      const A=pairK[pair*2],B=pairK[pair*2+1],inner=shape.pairMixes[pair];
      for(let p=0;p<GN;p++){
        const hi=Math.max(A[p],B[p]),lo=Math.min(A[p],B[p]);if(hi<=0)continue;
        const value=inner<=1e-5?hi:inner>=1-1e-5?hi+lo:hi*Math.pow(1+Math.pow(lo/hi,1/inner),inner);
        addContribution(p,value);
      }
    }
    if(kind===2)for(let p=0;p<GN;p++)if(W[p]>0)W[p]*=Math.pow(powerSum[p],mix);
    return levelSetArea(W,nx,ny,h);
    }
    if(!Number.isFinite(sourceAreaCoarse)){
      sourceAreaCoarse=raster({...state,sized:sourceHoles.map(c=>({...c,r:c.r*state.whiteSize})),fusionMix:0,pairMixes:[0,0]},new Float64Array(sourceHoles.length));
    }
    let area=raster();
    if(options.areaMode==='global'){
      const passes=options.globalAreaPasses??2,perimeter=3600*state.whiteSize;
      for(let pass=0;pass<passes;pass++){
        const error=area-sourceAreaCoarse;if(Math.abs(error)<.5)break;
        uniformShrink=clamp(uniformShrink+error/perimeter,-4,5);
        shrinks.fill(uniformShrink);area=raster();
      }
      state.quota={area,maxQuotaError:Math.abs(area-sourceAreaCoarse)/sourceAreaCoarse,iterations:passes,uniformShrink,sourceArea:sourceAreaCoarse};
      stats.areaError=state.quota.maxQuotaError;
    }
    if(whiteBounds)whiteBounds.setState(state);
    let capacity=0;
    for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){
      const p=y*nx+x;if(!density.active[p])continue;
      fluidActive[p]=W[p]<1?1:0;
      const gx=(W[p+1]-W[p-1])/(2*h),gy=(W[p+nx]-W[p-nx])/(2*h),mag=Math.sqrt(gx*gx+gy*gy);
      // Exact zero set is W=1; only a one-pixel antialias band is used for
      // pressure. No fixed-width particle collar exists.
      const d=clamp((1-W[p])/Math.max(mag,.05),-20,20);
      distance[p]=d;normalX[p]=mag>1e-6?-gx/mag:0;normalY[p]=mag>1e-6?-gy/mag:0;
      target[p]=density.ref[p]*smooth(.5+d/2.2);capacity+=target[p];
    }
    // The measured particle density is blurred before pressure comparison;
    // the target must pass through the *same* observation kernel. Otherwise
    // particles near a white wall look like phantom mass inside the cavity,
    // and the pressure solver creates a spurious empty collar plus dark ring.
    blur(target,scratch,options.currentBlurPasses??6);
    const scale=density.totalMass/Math.max(1e-8,capacity);
    for(let p=0;p<GN;p++)target[p]*=scale;
    return{capacity,scale,area};
  }
  function depositCurrent(){
    current.fill(0);
    for(let i=0,k=0;i<count;i++,k+=3)deposit(current,particles[k],particles[k+1],source[k+2]*source[k+2]);
    blur(current,scratch,options.currentBlurPasses??6);
  }
  /** Divergence-free dipoles carry material with moving cavities. The F'(0)
   * wall slope gives tangential slip; there is no immobile finite-width band. */
  function advectDipoles(previous,next){
    const gain=options.dipoleStrength??0;if(gain===0)return;
    const countH=sourceHoles.length,fields=new Array(countH);
    for(let i=0;i<countH;i++){
      const a=previous?.circles?.[i]??sourceHoles[i],b=next.circles[i];
      const dx=(b.x-a.x)*gain,dy=(b.y-a.y)*gain;
      const radius=Math.max(2,b.r*next.whiteSize-next.shrinks[i]);
      fields[i]={x:(a.x+b.x)*.5,y:(a.y+b.y)*.5,dx,dy,R:radius,start:radius+25,end:radius+72};
    }
    for(let k=0;k<particles.length;k+=3){
      const x=particles[k],y=particles[k+1];let vx=0,vy=0;
      for(let i=0;i<countH;i++){
        const f=fields[i],rx=x-f.x,ry=y-f.y;
        if(Math.abs(rx)>f.end||Math.abs(ry)>f.end)continue;
        const r=Math.sqrt(rx*rx+ry*ry);if(r>=f.end)continue;
        const re=Math.max(r,f.R*.75),base=f.R*f.R/(re*re);
        let T=1,Tp=0;
        if(r>f.start){const u=(r-f.start)/(f.end-f.start),u2=u*u,u3=u2*u;T=1-10*u3+15*u3*u-6*u3*u2;Tp=-30*u2*(1-u)*(1-u)/(f.end-f.start);}
        const F=base*T,dF=base*(Tp-2*T/re),A=f.dx*ry-f.dy*rx,inv=1/re;
        vx+=f.dx*F+A*dF*ry*inv;
        vy+=f.dy*F-A*dF*rx*inv;
      }
      const len=Math.sqrt(vx*vx+vy*vy),limit=2.5;
      if(len>limit){vx*=limit/len;vy*=limit/len;}
      particles[k]+=vx;particles[k+1]+=vy;
    }
  }
  function advectWithWall(){
    const strength=options.wallAdvectionStrength??0;if(!strength)return null;
    const length=options.wallDecay??8;
    let moved=0,maxMove=0,meanMove=0,advancing=0,receding=0;
    for(let k=0;k<particles.length;k+=3){
      const x=particles[k],y=particles[k+1],before=interpolate(previousDistance,x,y),after=interpolate(distance,x,y);
      if(Math.min(before,after)>16)continue;
      const delta=before-after;if(Math.abs(delta)<1e-4)continue;
      const nx=interpolate(normalX,x,y),ny=interpolate(normalY,x,y),n=Math.sqrt(nx*nx+ny*ny);
      if(n<.1)continue;
      const move=clamp(strength*delta*Math.exp(-Math.max(0,before)/length),-1.5,1.5);
      particles[k]+=nx/n*move;particles[k+1]+=ny/n*move;
      moved++;maxMove=Math.max(maxMove,Math.abs(move));meanMove+=Math.abs(move);
      if(move>0)advancing++;else receding++;
    }
    return{moved,maxMove,meanMove:meanMove/Math.max(1,moved),advancing,receding};
  }
  function feasibleMove(k,dx,dy){
    if(Math.abs(dx)+Math.abs(dy)<1e-8)return;
    const length2=dx*dx+dy*dy,n=length2<=.25?1:Math.ceil(Math.sqrt(length2)/.5);
    dx/=n;dy/=n;
    for(let j=0;j<n;j++){
      const x=particles[k],y=particles[k+1],toX=x+dx,toY=y+dy;
      const gx=clamp((toX-GRID.x0)/GRID.h,0,GRID.nx-1.001),gy=clamp((toY-GRID.y0)/GRID.h,0,GRID.ny-1.001),ix=gx|0,iy=gy|0,p=iy*GRID.nx+ix;
      if(W[p]<.25&&W[p+1]<.25&&W[p+GRID.nx]<.25&&W[p+GRID.nx+1]<.25){particles[k]=toX;particles[k+1]=toY;continue;}
      if(interpolate(W,toX,toY)<.25){particles[k]=toX;particles[k+1]=toY;continue;}
      if(whiteBounds?.segmentOutside(x,y,toX,toY)){particles[k]=toX;particles[k+1]=toY;continue;}
      let c;
      if(exactSampler.evaluateValue(toX,toY)<=0){particles[k]=toX;particles[k+1]=toY;continue;}
      if(!contactWatchFlags[k/3]){contactWatchFlags[k/3]=1;contactWatch.push(k);}
      let lo=0,hi=1;
      for(let b=0;b<8;b++){
        const mid=(lo+hi)*.5;
        if(exactSampler.evaluateValue(x+dx*mid,y+dy*mid)>0)hi=mid;else lo=mid;
      }
      const bx=x+dx*lo,by=y+dy*lo;
      c=exactSampler.evaluate(bx,by);
      const nx=c.nx,ny=c.ny,dot=dx*nx+dy*ny;
      const tx=(dx-Math.min(0,dot)*nx)*(1-lo),ty=(dy-Math.min(0,dot)*ny)*(1-lo);
      particles[k]=bx;particles[k+1]=by;
      // A tangent line can enter a concave bridge; retain only its feasible prefix.
      if(exactSampler.evaluateValue(bx+tx,by+ty)<=0){particles[k]+=tx;particles[k+1]+=ty;}
      else{
        let a=0,b=1;for(let it=0;it<8;it++){const u=(a+b)*.5;if(exactSampler.evaluateValue(bx+tx*u,by+ty*u)>0)b=u;else a=u;}
        particles[k]+=tx*a;particles[k+1]+=ty*a;
      }
      particles[k]+=nx*.0001;particles[k+1]+=ny*.0001;
    }
  }
  feasibleMove.acceptFree=(k,dx,dy)=>{particles[k]+=dx;particles[k+1]+=dy;};
  function prepareGrains(time){
    grainFrame.set(source);if(time!==0)grainMotion.applyGrains(time*1.4,grainFrame);
  }
  async function pressureMove(stepGain=1,state=null,guidance=null,guidanceScale=null){
    depositCurrent();const activeMask=options.dynamicFluidMask?fluidActive:density.active;
    const field=poisson.solve(current,target,activeMask,density.totalMass,options.pressureIterations??50);
    let maxMove=0,meanMove=0,clamped=0;
    let velocityScale=1,maxVelocityGradient=0;
    if(options.velocityJacobianLimit){
      const {nx,ny,h}=GRID;
      for(let y=2;y<ny-2;y++)for(let x=2;x<nx-2;x++){
        const k=y*nx+x;if(!activeMask[k])continue;
        const ux=(field.dx[k+1]-field.dx[k-1])/(2*h),uy=(field.dx[k+nx]-field.dx[k-nx])/(2*h),vx=(field.dy[k+1]-field.dy[k-1])/(2*h),vy=(field.dy[k+nx]-field.dy[k-nx])/(2*h);
        maxVelocityGradient=Math.max(maxVelocityGradient,Math.hypot(ux,uy,vx,vy));
      }
      velocityScale=Math.min(1,options.velocityJacobianLimit/Math.max(1e-9,maxVelocityGradient));
      if(velocityScale<1)for(let k=0;k<GN;k++){field.dx[k]*=velocityScale;field.dy[k]*=velocityScale;}
    }
    let jacobian=null;
    if(options.trackFold){
      let min=Infinity,negative=0,low=0,pocketMin=Infinity,pocketNegative=0;
      const {nx,ny,h,x0,y0}=GRID;
      for(let y=2;y<ny-2;y++)for(let x=2;x<nx-2;x++){
        const k=y*nx+x;if(!activeMask[k])continue;
        const ux=(field.dx[k+1]-field.dx[k-1])/(2*h),uy=(field.dx[k+nx]-field.dx[k-nx])/(2*h),vx=(field.dy[k+1]-field.dy[k-1])/(2*h),vy=(field.dy[k+nx]-field.dy[k-nx])/(2*h);
        const det=(1+ux)*(1+vy)-uy*vx;min=Math.min(min,det);if(det<0)negative++;if(det<.25)low++;
        const px=x0+x*h,py=y0+y*h;if(px>=220&&px<=260&&py>=250&&py<=290){pocketMin=Math.min(pocketMin,det);if(det<0)pocketNegative++;}
      }
      stats.minPressureJacobian=Math.min(stats.minPressureJacobian,min);stats.negativePressureCells+=negative;stats.lowPressureCells+=low;
      jacobian={min,negative,low,pocketMin,pocketNegative};
    }
    if(gpuTransportBackend&&options.feasibleTransport&&state){
      let gpuResult;
      try{gpuResult=await gpuTransportBackend.step(particles,field.dx,field.dy,W,grainFrame,previousGrainFrame,state,stepGain);}
      catch(error){gpuTransportBackend=null;options.onGpuTransportFallback?.(error);}
      if(gpuResult){
        const positions=gpuResult.positions,flags=new Uint8Array(count);
        const fallbackIds=[...gpuResult.uncertain];
        for(const i of gpuResult.uncertain)flags[i]=1;
        if(guidance)for(let i=0,k=0;i<count;i++,k+=3)if((guidance[k]||guidance[k+1])&&!flags[i]){flags[i]=1;fallbackIds.push(i);}
        for(let i=0,k=0,j=0;i<count;i++,k+=3,j+=2){
          if(flags[i])continue;
          const dx=positions[j]-particles[k],dy=positions[j+1]-particles[k+1],m=Math.sqrt(dx*dx+dy*dy);
          particles[k]=positions[j];particles[k+1]=positions[j+1];
          maxMove=Math.max(maxMove,m);meanMove+=m;
        }
        const offset=options.staggeredPressure?GRID.h*.5:0;
        for(const i of fallbackIds){
          const k=i*3;
          let dx=interpolate(field.dx,particles[k]-offset,particles[k+1]),dy=interpolate(field.dy,particles[k],particles[k+1]-offset);
          let m=Math.sqrt(dx*dx+dy*dy);if(m>2.2){dx*=2.2/m;dy*=2.2/m;clamped++;}
          dx=dx*stepGain+grainFrame[k]-previousGrainFrame[k];dy=dy*stepGain+grainFrame[k+1]-previousGrainFrame[k+1];
          if(guidance&&(guidance[k]||guidance[k+1])){
            const ux=guidance[k],uy=guidance[k+1],inward=dx*ux+dy*uy;
            if(inward<0){dx-=inward*ux*(guidanceScale?.[k/3]??1);dy-=inward*uy*(guidanceScale?.[k/3]??1);}
          }
          m=Math.sqrt(dx*dx+dy*dy);maxMove=Math.max(maxMove,m);meanMove+=m;
          feasibleMove(k,dx,dy);
        }
        stats.poissonIterations+=field.iterations;
        return{...field,maxMove,meanMove:meanMove/count,clamped,jacobian,velocityScale,maxVelocityGradient,gpuTransport:true,gpuUncertain:gpuResult.uncertain.length,gpuGuidedFallback:fallbackIds.length-gpuResult.uncertain.length};
      }
    }
    for(let i=0,k=0;i<count;i++,k+=3){
      const offset=options.staggeredPressure?GRID.h*.5:0;let dx=interpolate(field.dx,particles[k]-offset,particles[k+1]),dy=interpolate(field.dy,particles[k],particles[k+1]-offset);
      let m=Math.sqrt(dx*dx+dy*dy);if(m>2.2){dx*=2.2/m;dy*=2.2/m;m=2.2;clamped++;}
      dx*=stepGain;dy*=stepGain;m*=stepGain;
      if(options.feasibleTransport){dx+=grainFrame[k]-previousGrainFrame[k];dy+=grainFrame[k+1]-previousGrainFrame[k+1];m=Math.sqrt(dx*dx+dy*dy);}
      if(guidance&&(guidance[k]||guidance[k+1])){
        const ux=guidance[k],uy=guidance[k+1],inward=dx*ux+dy*uy;
        if(inward<0){dx-=inward*ux*(guidanceScale?.[k/3]??1);dy-=inward*uy*(guidanceScale?.[k/3]??1);m=Math.sqrt(dx*dx+dy*dy);}
      }
      if(options.feasibleTransport)feasibleMove(k,dx,dy);else{particles[k]+=dx;particles[k+1]+=dy;}maxMove=Math.max(maxMove,m);meanMove+=m;
    }
    stats.poissonIterations+=field.iterations;
    return{...field,maxMove,meanMove:meanMove/count,clamped,jacobian,velocityScale,maxVelocityGradient};
  }
  function projectInside(state){
    let before=0,after=0,projected=0,maxDepth=0,extraEvaluations=0,maxCorrection=0,saddleContacts=0;
    recentlyProjected=[];
    for(let i=0,k=0;i<count;i++,k+=3){
      const x=particles[k],y=particles[k+1];if(interpolate(W,x,y)<.4||whiteBounds?.pointOutside(x,y))continue;
      let contour=exactSampler.evaluateNearWall(x,y,12);
      if(!contour)continue;
      const clearance=options.feasibleTransport?.0001:source[k+2]*.65,depth=clearance-contour.signedGap;
      if(depth<=(options.internalProjectionSlack??0))continue;before++;maxDepth=Math.max(maxDepth,depth);
      if(contour.gradient<.06&&depth>.08)saddleContacts++;
      // Project exact particle centres; this is only a residual geometric
      // correction. Its count/depth are QA gates against a visible rim.
      let moved=0;
      for(let pass=0;pass<(options.feasibleTransport?24:6)&&contour.signedGap<clearance-(options.feasibleTransport?0:.01);pass++){
        const push=Math.min(Math.max(.02,clearance-contour.signedGap),options.maxProjection??2.0);
        particles[k]+=contour.nx*push;particles[k+1]+=contour.ny*push;moved+=push;
        contour=exactSampler.evaluate(particles[k],particles[k+1]);extraEvaluations++;
      }
      maxCorrection=Math.max(maxCorrection,moved);projected++;projectionHits[i]++;recentlyProjected.push(k);if(!contactWatchFlags[i]){contactWatchFlags[i]=1;contactWatch.push(k);}
      if(contour.signedGap<clearance-.01)after++;
    }
    stats.insideBefore+=before;stats.insideAfter+=after;stats.projected+=projected;
    return{before,after,projected,maxDepth,extraEvaluations,maxCorrection,saddleContacts};
  }
  function relieveProjectedCrowding(checkCrowding){
    // The current-step projection needs only tangent relief at its exact wall.
    const ids=recentlyProjected;
    if(ids.length>=2)for(let pass=0;pass<8;pass++){
      const bins=new Map(),push=new Float32Array(ids.length),tx=new Float32Array(ids.length),ty=new Float32Array(ids.length);
      for(let a=0;a<ids.length;a++){
        const k=ids[a],x=particles[k],y=particles[k+1],c=exactSampler.evaluate(x,y);
        tx[a]=-c.ny;ty[a]=c.nx;
        const bx=Math.floor(x/.6),by=Math.floor(y/.6),key=`${bx},${by}`;
        if(!bins.has(key))bins.set(key,[]);bins.get(key).push(a);
      }
      let pairs=0;
      for(let a=0;a<ids.length;a++){
        const k=ids[a],x=particles[k],y=particles[k+1],bx=Math.floor(x/.6),by=Math.floor(y/.6);
        for(let yy=by-1;yy<=by+1;yy++)for(let xx=bx-1;xx<=bx+1;xx++)for(const b of bins.get(`${xx},${yy}`)||[]){
          if(b<=a)continue;
          const j=ids[b],dx=particles[j]-x,dy=particles[j+1]-y,d=Math.hypot(dx,dy);
          if(d>=.5)continue;
          const along=dx*tx[a]+dy*ty[a],sign=Math.abs(along)>.02?Math.sign(along):(a<b?1:-1);
          const amount=(.5-d)*.5*sign;push[a]-=amount;push[b]+=amount;pairs++;
        }
      }
      if(!pairs)break;
      for(let a=0;a<ids.length;a++){
        const move=clamp(push[a],-.22,.22);
        if(Math.abs(move)>1e-5)feasibleMove(ids[a],tx[a]*move,ty[a]*move);
      }
    }
    if(!checkCrowding)return;
    // Only a recently detected low-gradient saddle gets this density check.
    // A severely occupied one-pixel cell fans outward for one short step.
    crowdedOccupancy.fill(0);
    const hotKeys=[],cellKey=(x,y)=>Math.floor(y+64)*1024+Math.floor(x+64);
    for(let k=0;k<particles.length;k+=3){
      const x=particles[k],y=particles[k+1];
      if(interpolate(W,x,y)<.3)continue;
      const key=cellKey(x,y);
      if(key<0||key>=crowdedOccupancy.length)continue;
      const n=crowdedOccupancy[key];
      if(n===8)hotKeys.push(key);
      if(n<255)crowdedOccupancy[key]=n+1;
    }
    if(!hotKeys.length)return;
    const groups=new Map();for(const key of hotKeys)groups.set(key,[]);
    for(let k=0;k<particles.length;k+=3){
      const group=groups.get(cellKey(particles[k],particles[k+1]));
      if(group)group.push(k);
    }
    for(const group of groups.values()){
      const n=group.length;
      for(let j=0;j<n;j++){
        const k=group[j],c=exactSampler.evaluate(particles[k],particles[k+1]);
        if(c.signedGap>.8)continue;
        const angle=((j+.5)/n-.5)*Math.PI;
        const ux=c.nx*Math.cos(angle)-c.ny*Math.sin(angle),uy=c.ny*Math.cos(angle)+c.nx*Math.sin(angle);
        feasibleMove(k,ux*.32,uy*.32);
      }
    }
  }
  function relieveContactBand(time){
    const groups=new Map(),nextWatch=[];
    for(const k of contactWatch){
      const x=particles[k],y=particles[k+1];
      const c=exactSampler.evaluate(x,y);
      if(c.signedGap>2||c.gradient>.12){contactWatchFlags[k/3]=0;continue;}
      nextWatch.push(k);
      if(c.gradient>=.08||c.signedGap<0||c.signedGap>=.025)continue;
      const key=`${Math.floor(x/8)},${Math.floor(y/8)}`;
      let group=groups.get(key);if(!group){group=[];groups.set(key,group);}group.push(k);
    }
    contactWatch=nextWatch;
    let hot=0,moved=0;for(const group of groups.values())if(group.length>=3)hot++;
    if(!hot)return{groups:0,moved:0,watched:contactWatch.length};
    crowdedOccupancy.fill(0);
    const cellKey=(x,y)=>Math.floor(y+64)*1024+Math.floor(x+64);
    for(let k=0;k<particles.length;k+=3){
      const key=cellKey(particles[k],particles[k+1]);
      if(key>=0&&key<crowdedOccupancy.length&&crowdedOccupancy[key]<255)crowdedOccupancy[key]++;
    }
    for(const group of groups.values()){
      const n=group.length;if(n<3)continue;
      for(let j=0;j<n;j++){
        const k=group[j],x=particles[k],y=particles[k+1],id=k/3;
        let best=Infinity,bx=x,by=y;
        for(let a=0;a<8;a++){
          const angle=(a+(id*7%8)/8)*Math.PI/4,ux=Math.cos(angle),uy=Math.sin(angle);
          for(const radius of [.35,.7,1.05]){
            const px=x+ux*radius,py=y+uy*radius,key=cellKey(px,py);
            if(key<0||key>=crowdedOccupancy.length)continue;
            if(exactSampler.evaluateValue(x+ux*radius*.5,y+uy*radius*.5)>0||exactSampler.evaluateValue(px,py)>0)continue;
            const neighbor=crowdedOccupancy[key-1]+crowdedOccupancy[key+1]+crowdedOccupancy[key-1024]+crowdedOccupancy[key+1024];
            const score=crowdedOccupancy[key]+neighbor*.18+radius*.13;
            if(score<best){best=score;bx=px;by=py;}
          }
        }
        if(!Number.isFinite(best))continue;
        const old=cellKey(x,y);if(old>=0&&old<crowdedOccupancy.length&&crowdedOccupancy[old])crowdedOccupancy[old]--;
        feasibleMove(k,bx-x,by-y);
        const now=cellKey(particles[k],particles[k+1]);if(now>=0&&now<crowdedOccupancy.length&&crowdedOccupancy[now]<255)crowdedOccupancy[now]++;
        moved++;
      }
    }
    return{groups:hot,moved,watched:contactWatch.length};
  }
  function reset(){particles.set(source);previousGrainFrame.set(source);lastTime=0;fixedIndex=0;lastFineBucket=0;lastRenderTime=NaN;lastState=null;lastControls=null;saddleHazardUntil=-Infinity;closingHazards=[];contactWatch=[];contactWatchFlags.fill(0);effectiveControls=null;lastInputGeom=null;lastClock={vacancyTime:0,fusionTime:0,grainTime:0};shrinks.fill(0);uniformShrink=0;poisson.reset();}
  async function advance(time,controls,stepDuration=.1,forceFine=false){
    const t0=performance.now();

    const canRetry=options.adaptivePinch&&lastState&&lastControls&&stepDuration>=.08&&
      Math.abs((controls.whiteSize??1)-(lastControls.whiteSize??1))<1e-9;
    const savedParticles=canRetry?particles.slice():null,savedDistance=canRetry?distance.slice():null;
    const savedUniform=uniformShrink,savedShrinks=canRetry?shrinks.slice():null;
    if(options.wallAdvectionStrength&&!lastState){
      const initialControls={...controls,vacancyTime:0,fusionTime:0,grainTime:0};
      const initialState=makeState(0,initialControls);buildTarget(initialState);lastState=initialState;
    }
    previousDistance.set(distance);
    const state=makeState(time,controls),t1=performance.now(),targetInfo=buildTarget(state),t2=performance.now();if(exactSampler)exactSampler.setState(state);else exactSampler=createImplicitEvaluator(state);const wall=advectWithWall();const boundaryProjection=options.feasibleTransport?projectInside(state):null;
    if(canRetry&&boundaryProjection.projected>=3&&boundaryProjection.maxCorrection>1.25){
      particles.set(savedParticles);distance.set(savedDistance);uniformShrink=savedUniform;shrinks.set(savedShrinks);
      stats.insideBefore-=boundaryProjection.before;stats.insideAfter-=boundaryProjection.after;stats.projected-=boundaryProjection.projected;
      for(const k of recentlyProjected)projectionHits[k/3]--;
      const from=lastControls,begin=time-stepDuration;let result;
      for(let j=1;j<=4;j++){
        const u=j/4,c={...controls};
        for(const key of ['vacancyTime','fusionTime','grainTime','travel','whiteSize','fusionAmount']){
          const fallback=key==='travel'?1.6:key==='whiteSize'||key==='fusionAmount'?1:begin;
          const endFallback=key==='travel'?1.6:key==='whiteSize'||key==='fusionAmount'?1:time;
          c[key]=(from[key]??fallback)+((controls[key]??endFallback)-(from[key]??fallback))*u;
        }
        result=await advance(begin+stepDuration*u,c,stepDuration/4);
      }
      result.adaptivePinch={substeps:4,triggerDepth:boundaryProjection.maxCorrection,projected:boundaryProjection.projected};
      return result;
    }
    if(boundaryProjection?.saddleContacts>=3&&boundaryProjection.maxDepth>.25)
      saddleHazardUntil=Math.max(saddleHazardUntil,time+.2);
    if(options.feasibleTransport)prepareGrains(controls.grainTime??time);advectDipoles(lastState,state);
    const vacancyRate=lastControls?((controls.vacancyTime??time)-(lastControls.vacancyTime??time-stepDuration))/stepDuration:0;
    const fusionRate=lastControls?((controls.fusionTime??time)-(lastControls.fusionTime??time-stepDuration))/stepDuration:0;
    const changedForecastRate=closingHazards.some(h=>Math.abs(vacancyRate-h.vacancyRate)>.01||Math.abs(fusionRate-h.fusionRate)>.01);
    closingHazards=closingHazards.filter(h=>time<h.targetTime-.05&&Math.abs(state.whiteSize-h.whiteSize)<=.001&&Math.abs(state.fusionAmount-h.fusionAmount)<=.001&&Math.abs((controls.travel??1.6)-h.travel)<=.001&&Math.abs(vacancyRate-h.vacancyRate)<=.01&&Math.abs(fusionRate-h.fusionRate)<=.01);
    let hazardActivated=null;
    if(lastControls&&(changedForecastRate||Math.abs(time*2-Math.round(time*2))<1e-6)){
      const horizon=5.6,ratio=horizon/stepDuration,c={...controls};
      for(const key of ['vacancyTime','fusionTime'])c[key]=controls[key]+(controls[key]-lastControls[key])*ratio;
      const oldError=stats.areaError,future=makeForecastState(time+horizon,c);stats.areaError=oldError;
      const candidates=detectClosingPocket(GRID,density.active,W,exactSampler,createImplicitEvaluator(future),state,future);
      for(const found of candidates){
        // Pair contacts cannot enclose fluid; the temporal router uses hulls of three or more guides.
        if(found.guideIds.length<3)continue;
        const key=found.guideIds.join(',');
        if(closingHazards.some(h=>h.key===key))continue;
        const timeline=[];let closureTime=null;
        const forecastArea=triangleFluidArea(future,found.guideIds.slice(0,3),createImplicitEvaluator(future));
        if(found.guideIds.length>=3&&forecastArea.area<=.5){
          // A fast clock may close the pocket before the fixed lookahead.
          // Locate the first closure while the fluid neck is still open.
          let lo=time,hi=time+horizon;
          for(let b=0;b<7;b++){
            const trialTime=(lo+hi)*.5,trialRatio=(trialTime-time)/stepDuration,trialControls={...controls};
            for(const key of ['vacancyTime','fusionTime'])trialControls[key]=controls[key]+(controls[key]-lastControls[key])*trialRatio;
            const old=stats.areaError,trial=makeForecastState(trialTime,trialControls);stats.areaError=old;
            const area=triangleFluidArea(trial,found.guideIds.slice(0,3),createImplicitEvaluator(trial));
            timeline.push({t:trialTime,...area});
            if(area.area<=.5)hi=trialTime;else lo=trialTime;
          }
          closureTime=hi;
        }else if(found.guideIds.length>=3)for(let j=0;j<=20;j++){
          const trialTime=time+horizon+j*.1,trialRatio=(trialTime-time)/stepDuration,trialControls={...controls};
          for(const key of ['vacancyTime','fusionTime'])trialControls[key]=controls[key]+(controls[key]-lastControls[key])*trialRatio;
          const old=stats.areaError,trial=makeForecastState(trialTime,trialControls);stats.areaError=old;
          const area=triangleFluidArea(trial,found.guideIds.slice(0,3),createImplicitEvaluator(trial));
          timeline.push({t:trialTime,...area});
          if(area.area<=.5){closureTime=trialTime;break;}
        }
        // A pairwise neck has no triangle to empty. The same failure also
        // occurs when a larger junction retains fluid elsewhere in its guide
        // triangle. The detector has already established a fluid point now
        // that becomes white in the forecast; evacuate that closing passage.
        let fieldClosure=false;
        if(closureTime===null){
          let lo=time,hi=time+horizon;
          for(let b=0;b<7;b++){
            const trialTime=(lo+hi)*.5,trialRatio=(trialTime-time)/stepDuration,trialControls={...controls};
            for(const key of ['vacancyTime','fusionTime'])trialControls[key]=controls[key]+(controls[key]-lastControls[key])*trialRatio;
            const old=stats.areaError,trial=makeForecastState(trialTime,trialControls);stats.areaError=old;
            const value=createImplicitEvaluator(trial).evaluateValue(found.x,found.y);
            if(value>0)hi=trialTime;else lo=trialTime;
          }
          closureTime=hi;fieldClosure=true;
        }
        if(closureTime!==null){
          const targetTime=fieldClosure?time+horizon:closureTime+.2,targetRatio=(targetTime-time)/stepDuration,targetControls={...controls};
          for(const key of ['vacancyTime','fusionTime'])targetControls[key]=controls[key]+(controls[key]-lastControls[key])*targetRatio;
          const old=stats.areaError,goal=makeForecastState(targetTime,targetControls);stats.areaError=old;
          const hazard={key,activationTime:time,targetTime,closureTime,center:{x:found.x,y:found.y},bounds:found.bounds,guideIds:found.guideIds,whiteSize:state.whiteSize,fusionAmount:state.fusionAmount,travel:controls.travel??1.6,vacancyRate,fusionRate,futureState:{...goal,shrinks:Float64Array.from(goal.shrinks)}};
          hazard.futureSampler=createImplicitEvaluator(hazard.futureState);
          if(hazard.guideIds.length>=3){
            hazard.temporalSamples=[];
            const frames=Math.max(1,Math.ceil((targetTime-time)/.2));
            for(let f=0;f<=frames;f++){
              const sampleTime=time+(targetTime-time)*f/frames,ratio=(sampleTime-time)/stepDuration,c={...controls};
              for(const key of ['vacancyTime','fusionTime'])c[key]=controls[key]+(controls[key]-lastControls[key])*ratio;
              const old=stats.areaError,forecast=makeForecastState(sampleTime,c);stats.areaError=old;
              const snapshot={...forecast,shrinks:Float64Array.from(forecast.shrinks)};
              hazard.temporalSamples.push({time:sampleTime,sampler:createImplicitEvaluator(snapshot)});
            }
          }
          closingHazards.push(hazard);
          hazardActivated??=[];hazardActivated.push({activationTime:time,targetTime,closureTime,center:hazard.center,bounds:hazard.bounds,guideIds:hazard.guideIds,timeline});
        }
      }
    }
    let topologyRoute=null;
    if(closingHazards.length){
      const guidance=new Float32Array(particles.length),pushScale=new Float32Array(count),departures=new Float64Array(count);departures.fill(Infinity);const particleRoutes=new Uint16Array(count),routes=[];let considered=0,guided=0,maxRisk=0;
      // In an overlap, follow the earliest safe departure for each particle.
      // Global pocket closure order cannot rank route-specific urgency.
      for(const hazard of closingHazards.slice().sort((a,b)=>a.closureTime-b.closureTime)){
        const route=routeClosingPocket(particles,exactSampler,hazard.futureSampler,hazard.bounds,hazard.guideIds.map(i=>state.circles[i]),{time,targetTime:hazard.targetTime,samples:hazard.temporalSamples,futureGuideCenters:hazard.guideIds.map(i=>hazard.futureState.circles[i])});
        routes.push(route);considered+=route.considered;maxRisk=Math.max(maxRisk,route.maxRisk);
        for(let k=0;k<particles.length;k+=3)if((route.guidance[k]||route.guidance[k+1])&&route.departures[k/3]<departures[k/3]){
          if(!guidance[k]&&!guidance[k+1])guided++;
          guidance[k]=route.guidance[k];guidance[k+1]=route.guidance[k+1];pushScale[k/3]=route.pushScale[k/3];departures[k/3]=route.departures[k/3];particleRoutes[k/3]=routes.length-1;
        }
      }
      topologyRoute={considered,guided,maxRisk,guidance,pushScale,particleRoutes,routes};
    }
    const tAdvect=performance.now(),flow=await pressureMove(clamp(stepDuration/.1,0,1),state,topologyRoute?.guidance,topologyRoute?.pushScale),t3=performance.now();if(options.feasibleTransport)previousGrainFrame.set(grainFrame);const projection=(options.disableInternalProjection||options.feasibleTransport)?{before:0,after:0,projected:0,maxDepth:0}:projectInside(state),t4=performance.now(),microResult=micro?.apply(particles,source,distance,W,options.microStrength),t5=performance.now();
    const spacingResult=spacing?.apply(particles,feasibleMove,options.spacingStrength);
    const fineBucket=Math.floor((time+1e-9)/.2),bucketDelta=fineBucket-lastFineBucket;
    const adaptiveFine=stepDuration<.08;
    const fineScale=adaptiveFine?1:bucketDelta>0?2*bucketDelta:forceFine?1:0;
    if(adaptiveFine||bucketDelta>0)lastFineBucket=fineBucket;
    const fineResult=fineScale?await fine?.apply(particles,W,exactSampler,feasibleMove,options.fineStrength*fineScale,.15*fineScale,state):null;
    if(topologyRoute){
      const guidance=topologyRoute.guidance,cap=1.5*Math.min(1,stepDuration/.1);
      let moved=0,maxMove=0;
      for(let k=0;k<particles.length;k+=3)if(guidance[k]||guidance[k+1]){
        const x=particles[k],y=particles[k+1];topologyRoute.routes[topologyRoute.particleRoutes[k/3]].followParticle(k,cap*topologyRoute.pushScale[k/3],feasibleMove);
        const d=Math.hypot(particles[k]-x,particles[k+1]-y);if(d>1e-5){moved++;maxMove=Math.max(maxMove,d);}
      }
      topologyRoute={considered:topologyRoute.considered,guided:topologyRoute.guided,maxRisk:topologyRoute.maxRisk,moved,maxMove};
    }
    if(options.feasibleTransport)relieveProjectedCrowding(time<=saddleHazardUntil);
    const tContact=performance.now();
    const contactRelief=options.feasibleTransport?relieveContactBand(time):null;
    const contactMs=performance.now()-tContact;
    const elapsed=performance.now()-t0;timings.push(elapsed);stats.steps++;stats.totalMs+=elapsed;stats.maxMs=Math.max(stats.maxMs,elapsed);
    lastState=state;lastControls={...controls};lastStep={time,elapsed,spacing:spacingResult,fine:fineResult,fineCadence:{bucket:fineBucket,scale:fineScale},topologyRoute,hazardActivated,activeClosingHazard:closingHazards.length?{activationTime:closingHazards[0].activationTime,targetTime:closingHazards[0].targetTime,center:closingHazards[0].center,bounds:closingHazards[0].bounds}:null,activeClosingHazards:closingHazards.map(h=>({activationTime:h.activationTime,targetTime:h.targetTime,closureTime:h.closureTime,center:h.center,guideIds:h.guideIds})),stageMs:{quota:t1-t0,target:t2-t1,advection:tAdvect-t2,pressure:t3-tAdvect,projection:t4-t3,micro:t5-t4,contactRelief:contactMs},targetInfo,wall,flow:{iterations:flow.iterations,residual:flow.residual/Math.max(1e-12,flow.initialResidual),maxMove:flow.maxMove,meanMove:flow.meanMove,clamped:flow.clamped,jacobian:flow.jacobian,velocityScale:flow.velocityScale,maxVelocityGradient:flow.maxVelocityGradient},boundaryProjection,projection,contactRelief,micro:microResult,quota:{area:state.quota.area,error:state.quota.maxQuotaError,iterations:state.quota.iterations}};return lastStep;
  }
  async function sample(time,out=output,controls={}){
    if(time<lastTime-1e-6)reset();
    const maxStep=options.maxTimeStep??(1/20);
    if(!effectiveControls)effectiveControls={travel:controls.travel??1.6,whiteSize:controls.whiteSize??1,fusionAmount:controls.fusionAmount??1};
    const requested={travel:controls.travel??1.6,whiteSize:controls.whiteSize??1,fusionAmount:controls.fusionAmount??1,
      vacancyTime:controls.vacancyTime??time,fusionTime:controls.fusionTime??time,grainTime:controls.grainTime??time};
    const changed=!lastInputGeom||Object.keys(requested).some(key=>Math.abs(requested[key]-lastInputGeom[key])>1e-9);
    const scalarSteps=Math.max(Math.ceil(Math.abs(requested.travel-effectiveControls.travel)/.16),
      Math.ceil(Math.abs(requested.whiteSize-effectiveControls.whiteSize)/.03),
      Math.ceil(Math.abs(requested.fusionAmount-effectiveControls.fusionAmount)/.1));
    const steps=options.fixedStep?0:changed||time>lastTime+1e-9?Math.max(1,Math.ceil((time-lastTime)/maxStep),scalarSteps):0;
    const start={...effectiveControls},fromClock={...lastClock};
    let recent=null;
    if(options.fixedStep){
      const h=options.fixedStep,nextIndex=Math.floor((time+1e-9)/h);
      while(fixedIndex<nextIndex){
        const t=(fixedIndex+1)*h,u=time>lastTime+1e-9?clamp((t-lastTime)/(time-lastTime),0,1):1;
        const stepped={...controls,
          travel:start.travel+(requested.travel-start.travel)*u,
          whiteSize:start.whiteSize+(requested.whiteSize-start.whiteSize)*u,
          fusionAmount:start.fusionAmount+(requested.fusionAmount-start.fusionAmount)*u,
          vacancyTime:fromClock.vacancyTime+(requested.vacancyTime-fromClock.vacancyTime)*u,
          fusionTime:fromClock.fusionTime+(requested.fusionTime-fromClock.fusionTime)*u,grainTime:fromClock.grainTime+(requested.grainTime-fromClock.grainTime)*u};
        recent=await advance(t,stepped,h);fixedIndex++;
      }
      if(time<=lastTime+1e-9&&scalarSteps>0){
        for(let j=1;j<=scalarSteps;j++){
          const u=j/scalarSteps;
          recent=await advance(fixedIndex*h,{...controls,
            travel:start.travel+(requested.travel-start.travel)*u,
            whiteSize:start.whiteSize+(requested.whiteSize-start.whiteSize)*u,
            fusionAmount:start.fusionAmount+(requested.fusionAmount-start.fusionAmount)*u,
            vacancyTime:requested.vacancyTime,fusionTime:requested.fusionTime,grainTime:requested.grainTime},h,true);
        }
      }
      effectiveControls={travel:requested.travel,whiteSize:requested.whiteSize,fusionAmount:requested.fusionAmount};
    }else for(let j=1;j<=steps;j++){
      const u=j/steps,t=lastTime+(time-lastTime)*u;
      for(const key of ['travel','whiteSize','fusionAmount'])effectiveControls[key]=start[key]+(requested[key]-start[key])*u;
      if(t>0||options.settleAtZero||scalarSteps>0)recent=await advance(t,{...controls,...effectiveControls,
        vacancyTime:fromClock.vacancyTime+(requested.vacancyTime-fromClock.vacancyTime)*u,
        fusionTime:fromClock.fusionTime+(requested.fusionTime-fromClock.fusionTime)*u,grainTime:fromClock.grainTime+(requested.grainTime-fromClock.grainTime)*u},time>lastTime?(time-lastTime)/steps:.1,time<=lastTime+1e-9);
    }
    lastTime=time;lastInputGeom=requested;lastClock={vacancyTime:requested.vacancyTime,fusionTime:requested.fusionTime,grainTime:requested.grainTime};
    if(!lastState){
      lastState=makeState(time,controls);buildTarget(lastState);
      exactSampler=createImplicitEvaluator(lastState);
      if(options.feasibleTransport)projectInside(lastState);
    }
    out.set(particles);
    const grainTime=controls.grainTime??time;
    const outputInfo={intrusions:0,remaining:0,maxCorrection:0};
    if(!options.feasibleTransport){
      grainFrame.set(source);if(grainTime!==0)grainMotion.applyGrains(grainTime*1.4,grainFrame);
      for(let k=0;k<out.length;k+=3){
        out[k]+=grainFrame[k]-source[k];out[k+1]+=grainFrame[k+1]-source[k+1];
        // The simulation retains every unconstrained particle trajectory. The
        // drawing correction touches only centres that are actually inside the
        // current white set; a finite outside clearance would create a collar.
        if(!lastState||interpolate(W,out[k],out[k+1])<.5)continue;
        let contour=exactSampler.evaluateNearWall(out[k],out[k+1],12);
        if(!contour||contour.value<=0)continue;
        outputInfo.intrusions++;
        const rawX=out[k],rawY=out[k+1];
        const clearance=source[k+2]*.1;
        for(let pass=0;pass<16&&contour.value>0;pass++){
          const push=Math.min(Math.max(.025,clearance-contour.signedGap),2);
          out[k]+=contour.nx*push;out[k+1]+=contour.ny*push;
          contour=exactSampler.evaluate(out[k],out[k+1]);
        }
        outputInfo.maxCorrection=Math.max(outputInfo.maxCorrection,Math.hypot(out[k]-rawX,out[k+1]-rawY));
        if(contour.value>0)outputInfo.remaining++;
      }
    }
    previousParticles.set(particles);previousRenderedOutput.set(out);lastRenderTime=time;lastOutput=outputInfo;
    return out;
  }
  async function sampleDetailed(time,out=output,controls={}){const before=stats.steps;await sample(time,out,controls);return{out,steps:stats.steps-before,state:lastState,stats:{...stats},lastTiming:timings.at(-1)};}
  return{count,source,particles,projectionHits,sample,sampleDetailed,reset,stats,timings,fineBackend:fine,poissonBackendType:poisson.backendType??'js-f64',setGpuTransportBackend(backend){gpuTransportBackend=backend;},get gpuTransportBackend(){return gpuTransportBackend;},get state(){return lastState;},get lastStep(){return lastStep;},get lastOutput(){return lastOutput;},get target(){return target;},get current(){return current;},get weightGrid(){return W;},get distance(){return distance;},get reference(){return density.ref;},grid:GRID};
}
