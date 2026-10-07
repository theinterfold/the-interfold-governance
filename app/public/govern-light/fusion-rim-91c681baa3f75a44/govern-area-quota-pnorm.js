/** Raster QA solver for fixed per-hole area quotas under the p-norm metaball field.
 *  Only a prototype: solve geometry offline, then interpolate a small correction table.
 */
export function createPnormAreaQuotaSolver(sourceCircles,options={}){
  const x0=options.x0??0,y0=options.y0??0,step=options.step??1;
  const nx=Math.floor((options.width??600)/step)+1,ny=Math.floor((options.height??450)/step)+1;
  const N=nx*ny,count=sourceCircles.length;
  const fields=Array.from({length:count},()=>new Float32Array(N));
  const pairFields=[new Float32Array(N),new Float32Array(N)],sourcePairs=[[6,8],[30,31]];
  const activeFields=fields.slice(),activeBounds=new Array(count);
  const maxField=new Float32Array(N),z=new Float32Array(N),mask=new Uint8Array(N),sourceMask=new Uint8Array(N);
  const winner=new Int16Array(N),bounds=new Array(count);
  const gate=u=>u<=0?1:u>=1?0:1-10*u*u*u+15*u*u*u*u-6*u*u*u*u*u;
  for(let iy=0;iy<ny;iy++)for(let ix=0;ix<nx;ix++){
    const x=x0+ix*step,y=y0+iy*step,p=iy*nx+ix;
    for(const c of sourceCircles)if((x-c.x)**2+(y-c.y)**2<=c.r*c.r){sourceMask[p]=1;break}
  }
  function raster(circles,shrinks,amount,kernelRatio=.75){
    const kRatio=.1+(kernelRatio-.1)*Math.max(0,Math.min(1,amount));
    maxField.fill(0);z.fill(0);mask.fill(0);winner.fill(-1);
    for(let i=0;i<count;i++){
      const c=circles[i],f=fields[i],nominal=c.r,r=nominal-(shrinks?.[i]??0),reach=r+1.5*nominal;
      const ix0=Math.max(0,Math.floor((c.x-reach-x0)/step)),ix1=Math.min(nx-1,Math.ceil((c.x+reach-x0)/step));
      const iy0=Math.max(0,Math.floor((c.y-reach-y0)/step)),iy1=Math.min(ny-1,Math.ceil((c.y+reach-y0)/step));
      bounds[i]=[ix0,ix1,iy0,iy1];f.fill(0);
      const L=1.5*nominal,k=kRatio*nominal;
      for(let iy=iy0;iy<=iy1;iy++){
        const y=y0+iy*step,dy=y-c.y,off=iy*nx;
        for(let ix=ix0;ix<=ix1;ix++){
          const x=x0+ix*step,d=Math.hypot(x-c.x,dy)-r;if(d>=L)continue;
          const value=Math.exp(-d/k)*gate(d/L),p=off+ix;f[p]=value;
          if(value>maxField[p]){maxField[p]=value;winner[p]=i;}
        }
      }
    }
  }
  function evaluate(circles,shrinks,settings={}){
    const amount=settings.fusionAmount??1,mix=Math.max(0,Math.min(1,settings.fusionMix??1));
    raster(circles,shrinks,amount,settings.kernelRatio??.75);
    for(let i=0;i<count;i++){activeFields[i]=fields[i];activeBounds[i]=bounds[i];}
    if(settings.pairMixes&&count>31){
      for(let zpair=0;zpair<2;zpair++){
        const [a,b]=sourcePairs[zpair],A=fields[a],B=fields[b],G=pairFields[zpair];
        const m=Math.max(0,Math.min(1,settings.pairMixes[zpair]??0));G.fill(0);
        const ba=bounds[a],bb=bounds[b];
        const xlo=Math.min(ba[0],bb[0]),xhi=Math.max(ba[1],bb[1]);
        const ylo=Math.min(ba[2],bb[2]),yhi=Math.max(ba[3],bb[3]);
        activeBounds[a]=[xlo,xhi,ylo,yhi];activeFields[a]=G;activeFields[b]=null;
        for(let iy=ylo;iy<=yhi;iy++){
          const off=iy*nx;
          for(let ix=xlo;ix<=xhi;ix++){
            const p=off+ix,hi=Math.max(A[p],B[p]),lo=Math.min(A[p],B[p]);
            if(hi<=0)continue;
            G[p]=m<=1e-7?hi:m>=1-1e-7?hi+lo:hi*Math.pow(1+Math.pow(lo/hi,1/m),m);
          }
        }
      }
      maxField.fill(0);winner.fill(-1);
      for(let i=0;i<count;i++){
        const f=activeFields[i];if(!f)continue;const b=activeBounds[i];
        for(let iy=b[2];iy<=b[3];iy++){
          const off=iy*nx;
          for(let ix=b[0];ix<=b[1];ix++){
            const p=off+ix,v=f[p];if(v>maxField[p]){maxField[p]=v;winner[p]=i;}
          }
        }
      }
    }
    const quotas=new Float64Array(count);let area=0;
    if(mix<1e-7){
      for(let p=0;p<N;p++)if(maxField[p]>=1){mask[p]=1;area++;}
    }else{
      const inv=1/mix;
      for(let i=0;i<count;i++){
        const f=activeFields[i];if(!f)continue;const b=activeBounds[i];
        for(let iy=b[2];iy<=b[3];iy++){
          const off=iy*nx;
          for(let ix=b[0];ix<=b[1];ix++){
            const p=off+ix,v=f[p],m=maxField[p];
            if(v>0&&m>0)z[p]+=Math.pow(v/m,inv);
          }
        }
      }
      for(let p=0;p<N;p++)if(maxField[p]>0&&maxField[p]*Math.pow(z[p],mix)>=1){mask[p]=1;area++;}
    }
    for(let i=0;i<count;i++){
      const pairIndex=settings.pairMixes?(i===6||i===8?0:i===30||i===31?1:-1):-1;
      const anchor=pairIndex===0?6:pairIndex===1?30:i;
      const f=activeFields[anchor],b=bounds[i];if(!f)continue;
      const internalMix=pairIndex>=0&&settings.pairMixes?Math.max(0,Math.min(1,settings.pairMixes[pairIndex]??0)):0;
      const other=pairIndex===0?(i===6?8:6):pairIndex===1?(i===30?31:30):-1;
      for(let iy=b[2];iy<=b[3];iy++){
        const off=iy*nx;
        for(let ix=b[0];ix<=b[1];ix++){
          const p=off+ix;if(!mask[p])continue;
          const v=f[p],m=maxField[p];if(v<=0||m<=0)continue;
          let share=mix<1e-7?(winner[p]===anchor?1:0):Math.pow(v/m,1/mix)/z[p];
          if(pairIndex>=0&&settings.pairMixes){
            const own=fields[i][p],otherValue=fields[other][p];
            let inner=0;
            if(internalMix<1e-7)inner=own>=otherValue&&own>0?1:0;
            else if(otherValue<=0)inner=own>0?1:0;
            else if(own>0){const ratio=Math.pow(otherValue/own,1/internalMix);inner=1/(1+ratio);}
            share*=inner;
          }
          quotas[i]+=share;
        }
      }
      quotas[i]*=step*step;
    }
    return{area:area*step*step,quotas,mask};
  }
  raster(sourceCircles,null,1,options.kernelRatio??.75);
  const targetQuotas=new Float64Array(count);let sourceArea=0;
  for(let p=0;p<N;p++)if(sourceMask[p]){sourceArea+=step*step;targetQuotas[winner[p]]+=step*step;}
  function solve(circles,settings={}){
    const shrinks=settings.shrinks??new Float64Array(count);
    const maxIter=settings.maxIter??30,tolerance=settings.tolerance??.005;
    let result,maxQuotaError=Infinity,iterations=0;
    for(let k=0;k<maxIter;k++){
      result=evaluate(circles,shrinks,settings);maxQuotaError=0;
      for(let i=0;i<count;i++){
        const err=result.quotas[i]-targetQuotas[i],rel=Math.abs(err)/Math.max(1,targetQuotas[i]);
        maxQuotaError=Math.max(maxQuotaError,rel);
        shrinks[i]=Math.max(-4,Math.min(5,shrinks[i]+.72*err/(2*Math.PI*circles[i].r)));
      }
      iterations=k+1;if(maxQuotaError<tolerance)break;
    }
    result=evaluate(circles,shrinks,settings);maxQuotaError=0;
    for(let i=0;i<count;i++)maxQuotaError=Math.max(maxQuotaError,Math.abs(result.quotas[i]-targetQuotas[i])/Math.max(1,targetQuotas[i]));
    return{shrinks,area:result.area,quotas:result.quotas,mask:result.mask,iterations,maxQuotaError};
  }
  return{sourceArea,targetQuotas,sourceMask,evaluate,solve,step,nx,ny,x0,y0};
}
