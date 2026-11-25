// C2-continuous support for a local flow correction. The full pocket support
// stays at weight 1; receiving-fluid padding fades radially to zero. This avoids
// switching a nonzero velocity off at the straight edges of a rectangular ROI.
export function flowEdgeWeight(x,y,source,roi){
  if(!source)return 1;
  const dx=x<source.x0?(source.x0-x)/(source.x0-roi.x0):x>source.x1?(x-source.x1)/(roi.x1-source.x1):0;
  const dy=y<source.y0?(source.y0-y)/(source.y0-roi.y0):y>source.y1?(y-source.y1)/(roi.y1-source.y1):0;
  const r=Math.min(1,Math.hypot(dx,dy));
  return 1-r*r*r*(10+r*(-15+6*r));
}
