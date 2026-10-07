import {levelSetArea} from './level-set-area.js';

/** Pure geometry forecast for the same global area constraint as buildTarget.
 * Every solve owns its output shrink array and leaves the live raster, live
 * scalar shrink and input state untouched. Centre trajectories are unchanged.
 */
export function createForecastAreaSolver(grid,{tolerance=.25,maxPasses=8}={}){
  const {x0,y0,h,nx,ny}=grid,N=nx*ny;
  if(!Number.isFinite(x0+y0+h)||h<=0||!Number.isInteger(nx)||!Number.isInteger(ny)||nx<2||ny<2)throw new TypeError('Invalid forecast area grid');
  if(!(tolerance>0)||!Number.isFinite(tolerance)||!Number.isInteger(maxPasses)||maxPasses<1)throw new TypeError('Invalid forecast area solve options');
  const W=new Float32Array(N),powerSum=new Float32Array(N),pairK=Array.from({length:4},()=>new Float32Array(N));
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function rasterArea(state,uniformShrink){
    const size=state.whiteSize??1,mix=state.fusionMix??1,amount=state.fusionAmount??1;
    const kr=.1+((state.kernelRatio??.75)-.1)*amount;
    const kind=mix<1e-5?0:mix>1-1e-5?1:2,power=kind===2?1/mix:0;
    W.fill(0);powerSum.fill(0);for(const values of pairK)values.fill(0);
    function add(p,value){
      if(kind===0)W[p]=Math.max(W[p],value);
      else if(kind===1)W[p]+=value;
      else if(value>W[p]){powerSum[p]=powerSum[p]*Math.pow(W[p]/value,power)+1;W[p]=value;}
      else if(value>0&&W[p]>0)powerSum[p]+=Math.pow(value/W[p],power);
    }
    for(let i=0;i<state.circles.length;i++){
      const c=state.circles[i],nominal=c.r*size,R=nominal-uniformShrink,L=1.5*nominal,reach=R+L,kappa=kr*nominal;
      if(!(nominal>0)||!Number.isFinite(c.x+c.y+R+reach+kappa)||!(kappa>0))throw new RangeError('Nonfinite or invalid forecast circle');
      if(reach<=0)continue;
      const ix0=clamp(Math.floor((c.x-reach-x0)/h),0,nx-1),ix1=clamp(Math.ceil((c.x+reach-x0)/h),0,nx-1);
      const iy0=clamp(Math.floor((c.y-reach-y0)/h),0,ny-1),iy1=clamp(Math.ceil((c.y+reach-y0)/h),0,ny-1);
      const slot=i===6?0:i===8?1:i===30?2:i===31?3:-1;
      for(let iy=iy0;iy<=iy1;iy++){
        const dy=y0+iy*h-c.y,row=iy*nx;
        for(let ix=ix0;ix<=ix1;ix++){
          const dx=x0+ix*h-c.x,d=Math.sqrt(dx*dx+dy*dy)-R;if(d>=L)continue;
          const u=Math.max(0,d/L),u2=u*u,u3=u2*u,gate=1-10*u3+15*u3*u-6*u3*u2;
          const value=Math.exp(-d/kappa)*gate,p=row+ix;
          if(slot>=0)pairK[slot][p]=value;else add(p,value);
        }
      }
    }
    for(let pair=0;pair<2;pair++){
      const A=pairK[pair*2],B=pairK[pair*2+1],inner=state.pairMixes?.[pair]??mix;
      for(let p=0;p<N;p++){
        const high=Math.max(A[p],B[p]),low=Math.min(A[p],B[p]);if(high<=0)continue;
        const value=inner<=1e-5?high:inner>=1-1e-5?high+low:high*Math.pow(1+Math.pow(low/high,1/inner),inner);add(p,value);
      }
    }
    if(kind===2)for(let p=0;p<N;p++)if(W[p]>0)W[p]*=Math.pow(powerSum[p],mix);
    const area=levelSetArea(W,nx,ny,h);
    if(!Number.isFinite(area))throw new RangeError('Nonfinite forecast area');
    return area;
  }
  function solve(state,{sourceArea=state.quota?.sourceArea,initialShrink=state.shrinks?.[0]??0}={}){
    if(!Number.isFinite(sourceArea)||sourceArea<=0||!Number.isFinite(initialShrink))throw new RangeError('A positive source area and finite initial shrink are required');
    let shrink=clamp(initialShrink,-4,5),previousShrink=NaN,previousArea=NaN,area=NaN,iterations=0;
    for(;iterations<maxPasses;iterations++){
      area=rasterArea(state,shrink);
      const error=area-sourceArea;if(Math.abs(error)<=tolerance){iterations++;break;}
      let slope=-3600*(state.whiteSize??1);
      if(Number.isFinite(previousArea)&&Math.abs(shrink-previousShrink)>1e-9){
        const secant=(area-previousArea)/(shrink-previousShrink);
        if(Number.isFinite(secant)&&secant<-.01)slope=secant;
      }
      const next=clamp(shrink-error/slope,-4,5);
      if(Math.abs(next-shrink)<1e-10){iterations++;break;}
      // Keep the returned scalar paired with its measured area if the budget
      // is exhausted, rather than returning an unevaluated final prediction.
      if(iterations===maxPasses-1){iterations++;break;}
      previousShrink=shrink;previousArea=area;shrink=next;
    }
    const shrinks=new Float64Array(state.circles.length);shrinks.fill(shrink);
    return{...state,shrinks,quota:{...state.quota,area,sourceArea,uniformShrink:shrink,iterations,maxQuotaError:Math.abs(area-sourceArea)/sourceArea,forecastConverged:Math.abs(area-sourceArea)<=tolerance}};
  }
  return{solve,rasterArea};
}
