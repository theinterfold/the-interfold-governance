import {thinDensePatches} from './density-thinning.js';

// Thin only the dense interior, once at build time. Survivors keep their radii
// and identity/order; no flickering selection or enlarged replacement grains.
export function thinInterior(points,holes=[],keepFraction=1){
  if(!Number.isFinite(keepFraction)||keepFraction<=0||keepFraction>1)
    throw new RangeError('Point retention must be greater than zero and at most one');
  const interior=points.filter(([x,y],i)=>{
    const radius=Math.hypot((x-300)/205,(y-225)/160);
    const t=Math.max(0,Math.min(1,(1-radius)/.65));
    const reduction=.58*t*t*(3-2*t);
    let hash=Math.imul((i+1)^0x9e3779b9,0x85ebca6b);hash=Math.imul(hash^(hash>>>13),0xc2b2ae35);
    return ((hash^(hash>>>16))>>>0)/4294967296>=reduction;
  });
  const selected=thinDensePatches(interior,holes);
  if(keepFraction===1)return selected;
  // Optional build profile: remove a uniform, immutable subset after the
  // existing selection. No spatial boundary or contour-specific thinning is
  // introduced, and survivors retain their source order and exact radii.
  const rank=i=>{
    let hash=Math.imul((i+1)^0x6a09e667,0x85ebca6b);
    hash=Math.imul(hash^(hash>>>13),0xc2b2ae35);
    return (hash^(hash>>>16))>>>0;
  };
  const keep=new Set(selected.map((_,i)=>i).sort((a,b)=>rank(a)-rank(b)||a-b)
    .slice(0,Math.round(selected.length*keepFraction)));
  return selected.filter((_,i)=>keep.has(i));
}
