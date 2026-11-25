// Build-time only. Smooth, radius-weighted ink density avoids treating a dark
// patch as just another part of the radial falloff. Cells only find neighbours;
// the circular kernel has no rectangular tile boundaries.
export function localInkDensity(points){
  const radius=5,radius2=radius*radius,cells=new Map();
  for(const point of points){
    const key=`${Math.floor(point[0]/radius)},${Math.floor(point[1]/radius)}`;
    if(!cells.has(key))cells.set(key,[]);
    cells.get(key).push(point);
  }
  return Float64Array.from(points,([x,y])=>{
    const cx=Math.floor(x/radius),cy=Math.floor(y/radius);let ink=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      for(const [px,py,r] of cells.get(`${cx+dx},${cy+dy}`)||[]){
        const weight=1-((px-x)**2+(py-y)**2)/radius2;
        if(weight>0)ink+=r*r*weight*weight;
      }
    }
    return ink/(Math.PI*radius2/3);
  });
}

export function thinDensePatches(points,holes=[]){
  const density=localInkDensity(points);
  return points.filter(([x,y],i)=>{
    const keep=Math.max(.5,Math.min(1,.20/density[i]));
    if(keep===1)return true;
    // Preserve existing contour grains, with a soft transition into the body.
    let clearance=Infinity;
    for(const hole of holes)clearance=Math.min(clearance,Math.hypot(x-hole.x,y-hole.y)-hole.r);
    const t=Math.max(0,Math.min(1,(clearance-1.25)/2.75));
    const removal=(1-keep)*t*t*(3-2*t);
    let hash=Math.imul((i+1)^0x27d4eb2d,0x85ebca6b);hash=Math.imul(hash^(hash>>>13),0xc2b2ae35);
    return ((hash^(hash>>>16))>>>0)/4294967296>=removal;
  });
}
