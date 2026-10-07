/** Subpixel pair pressure uses particle neighbours, never target grid rows.
 * Radii are read only. Unequal exclusion distances keep the original grain.
 * The caller constrains each displacement against the current white surface. */
export function createParticleSpacing(count,grid,reference){
  const cell=1.25,cols=560,rows=440,x0=-50,y0=-50;
  const head=new Int32Array(cols*rows),next=new Int32Array(count),radii=new Float32Array(count),
    dx=new Float32Array(count),dy=new Float32Array(count),variation=new Float32Array(count);
  for(let i=0;i<count;i++){
    let v=Math.imul(i+19,1597334677);v=Math.imul(v^(v>>>16),2246822519);
    variation[i]=.8+.4*((v^(v>>>13))>>>0)/4294967296;
  }
  function density(x,y){
    const gx=Math.max(0,Math.min(grid.nx-1.001,(x-grid.x0)/grid.h)),
      gy=Math.max(0,Math.min(grid.ny-1.001,(y-grid.y0)/grid.h)),ix=gx|0,iy=gy|0,
      u=gx-ix,v=gy-iy,k=iy*grid.nx+ix;
    return ((reference[k]*(1-u)+reference[k+1]*u)*(1-v)+
      (reference[k+grid.nx]*(1-u)+reference[k+grid.nx+1]*u)*v)/(grid.h*grid.h);
  }
  function apply(points,move,gain=.3){
    head.fill(-1);next.fill(-1);dx.fill(0);dy.fill(0);
    for(let i=0,k=0;i<count;i++,k+=3){
      const x=points[k],y=points[k+1],cx=Math.floor((x-x0)/cell),cy=Math.floor((y-y0)/cell);
      radii[i]=Math.min(.6,.45*points[k+2]/Math.sqrt(Math.max(.001,density(x,y)))*variation[i]);
      if(cx<0||cy<0||cx>=cols||cy>=rows)continue;
      const key=cy*cols+cx;next[i]=head[key];head[key]=i;
    }
    let pairs=0,active=0,maxMove=0;
    for(let i=0,k=0;i<count;i++,k+=3){
      const x=points[k],y=points[k+1],cx=Math.floor((x-x0)/cell),cy=Math.floor((y-y0)/cell);
      if(cx<1||cy<1||cx>=cols-1||cy>=rows-1)continue;
      for(let yy=cy-1;yy<=cy+1;yy++)for(let xx=cx-1;xx<=cx+1;xx++)
        for(let j=head[yy*cols+xx];j>=0;j=next[j]){
          if(j<=i)continue;
          let vx=x-points[j*3],vy=y-points[j*3+1],d2=vx*vx+vy*vy;
          const reach=radii[i]+radii[j];if(d2>=reach*reach)continue;
          if(d2<1e-10){const a=variation[i]*53+variation[j]*17;vx=Math.cos(a)*1e-5;vy=Math.sin(a)*1e-5;d2=1e-10;}
          const d=Math.sqrt(d2),f=.5*gain*(reach-d)/d;
          dx[i]+=vx*f;dy[i]+=vy*f;dx[j]-=vx*f;dy[j]-=vy*f;pairs++;
        }
    }
    for(let i=0;i<count;i++){
      const d=Math.hypot(dx[i],dy[i]);if(d<1e-6)continue;
      const s=Math.min(1,.12/d);move(i*3,dx[i]*s,dy[i]*s);active++;maxMove=Math.max(maxMove,d*s);
    }
    return {pairs,active,maxMove};
  }
  return {apply};
}
