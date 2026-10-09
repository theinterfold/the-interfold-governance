/** Analytic round grains on instanced quads: centers retain subpixel precision. */
export function createGrainRenderer(canvas, count) {
  const gl=canvas.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:false});
  if(!gl)throw new Error('WebGL unavailable');
  const instancing=gl.getExtension('ANGLE_instanced_arrays');
  if(!instancing)throw new Error('Instanced drawing unavailable');
  const vertex=`precision highp float;
    attribute vec2 aCorner; attribute vec3 aPoint; attribute vec3 aNext; attribute float aReveal;
    uniform float uAlpha,uEntrance;
    uniform float uScale,uZoom,uPointScale; uniform vec2 uViewport;
    varying vec2 vLocal; varying float vRadius,vOpacity;
    void main(){
      vec2 center=(mix(aPoint.xy,aNext.xy,uAlpha)-vec2(300.,225.))*uZoom+vec2(300.,225.);
      vRadius=aPoint.z*uScale*uZoom*uPointScale;
      vOpacity=uEntrance<=0.?0.:uEntrance>=1.?1.:smoothstep(aReveal*.85,aReveal*.85+.15,uEntrance);
      vLocal=aCorner*(vRadius+1.);
      vec2 clip=(center-vec2(300.,225.))*uScale*2./uViewport; clip.y=-clip.y;
      clip+=vec2(vLocal.x,-vLocal.y)*2./uViewport;
      gl_Position=vec4(clip,0.,1.);
    }`;
  const fragment=`precision highp float;
    varying vec2 vLocal; varying float vRadius,vOpacity;
    void main(){
      float coverage=clamp(vRadius+.5-length(vLocal),0.,1.)*vOpacity;
      if(coverage<=0.)discard;
      gl_FragColor=vec4(18./255.,23./255.,24./255.,coverage);
    }`;
  function compile(kind,source){const shader=gl.createShader(kind);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));return shader;}
  const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  for(const shader of gl.getAttachedShaders(program))gl.deleteShader(shader);
  gl.useProgram(program);gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.DEPTH_TEST);
  const corners=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,corners);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  const corner=gl.getAttribLocation(program,'aCorner');gl.enableVertexAttribArray(corner);gl.vertexAttribPointer(corner,2,gl.FLOAT,false,0,0);
  const pool=Array.from({length:3},()=>{const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,count*12,gl.DYNAMIC_DRAW);return{buffer,frame:null,version:-1,used:0};});
  const point=gl.getAttribLocation(program,'aPoint'),next=gl.getAttribLocation(program,'aNext'),alpha=gl.getUniformLocation(program,'uAlpha');
  for(const attribute of [point,next]){gl.enableVertexAttribArray(attribute);instancing.vertexAttribDivisorANGLE(attribute,1);}
  // Identity-derived delays stay fixed while points move. This adds one static
  // scalar per point, avoiding per-frame CPU work or changing any grain radius.
  const revealValues=new Float32Array(count);
  for(let i=0;i<count;i++){
    let hash=(i+1)>>>0;
    hash=Math.imul(hash^(hash>>>16),0x7feb352d);
    hash=Math.imul(hash^(hash>>>15),0x846ca68b);
    revealValues[i]=((hash^(hash>>>16))>>>0)/4294967296;
  }
  const revealBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,revealBuffer);gl.bufferData(gl.ARRAY_BUFFER,revealValues,gl.STATIC_DRAW);
  const reveal=gl.getAttribLocation(program,'aReveal'),entrance=gl.getUniformLocation(program,'uEntrance');
  gl.enableVertexAttribArray(reveal);gl.vertexAttribPointer(reveal,1,gl.FLOAT,false,4,0);instancing.vertexAttribDivisorANGLE(reveal,1);
  let serial=0;
  function upload(frame,exclude){
    let slot=pool.find(p=>p.frame===frame&&p.version===frame.version);
    if(!slot){slot=pool.filter(p=>p!==exclude).reduce((a,b)=>a.used<=b.used?a:b);gl.bindBuffer(gl.ARRAY_BUFFER,slot.buffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,frame.points);slot.frame=frame;slot.version=frame.version;}
    slot.used=++serial;return slot;
  }
  function attribute(location,slot){gl.bindBuffer(gl.ARRAY_BUFFER,slot.buffer);gl.vertexAttribPointer(location,3,gl.FLOAT,false,12,0);}
  const scale=gl.getUniformLocation(program,'uScale'),zoom=gl.getUniformLocation(program,'uZoom'),pointScale=gl.getUniformLocation(program,'uPointScale'),viewport=gl.getUniformLocation(program,'uViewport');
  let width=1,height=1;
  function begin(magnification,grainScale,entranceProgress){gl.useProgram(program);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.uniform1f(scale,Math.min(width/600,height/450));gl.uniform1f(zoom,magnification);gl.uniform1f(pointScale,grainScale);gl.uniform1f(entrance,Number.isFinite(entranceProgress)?Math.max(0,Math.min(1,entranceProgress)):1);gl.uniform2f(viewport,width,height);}
  // entranceProgress is normalized 0..1; omission preserves the original draw.
  function drawInterpolated(lo,hi,blend,magnification,grainScale=1,entranceProgress=1){
    begin(magnification,grainScale,entranceProgress);const a=upload(lo),b=upload(hi,a);attribute(point,a);attribute(next,b);gl.uniform1f(alpha,blend);instancing.drawArraysInstancedANGLE(gl.TRIANGLE_STRIP,0,4,count);
  }
  return {
    resize(w,h){width=w;height=h;canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);},
    draw(points,magnification,grainScale=1,entranceProgress=1){const frame={points,version:++serial};drawInterpolated(frame,frame,0,magnification,grainScale,entranceProgress);},
    drawInterpolated,
    dispose(){for(const slot of pool){gl.deleteBuffer(slot.buffer);slot.frame=null;}gl.deleteBuffer(corners);gl.deleteBuffer(revealBuffer);gl.deleteProgram(program);},
  };
}
