/** Compact source support for the optional approximate pocket-only split.
 * Membership is bilinear over coverage cells; its support extends half a cell
 * beyond cell edges. Keep the union mask, including later component drift.
 * Padding is receiving fluid, not a white mask or a rigid motion collar.
 * A finite Dirichlet patch can still leave an edge seam; inspect that explicitly.
 */
const supportCache=new WeakMap();
export function pocketSourceBounds(pocket){
 if(supportCache.has(pocket))return supportCache.get(pocket);
 const g=pocket.grid;
 let minI=g.nx,minJ=g.ny,maxI=-1,maxJ=-1;
 for(let k=0;k<g.cells.length;k++)if(g.cells[k]){
  const i=k%g.nx,j=(k/g.nx)|0;
  minI=Math.min(minI,i);minJ=Math.min(minJ,j);maxI=Math.max(maxI,i);maxJ=Math.max(maxJ,j);
 }
 const b=maxI<0?null:{x0:g.x0+(minI-.5)*g.h,y0:g.y0+(minJ-.5)*g.h,x1:g.x0+(maxI+1.5)*g.h,y1:g.y0+(maxJ+1.5)*g.h};
 supportCache.set(pocket,b);return b;
}
export function pocketOnlyFlowRegions(pockets,time0,time1,{margin=28,domain=null,physical=false}={}){
 if(!(margin>=0&&time1>=time0))throw new Error('Invalid pocket-flow interval or margin');
 const regions=[];
 for(const pocket of pockets){
  // No retention change means exactly no RHS in the pocket-only mode, even
  // though physical white boundaries may keep moving. Null pockets also skip.
  // Full physical prediction is an approximate local domain split. Keep it
  // active through closure so the remaining neighboring fluid can leave.
  if(!pocket||time1<=pocket.fadeStart||time0>=(physical?pocket.expiresAt:pocket.fadeEnd))continue;
  const support=pocketSourceBounds(pocket);if(!support)continue;
  let roi={x0:support.x0-margin,y0:support.y0-margin,x1:support.x1+margin,y1:support.y1+margin};
  if(domain)roi={x0:Math.max(domain.x0,roi.x0),y0:Math.max(domain.y0,roi.y0),x1:Math.min(domain.x1,roi.x1),y1:Math.min(domain.y1,roi.y1)};
  if(roi.x0>support.x0||roi.y0>support.y0||roi.x1<support.x1||roi.y1<support.y1)throw new Error('Flow domain clips the pocket source');
  let region={roi,sourceBounds:{...support},pocketCount:1};
  for(let i=regions.length-1;i>=0;i--){
   const other=regions[i],a=region.roi,b=other.roi;
   if(a.x0>b.x1||a.x1<b.x0||a.y0>b.y1||a.y1<b.y0)continue;
   region={roi:{x0:Math.min(a.x0,b.x0),y0:Math.min(a.y0,b.y0),x1:Math.max(a.x1,b.x1),y1:Math.max(a.y1,b.y1)},
    sourceBounds:{x0:Math.min(region.sourceBounds.x0,other.sourceBounds.x0),y0:Math.min(region.sourceBounds.y0,other.sourceBounds.y0),x1:Math.max(region.sourceBounds.x1,other.sourceBounds.x1),y1:Math.max(region.sourceBounds.y1,other.sourceBounds.y1)},pocketCount:region.pocketCount+other.pocketCount};
   regions.splice(i,1);i=regions.length;
  }
  regions.push(region);
 }
 return regions;
}

