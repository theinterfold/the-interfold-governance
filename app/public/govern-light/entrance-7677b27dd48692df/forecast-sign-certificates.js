/** Optional exact sign certificates for unit-mix summed radial kernels.
 * Each box bounds every kernel using nearest/farthest distance, exploiting
 * monotone radial decay. Ambiguous boxes use the original point evaluator.
 * True evaluateValue/evaluateGrid remain unchanged, including expiry checks.
 */
export function withCertifiedSigns(sampler,state,{cell=.5}={}){
 const eligible=(state.fusionMix??1)>=1-1e-9&&!state.pairMixes?.some(m=>m<1-1e-9);
 if(!eligible)return sampler;
 const size=state.whiteSize??1,ratio=.1+((state.kernelRatio??.75)-.1)*(state.fusionAmount??1);
 const circles=state.circles.map((c,i)=>({x:c.x,y:c.y,r:c.r*size-(state.shrinks?.[i]??0),reach:1.5*c.r*size,invK:1/(ratio*c.r*size)}));
 const signs=new Map(),stats={tiles:0,certifiedFluid:0,certifiedWhite:0,ambiguous:0,exactSamples:0};
 function kernel(distance,c){
  const d=distance-c.r;if(d>=c.reach)return 0;
  let G=1;
  if(d>0){const u=d/c.reach,u2=u*u,u3=u2*u,u4=u3*u;G=1-10*u3+15*u4-6*u4*u;}
  return Math.exp(-d*c.invK)*G;
 }
 function classifySignBox(ax,ay,bx,by){
  let lower=0,upper=0;
  for(const c of circles){
   const dx=Math.max(ax-c.x,0,c.x-bx),dy=Math.max(ay-c.y,0,c.y-by),near2=dx*dx+dy*dy;
   if(near2>=(c.r+c.reach)*(c.r+c.reach))continue;
   const fx=Math.max(Math.abs(ax-c.x),Math.abs(bx-c.x)),fy=Math.max(Math.abs(ay-c.y),Math.abs(by-c.y));
   lower+=kernel(Math.sqrt(fx*fx+fy*fy),c);upper+=kernel(Math.sqrt(near2),c);
  }
  // Guard summation and kernel rounding. We only need a sign, never a fitted
  // scalar magnitude; uncertain cases retain exact original evaluations.
  const guard=1e-12*(1+Math.abs(lower)+Math.abs(upper));
  return lower>1+guard?1:upper<1-guard?-1:0;
 }
 function tile(ix,iy){
  const key=iy*131072+ix;let sign=signs.get(key);if(sign!==undefined)return sign;
  sign=classifySignBox(ix*cell,iy*cell,(ix+1)*cell,(iy+1)*cell);
  signs.set(key,sign);stats.tiles++;if(sign<0)stats.certifiedFluid++;else if(sign>0)stats.certifiedWhite++;else stats.ambiguous++;
  return sign;
 }
 const result=Object.create(sampler);
 result.signStats=stats;result.classifySignBox=classifySignBox;
 result.evaluateSignValue=(x,y)=>{
  const sign=tile(Math.floor(x/cell),Math.floor(y/cell));
  if(sign)return sign;stats.exactSamples++;return sampler.evaluateValue(x,y);
 };
 result.evaluateSignGrid=(x0,y0,h,nx,ny,out=new Float32Array(nx*ny))=>{
  const bx0=Math.floor(x0/cell),by0=Math.floor(y0/cell),bx1=Math.floor((x0+(nx-1)*h)/cell),by1=Math.floor((y0+(ny-1)*h)/cell);
  for(let by=by0;by<=by1;by++)for(let bx=bx0;bx<=bx1;bx++){
   const sign=tile(bx,by),i0=Math.max(0,Math.ceil((bx*cell-x0)/h)),j0=Math.max(0,Math.ceil((by*cell-y0)/h));
   const i1=Math.min(nx,Math.ceil(((bx+1)*cell-x0)/h)),j1=Math.min(ny,Math.ceil(((by+1)*cell-y0)/h));
   for(let j=j0;j<j1;j++)for(let i=i0;i<i1;i++){
    if(sign)out[j*nx+i]=sign;
    else{stats.exactSamples++;out[j*nx+i]=sampler.evaluateValue(x0+i*h,y0+j*h);}
   }
  }
  return out;
 };
 return result;
}

