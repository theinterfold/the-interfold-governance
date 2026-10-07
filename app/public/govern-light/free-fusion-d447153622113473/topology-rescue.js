// Exact-output route helper: scalar risk tests, batched current raster and typed heap.
// The current field and routes are recomputed every step; only immutable forecasts are cached.
// Future raster caching is valid while a sampler represents one immutable
// forecast state. Production should retain one sampler per closingHazard and
// construct a fresh sampler when the forecast state changes.
const H=1;
const neighbors=[[-1,0,1],[1,0,1],[0,-1,1],[0,1,1],[-1,-1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[1,1,Math.SQRT2]];
const futureRasterCache=new WeakMap();

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

export function routeClosingPocket(particles,currentSampler,futureSampler,bounds){
  const grid=makeGrid(bounds),{X0,Y0,NX,NY,N}=grid;
  const guidance=new Float32Array(particles.length),atRisk=[];
  // This is the same bounds and exact implicit-field test used by the later
  // guide pass. Do it before rasterization so a no-risk frame can return now;
  // retain accepted samples so risky frames do not evaluate them twice.
  for(let k=0;k<particles.length;k+=3){
    const px=particles[k],py=particles[k+1],ix=Math.round((px-X0)/H),iy=Math.round((py-Y0)/H);
    if(ix<1||ix>=NX-1||iy<1||iy>=NY-1)continue;
    const now=currentSampler.evaluateValue(px,py);
    if(now>0)continue;
    const ahead=futureSampler.evaluateValue(px,py);
    if(ahead<.03)continue;
    atRisk.push({k,px,py,ix,iy,risk:ahead});
  }
  if(!atRisk.length)return{considered:0,guided:0,maxRisk:0,guidance};

  const current=new Float32Array(N),future=futureRaster(futureSampler,grid),distance=new Float32Array(N),visited=new Uint8Array(N),heap=createMinHeap(Math.min(N,4096));
  distance.fill(Infinity);
  if(currentSampler.evaluateGrid)currentSampler.evaluateGrid(X0,Y0,H,NX,NY,current);
  else for(let y=0;y<NY;y++)for(let x=0;x<NX;x++)current[y*NX+x]=currentSampler.evaluateValue(X0+x*H,Y0+y*H);
  for(let k=0;k<N;k++)if(current[k]<=-.02&&future[k]<=-.2)distance[k]=0;
  // Interior zero-cost seeds cannot improve any distance. Queue only the
  // frontier adjacent to a reachable non-seed cell; this gives the same
  // multi-source shortest distances without processing the safe interior.
  for(let y=0;y<NY;y++)for(let x=0;x<NX;x++){
    const k=y*NX+x;if(distance[k]!==0)continue;
    for(const [ox,oy] of neighbors){
      const xx=x+ox,yy=y+oy;if(xx<0||xx>=NX||yy<0||yy>=NY)continue;
      const j=yy*NX+xx;if(distance[j]!==0&&current[j]<=-.002){heap.push(0,k);break;}
    }
  }
  while(heap.length){
    heap.pop();const cost=heap.poppedCost,k=heap.poppedIndex;if(visited[k]||cost>distance[k]+1e-5)continue;visited[k]=1;
    const x=k%NX,y=(k/NX)|0;
    for(const [ox,oy,length] of neighbors){const xx=x+ox,yy=y+oy;if(xx<0||xx>=NX||yy<0||yy>=NY)continue;const j=yy*NX+xx;if(current[j]>-.002)continue;
      const close=Math.max(0,(current[j]+.2)/.2),candidate=cost+length*H*(1+2*close);
      if(candidate<distance[j]){distance[j]=candidate;heap.push(candidate,j);}
    }
  }
  let considered=0,guided=0,maxRisk=0;
  for(const {k,px,py,ix,iy,risk} of atRisk){
    let p=-1,seedScore=Infinity;
    for(let oy=-2;oy<=2;oy++)for(let ox=-2;ox<=2;ox++){
      if(ix+ox<0||ix+ox>=NX||iy+oy<0||iy+oy>=NY)continue;
      const j=(iy+oy)*NX+ix+ox;
      if(current[j]>-.002||!Number.isFinite(distance[j]))continue;
      const score=distance[j]+.5*Math.hypot(X0+(ix+ox)*H-px,Y0+(iy+oy)*H-py);
      if(score<seedScore){seedScore=score;p=j;}
    }
    if(p<0)continue;
    considered++;maxRisk=Math.max(maxRisk,risk);
    const seedX=p%NX,seedY=(p/NX)|0;
    let best=distance[p],bestX=seedX,bestY=seedY;
    for(const [ox,oy] of neighbors){const xx=seedX+ox,yy=seedY+oy,j=yy*NX+xx;if(xx<1||xx>=NX-1||yy<1||yy>=NY-1||current[j]>-.002)continue;if(distance[j]<best-1e-5){best=distance[j];bestX=xx;bestY=yy;}}
    if(bestX===ix&&bestY===iy)continue;
    const vx=X0+bestX*H-px,vy=Y0+bestY*H-py,n=Math.sqrt(vx*vx+vy*vy)||1;
    guidance[k]=vx/n;guidance[k+1]=vy/n;guided++;
  }
  return{considered,guided,maxRisk,guidance};
}
