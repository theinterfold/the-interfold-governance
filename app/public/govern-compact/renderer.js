var O=`
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
`;var z=Object.freeze({strength:8,reach:2,settleMs:340});function _(a={}){let l=(e,d,s)=>Number.isFinite(a[e])?Math.max(d,Math.min(s,a[e])):z[e];return{strength:l("strength",0,8),reach:l("reach",1,2.5),settleMs:l("settleMs",40,400)}}function q(){let a=new Float32Array(2),l=null;function e(){l=null,a.fill(0)}function d(s,A,S=z.settleMs){if(!(s?.r>0)||!Number.isFinite(s.x+s.y+A))return e(),a;let i=l?(A-l.time)/1e3:0;if(i<=0||i>.15)a.fill(0);else{let h=(s.x-l.x)/i,R=(s.y-l.y)/i,v=Math.hypot(h,R),g=2.4/Math.max(450,v),b=-Math.expm1(-i/(v>1?.035:S/1e3));a[0]+=(h*g-a[0])*b,a[1]+=(R*g-a[1])*b,v===0&&Math.hypot(...a)<.001&&a.fill(0)}return l={x:s.x,y:s.y,time:A},a}return{update:d,reset:e}}var D=`
  uniform vec3 uCursor;
  uniform vec2 uGrainShift;
  uniform float uGrainReach;
  vec2 respondToCursor(vec2 position) {
    if (uCursor.z <= 0.) return position;
    vec2 q = (position - uCursor.xy) / (uCursor.z * uGrainReach);
    float s = dot(q, q);
    if (s >= 1.) return position;
    float f = 1. - s;
    // Curl of a compact stream function: no first-order density compression.
    // Both displacement and its first derivative vanish at the circular limit.
    float crossFlow = uGrainShift.x * q.y - uGrainShift.y * q.x;
    return position + f*f*f*uGrainShift - 6.*f*f*crossFlow*vec2(q.y,-q.x);
  }
`;function ce(a,l){let e=a.getContext("webgl",{alpha:!0,antialias:!1,premultipliedAlpha:!1});if(!e)throw new Error("WebGL unavailable");let d=e.getExtension("ANGLE_instanced_arrays");if(!d)throw new Error("Instanced drawing unavailable");let s=`precision highp float;
    attribute vec2 aCorner; attribute vec3 aPoint; attribute vec3 aNext; attribute float aReveal;
    uniform float uAlpha,uEntrance;
    uniform float uScale,uZoom,uPointScale; uniform vec2 uViewport;
    varying vec2 vLocal,vWorld; varying float vRadius,vOpacity;
    ${D}
    void main(){
      vec2 position=respondToCursor(mix(aPoint.xy,aNext.xy,uAlpha));
      vec2 center=(position-vec2(300.,225.))*uZoom+vec2(300.,225.);
      vRadius=aPoint.z*uScale*uZoom*uPointScale;
      vOpacity=uEntrance<=0.?0.:uEntrance>=1.?1.:smoothstep(aReveal*.85,aReveal*.85+.15,uEntrance);
      vLocal=aCorner*(vRadius+1.);
      vWorld=position+vLocal/(uScale*uZoom);
      vec2 clip=(center-vec2(300.,225.))*uScale*2./uViewport; clip.y=-clip.y;
      clip+=vec2(vLocal.x,-vLocal.y)*2./uViewport;
      gl_Position=vec4(clip,0.,1.);
    }`,A=`precision highp float;
    ${O}
    varying vec2 vLocal; varying float vRadius,vOpacity;
    void main(){
      float coverage=clamp(vRadius+.5-length(vLocal),0.,1.)*vOpacity*cursorVisible(vWorld);
      if(vRadius<=0.||coverage<=0.)discard;
      gl_FragColor=vec4(vec3(18.,23.,24.)/255.,coverage);
    }`;function S(r,t){let o=e.createShader(r);if(e.shaderSource(o,t),e.compileShader(o),!e.getShaderParameter(o,e.COMPILE_STATUS))throw new Error(e.getShaderInfoLog(o));return o}let i=e.createProgram();if(e.attachShader(i,S(e.VERTEX_SHADER,s)),e.attachShader(i,S(e.FRAGMENT_SHADER,A)),e.linkProgram(i),!e.getProgramParameter(i,e.LINK_STATUS))throw new Error(e.getProgramInfoLog(i));for(let r of e.getAttachedShaders(i))e.deleteShader(r);e.useProgram(i),e.enable(e.BLEND),e.blendFuncSeparate(e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA),e.disable(e.DEPTH_TEST);let h=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,h),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),e.STATIC_DRAW);let R=e.getAttribLocation(i,"aCorner");e.enableVertexAttribArray(R),e.vertexAttribPointer(R,2,e.FLOAT,!1,0,0);let v=Array.from({length:3},()=>{let r=e.createBuffer();return e.bindBuffer(e.ARRAY_BUFFER,r),e.bufferData(e.ARRAY_BUFFER,l*12,e.DYNAMIC_DRAW),{buffer:r,frame:null,version:-1,used:0}}),g=e.getAttribLocation(i,"aPoint"),b=e.getAttribLocation(i,"aNext"),V=e.getUniformLocation(i,"uAlpha");for(let r of[g,b])e.enableVertexAttribArray(r),d.vertexAttribDivisorANGLE(r,1);let C=new Float32Array(l);for(let r=0;r<l;r++){let t=r+1>>>0;t=Math.imul(t^t>>>16,2146121005),t=Math.imul(t^t>>>15,2221713035),C[r]=((t^t>>>16)>>>0)/4294967296}let G=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,G),e.bufferData(e.ARRAY_BUFFER,C,e.STATIC_DRAW);let L=e.getAttribLocation(i,"aReveal"),H=e.getUniformLocation(i,"uEntrance");e.enableVertexAttribArray(L),e.vertexAttribPointer(L,1,e.FLOAT,!1,4,0),d.vertexAttribDivisorANGLE(L,1);let U=0;function P(r,t){let o=v.find(u=>u.frame===r&&u.version===r.version);return o||(o=v.filter(u=>u!==t).reduce((u,f)=>u.used<=f.used?u:f),e.bindBuffer(e.ARRAY_BUFFER,o.buffer),e.bufferSubData(e.ARRAY_BUFFER,0,r.points),o.frame=r,o.version=r.version),o.used=++U,o}function w(r,t){e.bindBuffer(e.ARRAY_BUFFER,t.buffer),e.vertexAttribPointer(r,3,e.FLOAT,!1,12,0)}let Y=e.getUniformLocation(i,"uScale"),W=e.getUniformLocation(i,"uZoom"),Z=e.getUniformLocation(i,"uPointScale"),X=e.getUniformLocation(i,"uViewport"),$=e.getUniformLocation(i,"uNative[0]"),N=e.getUniformLocation(i,"uCursor"),j=e.getUniformLocation(i,"uFieldMix"),K=e.getUniformLocation(i,"uFieldRatio"),J=e.getUniformLocation(i,"uPairMix"),Q=e.getUniformLocation(i,"uMaskPixelScale"),B=e.getUniformLocation(i,"uFieldEnabled"),k=new Float32Array(32*4),y=1,E=1,T=q(),ee=e.getUniformLocation(i,"uGrainShift"),re=e.getUniformLocation(i,"uGrainReach"),M=_();function ie(r,t,o,u,f){let n=r.maskGeometry,m=t.maskGeometry??n;if(!n?.circles||!m?.circles){e.uniform1f(B,0),e.uniform3f(N,0,0,0);return}e.uniform1f(B,1);let p=Math.max(0,Math.min(1,o));for(let c=0;c<128;c++)k[c]=(n.circles[c]??0)+((m.circles[c]??0)-(n.circles[c]??0))*p;let x=(c,F)=>(n[c]??F)+((m[c]??F)-(n[c]??F))*p;e.uniform4fv($,k),e.uniform3f(N,f?.x??0,f?.y??0,Math.max(0,f?.r??0)),e.uniform1f(j,x("fusionMix",1)),e.uniform1f(K,.1+(x("kernelRatio",.75)-.1)*x("fusionAmount",1)),e.uniform2f(J,(n.pairMixes?.[0]??n.fusionMix??1)+((m.pairMixes?.[0]??m.fusionMix??1)-(n.pairMixes?.[0]??n.fusionMix??1))*p,(n.pairMixes?.[1]??n.fusionMix??1)+((m.pairMixes?.[1]??m.fusionMix??1)-(n.pairMixes?.[1]??n.fusionMix??1))*p),e.uniform1f(Q,Math.min(y/600,E/450)*u)}function te(r,t,o){e.useProgram(i),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),e.uniform1f(Y,Math.min(y/600,E/450)),e.uniform1f(W,r),e.uniform1f(Z,t),e.uniform1f(H,Number.isFinite(o)?Math.max(0,Math.min(1,o)):1),e.uniform2f(X,y,E)}function I(r,t,o,u,f=1,n=1,m=null,p=performance.now()){te(u,f,n),ie(r,t,o,u,m);let x=T.update(r.maskGeometry?.circles?m:null,p,M.settleMs);e.uniform2f(ee,x[0]*M.strength,x[1]*M.strength),e.uniform1f(re,3*M.reach);let c=P(r),F=P(t,c);w(g,c),w(b,F),e.uniform1f(V,o),d.drawArraysInstancedANGLE(e.TRIANGLE_STRIP,0,4,l)}return{setGrainResponse(r){M=_(r)},resize(r,t){T.reset(),y=r,E=t,a.width=r,a.height=t,e.viewport(0,0,r,t)},draw(r,t,o=1,u=1){let f={points:r,version:++U};I(f,f,0,t,o,u)},drawInterpolated:I,dispose(){for(let r of v)e.deleteBuffer(r.buffer),r.frame=null;e.deleteBuffer(h),e.deleteBuffer(G),e.deleteProgram(i)}}}export{ce as createGrainRenderer};
