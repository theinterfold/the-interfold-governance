import {createTemporalCloseGrid} from './temporal-close-grid.js';
// Temporal evacuation routes retain particles until their latest safe departure.
// Immutable forecasts are cached; current geometry and route deadlines are rebuilt each step.
// The current field and routes are recomputed every step; only immutable forecasts are cached.
// Future raster caching is valid while a sampler represents one immutable
// forecast state. Production should retain one sampler per closingHazard and
// construct a fresh sampler when the forecast state changes.
const H=1;
const neighbors=[[-1,0,1],[1,0,1],[0,-1,1],[0,1,1],[-1,-1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[1,1,Math.SQRT2]];
const futureRasterCache=new WeakMap();
const selectedByHazard=new WeakMap();

function createMinHeap(initialCapacity=256){
  let costs=new Float64Array(initialCapacity),indices=new Uint32Array(initialCapacity),size=0;
  const heap={poppedCost:0,poppedIndex:0};
  heap.push=(cost,index)=>{
    if(size===costs.length){const next=new Float64Array(costs.length*2),nextIndices=new Uint32Array(indices.length*2);next.set(costs);nextIndices.set(indices);costs=next;indices=nextIndices;}
    let j=size++;
    while(j){const p=(j-1)>>1;if(costs[p]<=cost)break;costs[j]=costs[p];indices[j]=indices[p];j=p;}
    costs[j]=cost;indices[j]=index;
  };
  heap.pop=()=>{
    const lastIndex=--size;heap.poppedCost=costs[0];heap.poppedIndex=indices[0];
    if(lastIndex){const lastCost=costs[lastIndex],lastParticle=indices[lastIndex];let j=0;
      while(true){const a=j*2+1;if(a>=lastIndex)break;const b=a+1,c=b<lastIndex&&costs[b]<costs[a]?b:a;if(costs[c]>=lastCost)break;costs[j]=costs[c];indices[j]=indices[c];j=c;}
      costs[j]=lastCost;indices[j]=lastParticle;
    }
  };
  Object.defineProperty(heap,'length',{get:()=>size});
  return heap;
}

function makeGrid(bounds){
  const X0=Math.floor(bounds.left/H)*H,Y0=Math.floor(bounds.top/H)*H;
  const NX=Math.ceil((bounds.right-X0)/H)+1,NY=Math.ceil((bounds.bottom-Y0)/H)+1;
  return{X0,Y0,NX,NY,N:NX*NY,key:`${X0},${Y0},${NX},${NY}`};
}
function futureRaster(futureSampler,grid){
  let byGrid=futureRasterCache.get(futureSampler);
  if(!byGrid){byGrid=new Map();futureRasterCache.set(futureSampler,byGrid);}
  let raster=byGrid.get(grid.key);
  if(raster)return raster;
  raster=new Float32Array(grid.N);
  if(futureSampler.evaluateGrid)futureSampler.evaluateGrid(grid.X0,grid.Y0,H,grid.NX,grid.NY,raster);
  else for(let y=0;y<grid.NY;y++)for(let x=0;x<grid.NX;x++){
    const k=y*grid.NX+x;
    raster[k]=futureSampler.evaluateValue(grid.X0+x*H,grid.Y0+y*H);
  }
  byGrid.set(grid.key,raster);
  return raster;
}

function convexHull(points){
  if(!points||points.length<3)return [];
  const p=points.map(v=>({x:v.x,y:v.y})).sort((a,b)=>a.x-b.x||a.y-b.y);
  const cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const lower=[],upper=[];
  for(const q of p){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),q)<=0)lower.pop();lower.push(q);}
  for(const q of p.slice().reverse()){while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),q)<=0)upper.pop();upper.push(q);}
  lower.pop();upper.pop();return lower.concat(upper);
}
function insideHull(x,y,hull){
  if(hull.length<3)return false;
  for(let i=0;i<hull.length;i++){
    const a=hull[i],b=hull[(i+1)%hull.length];
    // 0.1 coordinate unit tolerance at a guide-centre edge, never a broad collar.
    if((b.x-a.x)*(y-a.y)-(b.y-a.y)*(x-a.x)<-.1*Math.hypot(b.x-a.x,b.y-a.y))return false;
  }
  return true;
}

const timelineCache=new WeakMap();
const edgeTimelineCache=new WeakMap();
export function routeClosingPocket(particles,currentSampler,futureSampler,bounds,guideCenters,clock){
  const guidance=new Float32Array(particles.length),pushScale=new Float32Array(particles.length/3),departures=new Float64Array(particles.length/3);departures.fill(Infinity);
  const empty={considered:0,guided:0,maxRisk:0,guidance,pushScale,departures};
  const hull=convexHull(guideCenters);if(hull.length<3||!clock.samples)return empty;
  // Admit points that the moving guide triangle will sweep over. Persistence
  // keeps their exit route active if the pressure flow later carries them out.
  const futureHull=convexHull(clock.futureGuideCenters);
  const grid=makeGrid(bounds),{X0,Y0,NX,NY,N}=grid,atRisk=[];
  let selected=selectedByHazard.get(futureSampler);if(!selected){selected=new Uint8Array(particles.length/3);selectedByHazard.set(futureSampler,selected);}
  for(let k=0;k<particles.length;k+=3){
    const px=particles[k],py=particles[k+1],ix=Math.round((px-X0)/H),iy=Math.round((py-Y0)/H);
    if(ix<1||ix>=NX-1||iy<1||iy>=NY-1||(!selected[k/3]&&!insideHull(px,py,hull)&&!insideHull(px,py,futureHull)))continue;
    const now=currentSampler.evaluateValue(px,py);if(now>0)continue;const risk=futureSampler.evaluateValue(px,py);if(risk<.03)continue;
    selected[k/3]=1;atRisk.push({k,px,py,ix,iy,risk,now});
  }
  if(!atRisk.length)return empty;
  const current=new Float32Array(N);currentSampler.evaluateGrid(X0,Y0,H,NX,NY,current);
  let temporal=timelineCache.get(futureSampler);if(!temporal){temporal=createTemporalCloseGrid(clock.samples,{...grid,H});timelineCache.set(futureSampler,temporal);}
  const close=temporal.closeTimesAt(clock.time,current),future=futureRaster(futureSampler,grid),latest=new Float64Array(N),parent=new Int32Array(N),visited=new Uint8Array(N),heap=createMinHeap(Math.min(N,4096));
  latest.fill(-Infinity);parent.fill(-1);
  let edgeTimelines=edgeTimelineCache.get(futureSampler);if(!edgeTimelines){edgeTimelines=new Map();edgeTimelineCache.set(futureSampler,edgeTimelines);}
  let firstFuture=0;while(firstFuture<clock.samples.length&&clock.samples[firstFuture].time<=clock.time+1e-9)firstFuture++;
  function exactClosingTime(x,y,value,cache){
    if(value>-.002)return clock.time;
    const fx=(x-X0)/H,fy=(y-Y0)/H,ix=Math.round(fx),iy=Math.round(fy);
    if(Math.abs(fx-ix)<1e-10&&Math.abs(fy-iy)<1e-10&&ix>=0&&ix<NX&&iy>=0&&iy<NY)return close[iy*NX+ix];
    const count=clock.samples.length;
    let closing=count;
    if(cache){
      // H=1 edges sample quarters (axis) or sixths (diagonal), so their
      // coordinates lie on this exact integer lattice. Keys remain unique.
      const key=Math.round(fx*12)+Math.round(fy*12)*((NX-1)*12+1);
      let entry=edgeTimelines.get(key);
      if(!entry){
        const next=new Uint16Array(count+1);next[count]=count;
        for(let i=count-1;i>=0;i--)next[i]=clock.samples[i].sampler.evaluateValue(x,y)>-.002?i:next[i+1];
        entry={next,firstFuture:-1,closing:count};edgeTimelines.set(key,entry);
      }
      if(entry.firstFuture!==firstFuture){entry.firstFuture=firstFuture;entry.closing=entry.next[firstFuture];}
      closing=entry.closing;
    }else for(let i=firstFuture;i<count;i++)if(clock.samples[i].sampler.evaluateValue(x,y)>-.002){closing=i;break;}
    return closing===count?Infinity:Math.max(clock.time,(closing?clock.samples[closing-1].time:clock.time)-.1);
  }
  const isSafe=k=>current[k]<=-.02&&future[k]<=-.2&&close[k]>=clock.targetTime;
  for(let k=0;k<N;k++)if(isSafe(k))latest[k]=clock.targetTime;
  for(let y=0;y<NY;y++)for(let x=0;x<NX;x++){
    const k=y*NX+x;if(latest[k]!==clock.targetTime)continue;
    for(const [ox,oy] of neighbors){const xx=x+ox,yy=y+oy;if(xx<0||xx>=NX||yy<0||yy>=NY)continue;const j=yy*NX+xx;if(latest[j]!==clock.targetTime&&current[j]<=-.002){heap.push(-clock.targetTime,k);break;}}
  }
  while(heap.length){
    heap.pop();const departure=-heap.poppedCost,k=heap.poppedIndex;if(visited[k]||departure<latest[k]-1e-8)continue;visited[k]=1;
    const x=k%NX,y=(k/NX)|0,px=X0+x*H,py=Y0+y*H;
    for(const [ox,oy,length] of neighbors){
      const xx=x+ox,yy=y+oy;if(xx<0||xx>=NX||yy<0||yy>=NY)continue;const j=yy*NX+xx;if(current[j]>-.002)continue;
      const optimistic=Math.min(close[j],departure-length*H*1.3/15);if(optimistic<=latest[j]+1e-8)continue;
      const candidate=connectionLatest(X0+xx*H,Y0+yy*H,px,py,departure,true);if(candidate<=latest[j]+1e-8)continue;
      latest[j]=candidate;parent[j]=k;heap.push(-candidate,j);
    }
  }
  function connectionLatest(ax,ay,bx,by,endLatest,cache=false,originValue,originClose){
    const length=Math.hypot(bx-ax,by-ay),n=Math.max(1,Math.ceil(length/.25)),step=length/n;
    let departure=endLatest,travel=0;
    for(let i=0;i<=n;i++){
      const u=i/n,x=ax+(bx-ax)*u,y=ay+(by-ay)*u;
      const value=i===0&&originValue!==undefined?originValue:currentSampler.evaluateValue(x,y);if(value>0)return -Infinity;
      if(i)travel+=step*(1+2*Math.max(0,(value+.2)/.2))*1.3/15;
      const closes=i===0&&originClose!==undefined?originClose:exactClosingTime(x,y,value,cache);
      departure=Math.min(departure,closes-travel);
    }
    return Math.min(departure,endLatest-travel);
  }
  function queryRoute(px,py,now=currentSampler.evaluateValue(px,py),stopWhenInactive=false){
    if(now>0)return null;
    const ix=Math.round((px-X0)/H),iy=Math.round((py-Y0)/H);
    let p=-1,best=-Infinity,bestOrder=Infinity;
    const originClose=exactClosingTime(px,py,now,false),attachments=[];
    for(let oy=-2;oy<=2;oy++)for(let ox=-2;ox<=2;ox++){
      const xx=ix+ox,yy=iy+oy;if(xx<0||xx>=NX||yy<0||yy>=NY)continue;
      const j=yy*NX+xx;if(current[j]>-.002||!Number.isFinite(latest[j]))continue;
      const x=X0+xx*H,y=Y0+yy*H,order=(oy+2)*5+ox+2;
      const optimistic=Math.min(originClose,latest[j]-Math.hypot(x-px,y-py)*1.3/15);
      attachments.push({j,x,y,order,optimistic});
    }
    // Rank upper bounds, preserving the original raster-order tie winner.
    // The small strict-pruning margin covers accumulation rounding in travel.
    attachments.sort((a,b)=>b.optimistic-a.optimistic||a.order-b.order);
    for(const {j,x,y,order,optimistic} of attachments){
      if(optimistic<best-1e-9||(optimistic===best&&order>bestOrder))continue;
      const candidate=connectionLatest(px,py,x,y,latest[j],false,now,originClose);
      if(candidate>best||(p>=0&&candidate===best&&order<bestOrder)){best=candidate;p=j;bestOrder=order;}
      // Any certified attachment beyond the inactive threshold proves zero
      // correction this step. Keep a nonzero direction so GPU fallback stays
      // identical; the post-density query always computes the complete route.
      if(stopWhenInactive&&best>=clock.time+.4&&Math.hypot(X0+(p%NX)*H-px,Y0+Math.floor(p/NX)*H-py)>1e-7)return {target:p,departure:best};
    }
    if(p<0)return null;
    let target=p;const next=parent[p];
    if(next>=0){
      const shortcut=connectionLatest(px,py,X0+(next%NX)*H,Y0+Math.floor(next/NX)*H,latest[next],false,now,originClose);
      if(shortcut>=best-1e-8){target=next;best=shortcut;}
    }
    return {target,departure:best};
  }
  // Pressure and fine density can move a point after its guidance was computed.
  // Reattach that real position to the existing temporal graph, then spend the
  // original movement budget along its proven segments, stopping at each turn.
  function followParticle(k,budget,move){
    if(!(budget>0))return;
    const route=queryRoute(particles[k],particles[k+1]);if(!route)return;
    let target=route.target;
    for(let segments=0;budget>1e-7&&target>=0&&segments<16;segments++){
      const tx=X0+(target%NX)*H,ty=Y0+Math.floor(target/NX)*H;
      const x=particles[k],y=particles[k+1],dx=tx-x,dy=ty-y,length=Math.hypot(dx,dy);
      if(length<1e-6){target=parent[target];continue;}
      const travel=Math.min(length,budget);
      move(k,dx/length*travel,dy/length*travel);budget-=travel;
      // A clipped or displaced step must be reattached next time. Never turn
      // from a position that did not actually reach the certified waypoint.
      if(Math.hypot(particles[k]-tx,particles[k+1]-ty)>1e-4)break;
      target=parent[target];
    }
  }
  let considered=0,guided=0,maxRisk=0,unreachable=0,late=0;
  for(const {k,px,py,risk,now} of atRisk){
    const route=queryRoute(px,py,now,true);if(!route){unreachable++;continue;}
    const {target,departure:best}=route;considered++;maxRisk=Math.max(maxRisk,risk);if(best<clock.time)late++;
    const vx=X0+(target%NX)*H-px,vy=Y0+Math.floor(target/NX)*H-py,n=Math.hypot(vx,vy);if(n<1e-7)continue;
    guidance[k]=vx/n;guidance[k+1]=vy/n;departures[k/3]=best;pushScale[k/3]=Math.max(0,Math.min(1,(clock.time+.4-best)/.4));guided++;
  }
  return{considered,guided,maxRisk,guidance,pushScale,departures,unreachable,late,followParticle};
}
