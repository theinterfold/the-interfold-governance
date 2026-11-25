// Native geometry carried with the accepted grain frame. Nominal radius controls
// compact support and decay; effective radius alone cannot reconstruct the field.
export function packCursorRenderField(state){
 const count=Math.min(32,state.circles.length),circles=new Float32Array(count*4),size=state.whiteSize??1;
 for(let i=0;i<count;i++){const c=state.circles[i],nominal=c.r*size;circles.set([c.x,c.y,nominal-(state.shrinks?.[i]??0),nominal],i*4);}
 return {circles,fusionMix:state.fusionMix??1,pairMixes:state.pairMixes?Array.from(state.pairMixes):null,kernelRatio:state.kernelRatio??.75,fusionAmount:state.fusionAmount??1};
}

// Compact kernels and the two prescribed source pairs match govern-implicit-sdf.
// The shared p-norm is evaluated per fragment so clipped grain edges cannot leave
// a ring of whole grains at the contour. Native contours are clipped consistently
// with the cursor on or off; only the final one-pixel edge is softened.
export const cursorMaskGlsl=`
 uniform vec4 uNative[32];
 uniform vec3 uCursor;
 uniform float uFieldMix,uFieldRatio,uMaskPixelScale,uFieldEnabled;
 uniform vec2 uPairMix;
 varying vec2 vWorld;
 vec3 kernelAt(vec2 q,vec4 circle){
  float nominal=circle.w;if(nominal<=0.000000001)return vec3(0.);
  vec2 delta=q-circle.xy;float radial2=dot(delta,delta),reach=1.5*nominal,support=circle.z+reach;
  if(support<=0.||radial2>=support*support)return vec3(0.);
  float radial=max(sqrt(radial2),0.000000001),d=radial-circle.z;if(d>=reach)return vec3(0.);
  float gate=1.,derivative=0.;
  if(d>0.){float u=d/reach,u2=u*u,u3=u2*u,u4=u3*u;gate=1.-10.*u3+15.*u4-6.*u4*u;derivative=(-30.*u2+60.*u3-30.*u4)/reach;}
  float kappa=uFieldRatio*nominal,e=exp(-d/kappa);
  return vec3(e*gate,e*(derivative-gate/kappa)*delta/radial);
 }
 vec3 combineFields(vec3 a,vec3 b,float blend){
  if(a.x<=0.)return b;if(b.x<=0.)return a;
  if(blend<=0.000000001)return a.x>=b.x?a:b;
  if(blend>=0.999999999)return a+b;
  float largest=max(a.x,b.x),power=1./blend;
  float ea=exp(power*log(a.x/largest)),eb=exp(power*log(b.x/largest)),sum=ea+eb;
  float value=largest*exp(blend*log(sum));
  return vec3(value,(value/sum)*(ea*a.yz/a.x+eb*b.yz/b.x));
 }
 float cursorVisible(vec2 q){
  if(uFieldEnabled<.5)return 1.;
  vec3 field=vec3(0.);
  for(int i=0;i<32;i++){
   if(i==8||i==31)continue;
   vec3 k=kernelAt(q,uNative[i]);
   if(i==6)k=combineFields(k,kernelAt(q,uNative[8]),uPairMix.x);
   if(i==30)k=combineFields(k,kernelAt(q,uNative[31]),uPairMix.y);
   field=combineFields(field,k,uFieldMix);
  }
  if(uCursor.z>0.0001)field=combineFields(field,kernelAt(q,vec4(uCursor.xy,uCursor.z,uCursor.z)),uFieldMix);
  float gap=(1.-field.x)/max(length(field.yz),0.000001);
  return clamp(.5+gap*uMaskPixelScale,0.,1.);
 }
`;
