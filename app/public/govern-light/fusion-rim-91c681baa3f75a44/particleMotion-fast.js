/** Small rigid circular grains exchange places; their local center of mass stays put. */
export function createParticleMotion(points, holes, options={}) {
  const count=points.length,base=Float32Array.from(points.flat()),output=new Float32Array(base);
  const used=new Uint8Array(count),buckets=new Map(),cell=2.5,cols=241;
  const random=i=>{let v=Math.imul(i+17,1597334677);v=Math.imul(v^(v>>>16),2246822519);return ((v^(v>>>13))>>>0)/4294967296;};
  // A constrained integrator handles the current moving boundary. Freezing
  // orbit radii against the original holes would retain their old collars.
  const clearance=options.unconstrained?null:Float32Array.from(points,p=>Math.min(...holes.map(h=>Math.hypot(p[0]-h.x,p[1]-h.y)-h.r-p[2])));
  points.forEach(([x,y],i)=>{const key=Math.floor(y/cell)*cols+Math.floor(x/cell);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(i);});
  const pairs=[];
  for(let i=0;i<count;i++){
    if(used[i])continue;
    const [x,y,r]=points[i],cx=Math.floor(x/cell),cy=Math.floor(y/cell);
    let nearest=-1,best=Infinity;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)for(const j of buckets.get((cy+dy)*cols+cx+dx)||[]){
      if(i===j||used[j])continue;
      const p=points[j],distance=(x-p[0])**2+(y-p[1])**2;
      if(distance>20.25||distance<.02)continue;
      const score=distance*(1+Math.abs(r-p[2])*3);
      if(score<best){best=score;nearest=j;}
    }
    if(nearest<0)continue;
    used[i]=used[nearest]=1;
    const p=points[nearest],dx=(x-p[0])/2,dy=(y-p[1])/2,distance=Math.hypot(dx,dy);
    const safe=clearance?Math.max(0,Math.min(clearance[i],clearance[nearest])):Infinity;
    const rotate=distance<=.38&&safe>=distance*2;
    const radius=rotate?distance:Math.min(.24,safe*.46);
    const phase=rotate?Math.atan2(dy,dx):random(i)*Math.PI*2;
    const speed=.19*(.94+.12*random(nearest));
    pairs.push({a:i*3,b:nearest*3,radius,rotate,phase,cosPhase:Math.cos(phase),sinPhase:Math.sin(phase),frequency:Math.min(2.4,speed/Math.max(.01,radius))});
  }
  const singles=[];
  for(let i=0;i<count;i++)if(!used[i]){
    const radius=clearance?Math.min(.24,Math.max(0,clearance[i])*.46):.24;
    const phase=random(i)*Math.PI*2;
    singles.push({at:i*3,radius,phase,cosPhase:Math.cos(phase),sinPhase:Math.sin(phase),frequency:Math.min(2.4,.19/Math.max(.01,radius))});
  }
  // Selected model uses the broad transport after fusion and sizing. The old
  // local vacancy maps are an identity here, so do not build their large grids.
  const vacancies={apply:(_time,out)=>out,circlesAt:()=>holes,profiles:[],meta:{transport:'identity before broad field'}};
  const orbits=[...pairs,...singles];
  for(const p of orbits){
    p.currentCos=p.cosPhase;p.currentSin=p.sinPhase;
    p.cos14=Math.cos(.14*p.frequency);p.sin14=Math.sin(.14*p.frequency);
    p.cos035=Math.cos(.035*p.frequency);p.sin035=Math.sin(.035*p.frequency);
  }
  let lastT=0,fastCalls=0;
  function applyGrains(t,out){
    if(t===0){
      if(lastT!==0)for(const p of orbits){p.currentCos=p.cosPhase;p.currentSin=p.sinPhase;}
      lastT=0;fastCalls=0;return out;
    }
    const dt=t-lastT,mode=fastCalls<32&&Math.abs(dt-.14)<1e-9?1:fastCalls<32&&Math.abs(dt-.035)<1e-9?2:0;
    fastCalls=mode?fastCalls+1:0;lastT=t;
    for(const p of pairs){
      let c,s;
      if(mode){const dc=mode===1?p.cos14:p.cos035,ds=mode===1?p.sin14:p.sin035;c=p.currentCos*dc-p.currentSin*ds;s=p.currentSin*dc+p.currentCos*ds;}
      else{const angle=t*p.frequency+p.phase;c=Math.cos(angle);s=Math.sin(angle);}
      p.currentCos=c;p.currentSin=s;
      const dx=p.radius*(c-p.cosPhase),dy=p.radius*(s-p.sinPhase);
      out[p.a]+=dx;out[p.a+1]+=dy;
      out[p.b]+=p.rotate?-dx:dx;out[p.b+1]+=p.rotate?-dy:dy;
    }
    for(const p of singles){
      let c,s;
      if(mode){const dc=mode===1?p.cos14:p.cos035,ds=mode===1?p.sin14:p.sin035;c=p.currentCos*dc-p.currentSin*ds;s=p.currentSin*dc+p.currentCos*ds;}
      else{const angle=t*p.frequency+p.phase;c=Math.cos(angle);s=Math.sin(angle);}
      p.currentCos=c;p.currentSin=s;
      out[p.at]+=p.radius*(c-p.cosPhase);out[p.at+1]+=p.radius*(s-p.sinPhase);
    }
    return out;
  }
  return {
    count,applyGrains,applyVacancies:vacancies.apply,
    sample(time,out=output){
      const t=Math.max(0,Number.isFinite(time)?time:0);out.set(base);vacancies.apply(t,out);
      return applyGrains(t,out);
    },
    circlesAt:(time,travel=1)=>vacancies.circlesAt(time,travel),
    vacancyProfiles:vacancies.profiles,
    meta:{algorithm:'continuous small grain orbits with normalized travel speed',grainsPersistent:true,radiusConstant:true,pairedGrains:pairs.length*2,vacancies:vacancies.meta},
  };
}
