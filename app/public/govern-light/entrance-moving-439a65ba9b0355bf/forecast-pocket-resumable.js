/** Resumable scheduling of the exact compressed detector.
 * Each yield follows one geometry inspection; no sampling times or math change.
 * The supplied samplerAt MUST be pure and frozen to the activation geometry
 * controls, clock rates, source area and initial area-solver shrink.
 */
/** Locate the first actual enclosed fluid island in a short geometry forecast.
 * No particle positions, paths or density heuristics enter this descriptor.
 */
export function* forecastPocketSteps(options){
  const {samplerAt,closureTime,roi}=options;
  const h=options.h??.125,step=options.step??.025,lookback=options.lookback??.8;
  const minArea=options.minArea??1,timeTolerance=options.timeTolerance??.002;
  const fadeDuration=options.fadeDuration??.4,fadeLead=options.fadeLead??.05;
  if(!roi||!Number.isFinite(closureTime)||!(h>0&&step>0))throw new Error('Invalid forecast pocket configuration');
  const x0=Math.floor(roi.x0/h)*h,y0=Math.floor(roi.y0/h)*h;
  const nx=Math.max(4,Math.ceil((roi.x1-x0)/h)),ny=Math.max(4,Math.ceil((roi.y1-y0)/h)),n=nx*ny;
  const fnx=2*nx-1,fny=2*ny-1;
  const cache=new Map();let geometrySamples=0,midpointEvaluations=0;
  const centersBuffer=new Float32Array(n),fluid=new Uint8Array(n),seen=new Uint8Array(n),queue=new Int32Array(n);
  const midpointState=new Uint8Array(fnx*fny);
  const deltaX=Int8Array.of(-1,1,0,0,-1,1,-1,1),deltaY=Int8Array.of(0,0,-1,1,-1,-1,1,1);
  const nodeOfCell=new Int32Array(n),nodeLeft=new Int32Array(n),nodeRight=new Int32Array(n),nodeTop=new Int32Array(n),nodeBottom=new Int32Array(n),nodeSeen=new Uint8Array(n),nodeQueue=new Int32Array(n);
  function compressedComponents(sampler){
    nodeOfCell.fill(-1);nodeSeen.fill(0);let nodeCount=0;
    function node(i0,j0,i1,j1){
      const id=nodeCount++;nodeLeft[id]=i0;nodeRight[id]=i1;nodeTop[id]=j0;nodeBottom[id]=j1;
      for(let j=j0;j<=j1;j++)nodeOfCell.fill(id,j*nx+i0,j*nx+i1+1);
    }
    // A certified fluid rectangle has every vertex and every internal edge
    // midpoint fluid. Collapsing it is exactly graph contraction, not coarsening
    // the final contour; ambiguous rectangles keep each fine-grid vertex.
    const span=16;
    for(let j0=0;j0<ny;j0+=span)for(let i0=0;i0<nx;i0+=span){
      const i1=Math.min(nx-1,i0+span-1),j1=Math.min(ny-1,j0+span-1);
      const sign=sampler.classifySignBox(x0+(i0+.5)*h,y0+(j0+.5)*h,x0+(i1+.5)*h,y0+(j1+.5)*h);
      if(sign<0)node(i0,j0,i1,j1);
      else for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++)if(fluid[j*nx+i])node(i,j,i,j);
    }
    function flood(start,collect=false){
      let head=0,tail=1,count=0,sumX=0,sumY=0,minI=nx,maxI=0,minJ=ny,maxJ=0;
      nodeQueue[0]=start;nodeSeen[start]=1;
      function visit(i,j){
        for(let direction=0;direction<8;direction++){
          const di=deltaX[direction],dj=deltaY[direction],ii=i+di,jj=j+dj;
          if(ii<0||ii>=nx||jj<0||jj>=ny)continue;
          const next=nodeOfCell[jj*nx+ii];if(next<0||nodeSeen[next])continue;
          const mi=2*i+di,mj=2*j+dj,index=mj*fnx+mi;
          let certified=midpointState[index];
          if(!certified){
            certified=(sampler.evaluateSignValue??sampler.evaluateValue).call(sampler,x0+h*.5+mi*h*.5,y0+h*.5+mj*h*.5)<=0?1:2;
            midpointState[index]=certified;midpointEvaluations++;
          }
          if(certified===2)continue;
          nodeSeen[next]=1;nodeQueue[tail++]=next;
        }
      }
      while(head<tail){
        const id=nodeQueue[head++],i0=nodeLeft[id],i1=nodeRight[id],j0=nodeTop[id],j1=nodeBottom[id];
        if(collect){
          const width=i1-i0+1,height=j1-j0+1,cells=width*height;count+=cells;
          sumX+=cells*(i0+i1+1)*.5;sumY+=cells*(j0+j1+1)*.5;
          minI=Math.min(minI,i0);maxI=Math.max(maxI,i1);minJ=Math.min(minJ,j0);maxJ=Math.max(maxJ,j1);
        }
        for(let i=i0;i<=i1;i++){visit(i,j0);if(j1!==j0)visit(i,j1);}
        for(let j=j0+1;j<j1;j++){visit(i0,j);if(i1!==i0)visit(i1,j);}
      }
      return{nodes:tail,count,sumX,sumY,minI,maxI,minJ,maxJ};
    }
    const exterior=k=>{const id=nodeOfCell[k];if(id>=0&&!nodeSeen[id])flood(id);};
    for(let i=0;i<nx;i++){exterior(i);exterior((ny-1)*nx+i);}
    for(let j=1;j<ny-1;j++){exterior(j*nx);exterior(j*nx+nx-1);}
    let best=null;
    for(let k=0;k<n;k++){
      const id=nodeOfCell[k];if(id<0||nodeSeen[id])continue;
      const c=flood(id,true),area=c.count*h*h;
      if(area<minArea||area>(options.maxArea??Infinity)||best&&area<=best.area)continue;
      const cells=new Uint8Array(n);
      for(let z=0;z<c.nodes;z++){
        const id=nodeQueue[z];for(let j=nodeTop[id];j<=nodeBottom[id];j++)cells.fill(1,j*nx+nodeLeft[id],j*nx+nodeRight[id]+1);
      }
      best={cells,area,count:c.count,centroid:{x:x0+h*c.sumX/c.count,y:y0+h*c.sumY/c.count},
        bounds:{x0:x0+c.minI*h,y0:y0+c.minJ*h,x1:x0+(c.maxI+1)*h,y1:y0+(c.maxJ+1)*h}};
    }
    return best;
  }

  function inspect(time){
    const key=time.toFixed(9);if(cache.has(key))return cache.get(key);
    const sampler=samplerAt(time);
    // Keep exactly the same fine-grid topology, but raster only cell centres.
    // Certify edge midpoints lazily when flood-fill actually needs an edge.
    const centers=(sampler.evaluateSignGrid??sampler.evaluateGrid).call(sampler,x0+h*.5,y0+h*.5,h,nx,ny,centersBuffer);
    geometrySamples++;seen.fill(0);midpointState.fill(0);
    for(let k=0;k<n;k++)fluid[k]=centers[k]<=0?1:0;
    if(sampler.classifySignBox){const best=compressedComponents(sampler);cache.set(key,best);return best;}
    function flood(start,collect=false){
      let head=0,tail=1,sumX=0,sumY=0,minI=nx,maxI=0,minJ=ny,maxJ=0;
      queue[0]=start;seen[start]=1;
      while(head<tail){
        const k=queue[head++],i=k%nx,j=(k/nx)|0;
        if(collect){
          sumX+=i+.5;sumY+=j+.5;
          if(i<minI)minI=i;if(i>maxI)maxI=i;if(j<minJ)minJ=j;if(j>maxJ)maxJ=j;
        }
        for(let direction=0;direction<8;direction++){
          const di=deltaX[direction],dj=deltaY[direction],ii=i+di,jj=j+dj;
          if(ii<0||ii>=nx||jj<0||jj>=ny)continue;
          const next=jj*nx+ii;if(!fluid[next]||seen[next])continue;
          const mi=2*i+di,mj=2*j+dj,index=mj*fnx+mi;
          let certified=midpointState[index];
          if(!certified){
            certified=(sampler.evaluateSignValue??sampler.evaluateValue).call(sampler,x0+h*.5+mi*h*.5,y0+h*.5+mj*h*.5)<=0?1:2;
            midpointState[index]=certified;midpointEvaluations++;
          }
          if(certified===2)continue;
          seen[next]=1;queue[tail++]=next;
        }
      }
      return {count:tail,sumX,sumY,minI,maxI,minJ,maxJ};
    }
    let best=null;
    for(let i=0;i<nx;i++){
      if(fluid[i]&&!seen[i])flood(i);
      const bottom=(ny-1)*nx+i;if(fluid[bottom]&&!seen[bottom])flood(bottom);
    }
    for(let j=1;j<ny-1;j++){
      const left=j*nx,right=left+nx-1;
      if(fluid[left]&&!seen[left])flood(left);
      if(fluid[right]&&!seen[right])flood(right);
    }
    for(let k=0;k<n;k++)if(fluid[k]&&!seen[k]){
      const component=flood(k,true),area=component.count*h*h;
      if(area<minArea||area>(options.maxArea??Infinity))continue;
      if(!best||area>best.area){
        const cells=new Uint8Array(n);for(let i=0;i<component.count;i++)cells[queue[i]]=1;
        best={cells,area,count:component.count,
          centroid:{x:x0+h*component.sumX/component.count,y:y0+h*component.sumY/component.count},
          bounds:{x0:x0+component.minI*h,y0:y0+component.minJ*h,x1:x0+(component.maxI+1)*h,y1:y0+(component.maxJ+1)*h}};
      }
    }
    cache.set(key,best);return best;
  }
  const begin=Math.max(0,closureTime-lookback),steps=Math.max(1,Math.ceil((closureTime-begin)/step));
  let lo=begin,hi=null,found=null,unbracketed=false;
  for(let index=0;index<=steps;index++){
    const time=begin+(closureTime-begin)*index/steps,result=inspect(time);
    yield {phase:'scan',time,geometrySamples};
    if(result){hi=time;found=result;unbracketed=index===0;break;}
    lo=time;
  }
  if(hi===null)return null;
  if(!unbracketed)while(hi-lo>timeTolerance){
    const mid=(lo+hi)*.5,result=inspect(mid);
    yield {phase:'bracket',time:mid,geometrySamples};
    if(result){hi=mid;found=result;}else lo=mid;
  }
  const sealTime=hi,fadeEnd=sealTime-fadeLead,fadeStart=fadeEnd-fadeDuration;
  const expiresAt=options.expiresAt??closureTime+.2;
  // Follow only overlapping later islands, without expanding by an arbitrary
  // radius. This covers a small drift before disappearance.
  const cells=found.cells.slice();
  for(let time=hi+step;time<expiresAt;time+=step){
    const later=inspect(time);
    yield {phase:'coverage',time,geometrySamples};
    if(!later)continue;
    let overlap=false;for(let k=0;k<n;k++)if(cells[k]&&later.cells[k]){overlap=true;break;}
    if(overlap)for(let k=0;k<n;k++)if(later.cells[k])cells[k]=1;
  }
  const finalSampler=samplerAt(expiresAt);
  let maskCells=0,uncoveredCells=0;
  for(let k=0;k<n;k++)if(cells[k]){
    maskCells++;
    if(finalSampler.evaluateValue(x0+(k%nx+.5)*h,y0+(Math.floor(k/nx)+.5)*h)<-1e-6)uncoveredCells++;
  }
  const finalUncoveredArea=uncoveredCells*h*h;
  if(finalUncoveredArea>(options.maxUncoveredArea??Math.max(.25,4*h*h))){
    options.onReject?.({reason:'island-not-covered-by-target',sealTime,expiresAt,finalUncoveredArea});
    return null;
  }
  // Cover two numerical cells beyond the sampled component: one for bilinear
  // reconstruction and one for its partially retained fringe. Otherwise a
  // wall-adjacent material point can retain target density immediately before
  // the pocket seals. At h=.125 this coverage is only .25 px.
  const coverage=cells.slice();
  for(let k=0;k<n;k++)if(cells[k]){
    const i=k%nx,j=(k/nx)|0;
    for(let dj=-2;dj<=2;dj++)for(let di=-2;di<=2;di++){
      const ii=i+di,jj=j+dj;if(ii>=0&&ii<nx&&jj>=0&&jj<ny)coverage[jj*nx+ii]=1;
    }
  }
  const grid={x0,y0,h,nx,ny,cells:coverage,componentCells:cells};
  let sx0=nx,sy0=ny,sx1=-1,sy1=-1;
  for(let k=0;k<n;k++)if(coverage[k]){const i=k%nx,j=(k/nx)|0;sx0=Math.min(sx0,i);sx1=Math.max(sx1,i);sy0=Math.min(sy0,j);sy1=Math.max(sy1,j);}
  const supportBounds={x0:x0+(sx0-.5)*h,y0:y0+(sy0-.5)*h,x1:x0+(sx1+1.5)*h,y1:y0+(sy1+1.5)*h};
  function membershipAt(x,y){
    const gx=(x-x0)/h-.5,gy=(y-y0)/h-.5,i=Math.floor(gx),j=Math.floor(gy),u=gx-i,v=gy-j;
    if(i< -1||j< -1||i>=nx||j>=ny)return 0;
    const at=(xx,yy)=>xx>=0&&xx<nx&&yy>=0&&yy<ny?grid.cells[yy*nx+xx]:0;
    return (at(i,j)*(1-u)+at(i+1,j)*u)*(1-v)+(at(i,j+1)*(1-u)+at(i+1,j+1)*u)*v;
  }
  function retainedFractionAt(x,y,time){
    if(time<=fadeStart||time>expiresAt)return 1;
    let phase=Math.max(0,Math.min(1,(time-fadeStart)/Math.max(1e-9,fadeDuration)));
    phase=phase*phase*phase*(10+phase*(-15+6*phase));
    return 1-phase*membershipAt(x,y);
  }
  return {sealTime,fadeStart,fadeEnd,expiresAt,roi:{x0,y0,x1:x0+nx*h,y1:y0+ny*h},
    grid,supportBounds,area:found.area,maskArea:maskCells*h*h,centroid:found.centroid,bounds:found.bounds,membershipAt,retainedFractionAt,
    diagnostics:{geometrySamples,midpointEvaluations,unbracketed,sealBracket:[lo,hi],gridSpacing:h,coveragePadding:2*h,componentCells:found.count,finalUncoveredArea}};
}


/** Compatibility entry point: identical synchronous descriptor and diagnostics. */
export function detectForecastPocket(options){
  const iterator=forecastPocketSteps(options);
  let next;do{next=iterator.next();}while(!next.done);
  return next.value;
}

/**
 * Service this job BEFORE attaching targets/building a frame's physical state.
 * Two inspections per .1 model-second frame amortize a 45-sample forecast over
 * approximately 2.3 model seconds, without changing its eventual fade times.
 * If service reaches the earliest possible fade, complete synchronously before
 * the caller can render/use that frame. A late job therefore cannot skip fade.
 */
export function createForecastPocketJob(options){
  let iterator=forecastPocketSteps(options),done=false,cancelled=false,value=null,progress=null;
  const deadline=Math.max(0,options.closureTime-(options.lookback??.8))-(options.fadeLead??.05)-(options.fadeDuration??.4);
  const stats={advances:0,inspectionYields:0,totalMs:0,maxAdvanceMs:0,maxInspectionMs:0,forcedCompletions:0,completedAt:null};
  function advance({maxSamples=2,now=-Infinity,force=false}={}){
    if(done)return {done,value,cancelled,progress,stats};
    if(!Number.isFinite(maxSamples)||maxSamples<1)throw new Error('Forecast work budget must be a positive number');
    const drain=force||now>=deadline,limit=drain?Infinity:Math.floor(maxSamples),started=performance.now();
    if(drain)stats.forcedCompletions++;
    stats.advances++;
    for(let count=0;count<limit;count++){
      const start=performance.now(),next=iterator.next();
      stats.maxInspectionMs=Math.max(stats.maxInspectionMs,performance.now()-start);
      if(next.done){done=true;value=next.value;stats.completedAt=Number.isFinite(now)?now:null;iterator=null;break;}
      progress=next.value;stats.inspectionYields++;
    }
    const elapsed=performance.now()-started;stats.totalMs+=elapsed;stats.maxAdvanceMs=Math.max(stats.maxAdvanceMs,elapsed);
    return {done,value,cancelled,progress,stats};
  }
  return {deadline,advance,complete:(now=-Infinity)=>advance({force:true,now}),
    cancel(){if(!done){iterator.return();iterator=null;done=true;cancelled=true;value=null;}},
    get done(){return done;},get cancelled(){return cancelled;},get value(){return value;},get progress(){return progress;},get stats(){return stats;}};
}
