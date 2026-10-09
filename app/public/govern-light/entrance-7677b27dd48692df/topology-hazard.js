// Detect a future white bridge between approaching guides at a location that is fluid now.
// The guide-derived rectangle contains the escape routes; no screen location
// or clock phase is built into this detector.
export function detectClosingPocket(grid,active,currentWeight,currentSampler,futureSampler,currentState,futureState){
  const {x0,y0,h,nx,ny}=grid,n=nx*ny,tailCount=new Uint8Array(n),inside=new Uint8Array(n),candidates=[];
  const size=futureState.whiteSize;
  for(let i=0;i<futureState.circles.length;i++){
    const c=futureState.circles[i],nominal=c.r*size,effective=nominal-(futureState.shrinks?.[i]??0),reach=effective+.9*nominal;
    const ax=Math.max(2,Math.floor((c.x-reach-x0)/h)),bx=Math.min(nx-3,Math.ceil((c.x+reach-x0)/h));
    const ay=Math.max(2,Math.floor((c.y-reach-y0)/h)),by=Math.min(ny-3,Math.ceil((c.y+reach-y0)/h));
    const inner2=effective*effective,outer2=reach*reach;
    for(let iy=ay;iy<=by;iy++)for(let ix=ax;ix<=bx;ix++){
      const p=iy*nx+ix;if(!active[p])continue;
      const dx=x0+ix*h-c.x,dy=y0+iy*h-c.y,d2=dx*dx+dy*dy;
      if(d2<inner2)inside[p]=1;
      else if(d2<outer2&&tailCount[p]<255)tailCount[p]++;
    }
  }
  for(let iy=2;iy<ny-2;iy++)for(let ix=2;ix<nx-2;ix++){
    const p=iy*nx+ix;if(!active[p]||inside[p]||tailCount[p]<2||currentWeight[p]>.97)continue;
    const px=x0+ix*h,py=y0+iy*h,forecast=futureSampler.evaluate(px,py);
    if(forecast.value<=.005||forecast.value>.5||forecast.gradient>=.05)continue;
    if(currentSampler.evaluateValue(px,py)>=-.01)continue;
    const ids=[];let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
    for(let i=0;i<futureState.circles.length;i++){
      const f=futureState.circles[i],c=currentState.circles[i],nominal=f.r*size,effective=nominal-(futureState.shrinks?.[i]??0),d=Math.hypot(px-f.x,py-f.y)-effective;
      if(d>=0&&d<.9*nominal){
        ids.push(i);left=Math.min(left,f.x-effective,c.x-effective);right=Math.max(right,f.x+effective,c.x+effective);
        top=Math.min(top,f.y-effective,c.y-effective);bottom=Math.max(bottom,f.y+effective,c.y+effective);
      }
    }
    if(ids.length<2)continue;
    candidates.push({x:px,y:py,value:forecast.value,gradient:forecast.gradient,currentValue:currentWeight[p]-1,guideIds:ids,bounds:{left:left-12,right:right+12,top:top-12,bottom:bottom+12}});
  }
  candidates.sort((a,b)=>(b.value/(b.gradient+.01))-(a.value/(a.gradient+.01)));
  const unique=new Map();
  for(const candidate of candidates){const key=candidate.guideIds.join(',');if(!unique.has(key))unique.set(key,candidate);}
  return [...unique.values()];
}

export function triangleFluidArea(state,ids,sampler,step=1){
  const [a,b,c]=ids.map(i=>state.circles[i]);
  if(!a||!b||!c)return{area:Infinity,minValue:-Infinity};
  const det=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);
  if(Math.abs(det)<1e-6)return{area:Infinity,minValue:-Infinity};
  let area=0,minValue=Infinity,samples=0;
  const left=Math.floor(Math.min(a.x,b.x,c.x)),right=Math.ceil(Math.max(a.x,b.x,c.x));
  const top=Math.floor(Math.min(a.y,b.y,c.y)),bottom=Math.ceil(Math.max(a.y,b.y,c.y));
  for(let y=top+step/2;y<bottom;y+=step)for(let x=left+step/2;x<right;x+=step){
    const u=((b.y-c.y)*(x-c.x)+(c.x-b.x)*(y-c.y))/det;
    const v=((c.y-a.y)*(x-c.x)+(a.x-c.x)*(y-c.y))/det,w=1-u-v;
    if(u<.08||v<.08||w<.08)continue;
    const value=sampler.evaluateValue(x,y);samples++;minValue=Math.min(minValue,value);if(value<=0)area+=step*step;
  }
  return{area,minValue,samples};
}
