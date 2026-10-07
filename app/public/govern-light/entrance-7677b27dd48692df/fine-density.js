/** Resolve narrow wakes with local density pressure at individual-grain scale.
 * The same observation kernel is used for actual and desired point mass. */
export function createFineDensity(coarse,reference,totalMass){
  const h=1,x0=coarse.x0,y0=coarse.y0,nx=(coarse.nx-1)*3+1,ny=(coarse.ny-1)*3+1,n=nx*ny;
  const ref=new Float32Array(n),error=new Float32Array(n),scratch=new Float32Array(n),
    vx=new Float32Array(n),vy=new Float32Array(n),target=new Float32Array(n);
  const coarseIndex=new Uint32Array(n),coarseU=new Float64Array(n),coarseV=new Float64Array(n);
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
    const k=y*nx+x,fx=Math.max(0,Math.min(coarse.nx-1.001,(x0+x-coarse.x0)/coarse.h)),
      fy=Math.max(0,Math.min(coarse.ny-1.001,(y0+y-coarse.y0)/coarse.h)),ix=fx|0,iy=fy|0;
    coarseIndex[k]=iy*coarse.nx+ix;coarseU[k]=fx-ix;coarseV[k]=fy-iy;
  }
  function sampleCoarse(a,k){const j=coarseIndex[k],u=coarseU[k],v=coarseV[k];return (a[j]*(1-u)+a[j+1]*u)*(1-v)+(a[j+coarse.nx]*(1-u)+a[j+coarse.nx+1]*u)*v;}
  function atFineClamped(a,fx,fy){
    const ix=fx|0,iy=fy|0,u=fx-ix,v=fy-iy,k=iy*nx+ix;
    return (a[k]*(1-u)+a[k+1]*u)*(1-v)+(a[k+nx]*(1-u)+a[k+nx+1]*u)*v;
  }
  for(let k=0;k<n;k++)ref[k]=sampleCoarse(reference,k)/9;
  function apply(points,weight,sampler,move,strength=1,maxCorrection=.15,state){
    const t0=performance.now();
    error.fill(0);let capacity=0;
    for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
      const k=y*nx+x;
      let occupancy=1;
      const j=coarseIndex[k];
      if(ref[k]>.001&&(weight[j]>.349||weight[j+1]>.349||weight[j+coarse.nx]>.349||weight[j+coarse.nx+1]>.349)&&sampleCoarse(weight,k)>.35){
        const px=x+x0,py=y+y0;
        const c=sampler.evaluate(px,py),u=Math.max(0,Math.min(1,.5+c.signedGap));
        occupancy=u*u*(3-2*u);
      }
      target[k]=ref[k]*occupancy*(state?.retainedFractionAt?.(x+x0,y+y0)??1);capacity+=target[k];
    }
    const tTarget=performance.now();
    const scale=totalMass/capacity;
    for(let k=0;k<points.length;k+=3){
      const fx=Math.max(0,Math.min(nx-1.001,points[k]-x0)),fy=Math.max(0,Math.min(ny-1.001,points[k+1]-y0)),
        ix=fx|0,iy=fy|0,u=fx-ix,v=fy-iy,j=iy*nx+ix,m=points[k+2]**2;
      error[j]+=m*(1-u)*(1-v);error[j+1]+=m*u*(1-v);
      error[j+nx]+=m*(1-u)*v;error[j+nx+1]+=m*u*v;
    }
    const tDeposit=performance.now();
    for(let k=0;k<n;k++)error[k]-=target[k]*scale;
    for(let pass=0;pass<2;pass++){
      scratch.set(error);
      for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){const k=y*nx+x;error[k]=(scratch[k-1]+2*scratch[k]+scratch[k+1])*.25;}
      scratch.set(error);
      for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){const k=y*nx+x;error[k]=(scratch[k-nx]+2*scratch[k]+scratch[k+nx])*.25;}
    }
    const tBlur=performance.now();
    for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++){
      const k=y*nx+x;vx[k]=error[k]-error[k+1];vy[k]=error[k]-error[k+nx];
    }
    const tGradient=performance.now();
    let maxMove=0;
    for(let k=0;k<points.length;k+=3){
      const x=points[k],y=points[k+1],
        fx=Math.max(0,Math.min(nx-1.001,(x-x0)/h)),fy=Math.max(0,Math.min(ny-1.001,(y-y0)/h)),
        fxl=Math.max(0,Math.min(nx-1.001,(x-.5-x0)/h)),fyu=Math.max(0,Math.min(ny-1.001,(y-.5-y0)/h)),
        gain=strength/Math.max(.04,atFineClamped(ref,fx,fy)*scale);
      let dx=gain*atFineClamped(vx,fxl,fy),dy=gain*atFineClamped(vy,fx,fyu),length=Math.sqrt(dx*dx+dy*dy);
      if(length>maxCorrection){dx*=maxCorrection/length;dy*=maxCorrection/length;length=maxCorrection;}
      if(length>1e-6)move(k,dx,dy);maxMove=Math.max(maxMove,length);
    }
    const tMove=performance.now();
    return {maxMove,scale,stageMs:{target:tTarget-t0,deposit:tDeposit-tTarget,blur:tBlur-tDeposit,gradient:tGradient-tBlur,move:tMove-tGradient}};
  }
  return {apply};
}
