// One-pixel density correction restricted to the cursor transport region.
// A five-cell halo contains deposit, two blur passes, staggered differences,
// and interpolation, so the interior receives the original stencil.
export function createLocalFineDensity(coarse,reference){
 const globalNx=(coarse.nx-1)*coarse.h+1,globalNy=(coarse.ny-1)*coarse.h+1,globalN=globalNx*globalNy;
 const globalRef=new Float32Array(globalN),indices=new Uint32Array(globalN),us=new Float32Array(globalN),vs=new Float32Array(globalN);
 for(let y=0;y<globalNy;y++)for(let x=0;x<globalNx;x++){
  const k=y*globalNx+x,fx=Math.max(0,Math.min(coarse.nx-1.001,x/coarse.h)),fy=Math.max(0,Math.min(coarse.ny-1.001,y/coarse.h)),ix=fx|0,iy=fy|0,u=fx-ix,v=fy-iy,j=iy*coarse.nx+ix;
  indices[k]=j;us[k]=u;vs[k]=v;
  globalRef[k]=((reference[j]*(1-u)+reference[j+1]*u)*(1-v)+(reference[j+coarse.nx]*(1-u)+reference[j+coarse.nx+1]*u)*v)/(coarse.h*coarse.h);
 }
 let nx=0,ny=0,n=0,x0=0,y0=0,roi,scale=1,capacity=0;
 let ref=new Float32Array(0),error=new Float32Array(0),scratch=new Float32Array(0),vx=new Float32Array(0),vy=new Float32Array(0),target=new Float32Array(0);
 let selected=new Int32Array(0),selectedCount=0,prepareMs=0;
 function prepare(weight,sampler,bounds,massScale,state){
  const started=performance.now();roi=bounds;scale=massScale;
  const left=Math.max(0,Math.floor(roi.x0-coarse.x0)-5),top=Math.max(0,Math.floor(roi.y0-coarse.y0)-5),
   right=Math.min(globalNx-1,Math.ceil(roi.x1-coarse.x0)+5),bottom=Math.min(globalNy-1,Math.ceil(roi.y1-coarse.y0)+5);
  x0=left+coarse.x0;y0=top+coarse.y0;nx=right-left+1;ny=bottom-top+1;n=nx*ny;
  if(n>capacity){capacity=n;ref=new Float32Array(n);error=new Float32Array(n);scratch=new Float32Array(n);vx=new Float32Array(n);vy=new Float32Array(n);target=new Float32Array(n);}
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
   const k=y*nx+x,g=(y+top)*globalNx+x+left,j=indices[g],u=us[g],v=vs[g];ref[k]=globalRef[g];
   let occupancy=1;
   if(ref[k]>.001&&(weight[j]>.349||weight[j+1]>.349||weight[j+coarse.nx]>.349||weight[j+coarse.nx+1]>.349)){
    const w=(weight[j]*(1-u)+weight[j+1]*u)*(1-v)+(weight[j+coarse.nx]*(1-u)+weight[j+coarse.nx+1]*u)*v;
    if(w>.35){const c=sampler.evaluate(x+x0,y+y0),a=Math.max(0,Math.min(1,.5+c.signedGap));occupancy=a*a*(3-2*a);}
   }
   target[k]=ref[k]*occupancy*(state?.retainedFractionAt?.(x+x0,y+y0)??1)*scale;
  }
  prepareMs=performance.now()-started;return {cells:n,prepareMs};
 }
 function at(a,fx,fy){const ix=fx|0,iy=fy|0,u=fx-ix,v=fy-iy,k=iy*nx+ix;return (a[k]*(1-u)+a[k+1]*u)*(1-v)+(a[k+nx]*(1-u)+a[k+nx+1]*u)*v;}
 function apply(points,move,strength=1,maxCorrection=.15){
  const started=performance.now();error.fill(0,0,n);selectedCount=0;
  if(selected.length<points.length/3)selected=new Int32Array(points.length/3);
  for(let k=0;k<points.length;k+=3){
   const px=Math.max(coarse.x0,Math.min(coarse.x0+globalNx-1.001,points[k])),py=Math.max(coarse.y0,Math.min(coarse.y0+globalNy-1.001,points[k+1]));
   const fx=px-x0,fy=py-y0;if(fx<0||fy<0||fx>=nx-1||fy>=ny-1)continue;
   const ix=fx|0,iy=fy|0,u=fx-ix,v=fy-iy,j=iy*nx+ix,m=points[k+2]**2;
   error[j]+=m*(1-u)*(1-v);error[j+1]+=m*u*(1-v);error[j+nx]+=m*(1-u)*v;error[j+nx+1]+=m*u*v;
   if(points[k]>=roi.x0&&points[k]<=roi.x1&&points[k+1]>=roi.y0&&points[k+1]<=roi.y1)selected[selectedCount++]=k;
  }
  const deposited=performance.now();
  for(let k=0;k<n;k++)error[k]-=target[k];
  for(let pass=0;pass<2;pass++){
   scratch.set(error.subarray(0,n));
   for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){const k=y*nx+x;error[k]=(scratch[k-1]+2*scratch[k]+scratch[k+1])*.25;}
   scratch.set(error.subarray(0,n));
   for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){const k=y*nx+x;error[k]=(scratch[k-nx]+2*scratch[k]+scratch[k+nx])*.25;}
  }
  const blurred=performance.now();vx.fill(0,0,n);vy.fill(0,0,n);
  for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++){const k=y*nx+x;vx[k]=error[k]-error[k+1];vy[k]=error[k]-error[k+nx];}
  const gradients=performance.now();let maxMove=0;
  for(let i=0;i<selectedCount;i++){
   const k=selected[i],x=points[k],y=points[k+1],fx=Math.max(0,Math.min(nx-1.001,x-x0)),fy=Math.max(0,Math.min(ny-1.001,y-y0)),
    fxl=Math.max(0,Math.min(nx-1.001,x-.5-x0)),fyu=Math.max(0,Math.min(ny-1.001,y-.5-y0)),gain=strength/Math.max(.04,at(ref,fx,fy)*scale);
   let dx=gain*at(vx,fxl,fy),dy=gain*at(vy,fx,fyu),length=Math.hypot(dx,dy);
   if(length>maxCorrection){dx*=maxCorrection/length;dy*=maxCorrection/length;length=maxCorrection;}
   if(length>1e-6)move(k,dx,dy);maxMove=Math.max(maxMove,length);
  }
  return {maxMove,scale,cells:n,selected:selectedCount,ms:performance.now()-started,prepareMs,stageMs:{deposit:deposited-started,blur:blurred-deposited,gradient:gradients-blurred,move:performance.now()-gradients}};
 }
 return {prepare,apply};
}
