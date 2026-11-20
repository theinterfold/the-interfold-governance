import {geometryWgsl} from './gpu-cursor-geometry.js';
import {fineWgsl} from './gpu-cursor-fine.js';
import {packCursorGeometryCells} from './gpu-cursor-support.js';
const shader=`
struct Circle { x:f32,y:f32,effectiveR:f32,reach:f32,invKappa:f32,support2:f32,pad0:f32,pad1:f32 };
struct Params {
 nx:u32,ny:u32,count:u32,holes:u32,
 x0:f32,y0:f32,h:f32,spatialStep:f32,
 cx0:f32,cy0:f32,ch:f32,massScale:f32,
 cnx:u32,cny:u32,pad0:u32,pad1:u32,
 rx0:f32,ry0:f32,rx1:f32,ry1:f32,
 sx0:f32,sy0:f32,sx1:f32,sy1:f32,
 fnx:u32,fny:u32,fx0:f32,fy0:f32,
 frx0:f32,fry0:f32,frx1:f32,fry1:f32,
 fineStrength:f32,maxCorrection:f32,fp0:f32,fp1:f32,
};
@group(0) @binding(0) var<storage,read_write> particles:array<f32>;
@group(0) @binding(1) var<storage,read> flux:array<vec4<f32>>;
@group(0) @binding(2) var<storage,read> reference:array<f32>;
@group(0) @binding(3) var<storage,read> shapes:array<Circle>;
@group(0) @binding(4) var<storage,read> nearWall:array<u32>;
@group(0) @binding(5) var<uniform> p:Params;
${geometryWgsl}
fn referenceAt(pos:vec2<f32>)->f32{
 let f=clamp((pos-vec2<f32>(p.cx0,p.cy0))/p.ch,vec2<f32>(0.),vec2<f32>(f32(p.cnx)-1.001,f32(p.cny)-1.001));
 let ij=vec2<u32>(f);let uv=fract(f);let k=ij.y*p.cnx+ij.x;
 return mix(mix(reference[k],reference[k+1u],uv.x),mix(reference[k+p.cnx],reference[k+p.cnx+1u],uv.x),uv.y)/(p.ch*p.ch);
}
fn sampleFlux(pos:vec2<f32>,component:u32)->f32{
 let f=clamp(pos,vec2<f32>(0.),vec2<f32>(f32(p.nx)-1.001,f32(p.ny)-1.001));let ij=vec2<u32>(f);let uv=fract(f);let k=ij.y*p.nx+ij.x;
 let a=select(0.,(1.-uv.x)*(1.-uv.y),flux[k][component+2u]>.5);
 let b=select(0.,uv.x*(1.-uv.y),flux[k+1u][component+2u]>.5);
 let c=select(0.,(1.-uv.x)*uv.y,flux[k+p.nx][component+2u]>.5);
 let d=select(0.,uv.x*uv.y,flux[k+p.nx+1u][component+2u]>.5);
 let s=a+b+c+d;if(s<=1e-12){return 0.;}
 return (a*flux[k][component]+b*flux[k+1u][component]+c*flux[k+p.nx][component]+d*flux[k+p.nx+1u][component])/s;
}
fn edgeWeight(pos:vec2<f32>)->f32{
 var d=vec2<f32>(0.);
 if(pos.x<p.sx0){d.x=(p.sx0-pos.x)/(p.sx0-p.rx0);}else if(pos.x>p.sx1){d.x=(pos.x-p.sx1)/(p.rx1-p.sx1);}
 if(pos.y<p.sy0){d.y=(p.sy0-pos.y)/(p.sy0-p.ry0);}else if(pos.y>p.sy1){d.y=(pos.y-p.sy1)/(p.ry1-p.sy1);}
 let r=min(1.,length(d));return 1.-r*r*r*(10.+r*(-15.+6.*r));
}
fn velocity(pos:vec2<f32>,tau:f32)->vec2<f32>{
 let f=(pos-vec2<f32>(p.x0,p.y0))/p.h;
 var v=vec2<f32>(sampleFlux(f-vec2<f32>(1.,.5),0u),sampleFlux(f-vec2<f32>(.5,1.),1u));
 v/=max(1e-5,referenceAt(pos)*p.massScale);
 let cell=vec2<i32>(floor(f));
 if(cell.x>=0&&cell.x<i32(p.nx)&&cell.y>=0&&cell.y<i32(p.ny)&&nearWall[u32(cell.y)*p.nx+u32(cell.x)]!=0u){
  let a=evaluateAt(pos,0u);let b=evaluateAt(pos,1u);let complement=1.-tau;
  let normal=complement*a.gradient*vec2<f32>(a.nx,a.ny)+tau*b.gradient*vec2<f32>(b.nx,b.ny);
  let mag=length(normal);let gap=-(complement*a.value+tau*b.value)/max(1e-9,mag);
  if(mag>.01&&gap>=-.05*p.h&&gap<p.h){
   let n=normal/mag;let q=pos-n*gap;let aw=evaluateAt(q,0u);let bw=evaluateAt(q,1u);
   let grad=complement*aw.gradient*dot(vec2<f32>(aw.nx,aw.ny),n)+tau*bw.gradient*dot(vec2<f32>(bw.nx,bw.ny),n);
   if(grad>.01){let vn=(bw.value-aw.value)/grad;v+=(vn-dot(v,n))*min(1.,1.-gap/p.h)*n;}
  }
 }
 return v*edgeWeight(pos);
}
${fineWgsl}
@compute @workgroup_size(64) fn advect(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;if(i>=p.count){return;}let k=i*3u;var pos=vec2<f32>(particles[k],particles[k+1u]);
 if(pos.x<=p.x0+p.h||pos.x>=p.x0+(f32(p.nx)-1.)*p.h||pos.y<=p.y0+p.h||pos.y>=p.y0+(f32(p.ny)-1.)*p.h){return;}
 var tau=0.;var steps=0u;
 loop{
  if(tau>=1.-1e-9||steps>=512u){break;}
  let first=velocity(pos,tau);let speed=length(first);if(speed<1e-9){break;}
  var fraction=min(1.-tau,p.spatialStep/speed);var delta=vec2<f32>(0.);
  for(var attempt=0u;attempt<16u;attempt++){
   delta=velocity(pos+first*fraction*.5,tau+fraction*.5)*fraction;
   if(length(delta)<=p.spatialStep*1.2||fraction<1e-8){break;}fraction*=.5;
  }
  pos=sweptMove(pos,delta);tau+=fraction;steps++;
 }
 particles[k]=pos.x;particles[k+1u]=pos.y;
}
@compute @workgroup_size(64) fn project(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;if(i>=p.count){return;}let k=i*3u;let pos=projectAfter(vec2<f32>(particles[k],particles[k+1u]));particles[k]=pos.x;particles[k+1u]=pos.y;
}
`;
/** Shared physical cursor transport with resident particles through advection,
 * exact contact/projection, and local density correction. One readback commits
 * the accepted piece; callers retain unchanged CPU particles until it succeeds. */
export async function createGpuCursorTransport(device,{count,coarse,reference}){
 if(!device)throw new Error('GPU cursor transport requires a device');
 if(!Number.isInteger(count)||count<1)throw new RangeError('Invalid GPU cursor particle count');
 const U=GPUBufferUsage,visibility=GPUShaderStage.COMPUTE;
 const make=(size,usage=U.STORAGE|U.COPY_DST)=>device.createBuffer({size:Math.ceil(size/4)*4,usage});
 const particles=make(count*12,U.STORAGE|U.COPY_DST|U.COPY_SRC),ref=make(reference.length*4),readback=make(count*12,U.MAP_READ|U.COPY_DST);
 device.queue.writeBuffer(ref,0,Float32Array.from(reference));
 const layout=device.createBindGroupLayout({entries:[0,1,2,3,4,5,6,7].map(binding=>({binding,visibility,buffer:{type:binding===5?'uniform':[0,6,7].includes(binding)?'storage':'read-only-storage'}}))});
 const module=device.createShaderModule({code:shader,label:'prepared cursor physical flow'});
 const info=await module.getCompilationInfo(),errors=info.messages.filter(m=>m.type==='error');
 if(errors.length)throw Error(errors.map(m=>`${m.lineNum}:${m.linePos} ${m.message}`).join('\n'));
 const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]});
 const names=['advect','project','fineTarget','fineDeposit','fineError','fineBlurX','fineBlurY','fineGradient','fineGather'];
 const pipelines=Object.fromEntries(await Promise.all(names.map(async entryPoint=>[entryPoint,await device.createComputePipelineAsync({layout:pipelineLayout,compute:{module,entryPoint}})])));
 const {advect,project}=pipelines;
 let encoder=null,pool=[],used=0,available=true,lastError=null,destroyed=false,scopes=0,lastTimings=null,frameStarted=0;
 function closeScopes(){const pending=[];while(scopes>0){scopes--;pending.push(device.popErrorScope());}return pending;}
 function disable(error){available=false;lastError=error?.message??String(error);encoder=null;for(const pending of closeScopes())pending.catch(()=>{});}
 device.lost?.then(info=>disable(new Error(info?.message||'GPU device lost')));
 function supports(oldState,nextState){
  if(!available||destroyed)return false;
  if(!oldState?.circles?.length||oldState.circles.length>64||oldState.circles.length!==nextState?.circles?.length)return false;
  return [oldState,nextState].every(state=>(state.fusionMix??1)>=1-1e-9&&!(state.pairMixes??[]).some(m=>m<1-1e-9)&&!state.pocketTargetBounds?.length&&!state.retainedFractionAt);
 }
 function assertAvailable(){if(!available||destroyed)throw new Error(lastError||'GPU cursor transport unavailable');}
 function uploadParticles(points){
  assertAvailable();if(points.length!==count*3)throw new RangeError('GPU cursor particle count mismatch');
  frameStarted=performance.now();lastTimings={uploadMs:0,encodeMs:0,submitReadMs:0,readCopyMs:0,totalMs:0};
  device.pushErrorScope('out-of-memory');device.pushErrorScope('validation');scopes=2;
  device.queue.writeBuffer(particles,0,points);encoder=device.createCommandEncoder();used=0;lastTimings.uploadMs=performance.now()-frameStarted;
 }
 function enqueuePreparedFlow(data,{projectAfter=true,finePasses=0}={}){
  const encodeStarted=performance.now();
  const {nx,ny,x0,y0,h}=data.grid??data,n=nx*ny,holes=data.oldState.circles.length;
  assertAvailable();if(!supports(data.oldState,data.nextState))throw Error('GPU cursor transport requires unit fusion without forecast retention');if(!encoder)throw Error('Upload cursor particles before encoding');
  const support=data.sourceBounds,fineRoi=data.fineROI??{x0:support.x0-12,y0:support.y0-12,x1:support.x1+12,y1:support.y1+12};
  const globalNx=(coarse.nx-1)*coarse.h+1,globalNy=(coarse.ny-1)*coarse.h+1;
  const left=Math.max(0,Math.floor(fineRoi.x0-coarse.x0)-5),top=Math.max(0,Math.floor(fineRoi.y0-coarse.y0)-5),right=Math.min(globalNx-1,Math.ceil(fineRoi.x1-coarse.x0)+5),bottom=Math.min(globalNy-1,Math.ceil(fineRoi.y1-coarse.y0)+5);
  const fnx=right-left+1,fny=bottom-top+1,fn=fnx*fny;
  let slot=pool[used];
  if(!slot||slot.n<n||slot.holes<holes||slot.fn<fn){if(slot)for(const b of slot.buffers)b.destroy();const f=make(n*16),s=make(holes*64),near=make(n*20),params=make(144,U.UNIFORM|U.COPY_DST),fine=make(fn*24),mass=make(fn*4,U.STORAGE|U.COPY_DST);slot=pool[used]={n,holes,fn,buffers:[f,s,near,params,fine,mass],bindings:device.createBindGroup({layout,entries:[particles,f,ref,s,near,params,fine,mass].map((buffer,binding)=>({binding,resource:{buffer}}))})};}
  const [f,s,near,params,fine,mass]=slot.buffers,packedFlux=new Float32Array(n*4),packedShapes=new Float32Array(holes*16),dataParams=new ArrayBuffer(144),u=new Uint32Array(dataParams),v=new Float32Array(dataParams);
  for(let i=0;i<n;i++){packedFlux[i*4]=data.vx[i];packedFlux[i*4+1]=data.vy[i];packedFlux[i*4+2]=data.right[i]>1e-12?1:0;packedFlux[i*4+3]=data.down[i]>1e-12?1:0;}
  for(let ep=0;ep<2;ep++){const state=ep?data.nextState:data.oldState,ratio=.1+((state.kernelRatio??.75)-.1)*(state.fusionAmount??1);for(let i=0;i<holes;i++){const c=state.circles[i],nominal=c.r*state.whiteSize,eff=nominal-state.shrinks[i],reach=nominal*1.5;packedShapes.set([c.x,c.y,eff,reach,1/(nominal*ratio),(eff+reach+1e-5)**2,0,0],(ep*holes+i)*8);}}
  u.set([nx,ny,count,holes]);v.set([x0,y0,h,data.spatialStep??1.5],4);v.set([coarse.x0,coarse.y0,coarse.h,data.massScale],8);u.set([coarse.nx,coarse.ny,0,0],12);
  const roi=data.roi;v.set([roi.x0,roi.y0,roi.x1,roi.y1,support.x0,support.y0,support.x1,support.y1],16);u.set([fnx,fny],24);v.set([left+coarse.x0,top+coarse.y0,fineRoi.x0,fineRoi.y0,fineRoi.x1,fineRoi.y1,2,.45,0,0],26);
  const geometryCells=packCursorGeometryCells(data.nearWall,packedShapes,holes,{x0,y0,h,nx,ny});
  device.queue.writeBuffer(f,0,packedFlux);device.queue.writeBuffer(s,0,packedShapes);device.queue.writeBuffer(near,0,geometryCells);device.queue.writeBuffer(params,0,dataParams);
  const pass=encoder.beginComputePass();pass.setBindGroup(0,slot.bindings);pass.setPipeline(advect);pass.dispatchWorkgroups(Math.ceil(count/64));if(projectAfter){pass.setPipeline(project);pass.dispatchWorkgroups(Math.ceil(count/64));}pass.end();
  if(finePasses){
   const dispatch=(entries)=>{const finePass=encoder.beginComputePass();finePass.setBindGroup(0,slot.bindings);for(const[name,groups]of entries){finePass.setPipeline(pipelines[name]);finePass.dispatchWorkgroups(groups);}finePass.end();};
   const gridGroups=Math.ceil(fn/128),pointGroups=Math.ceil(count/128);
   dispatch([['fineTarget',gridGroups]]);
   for(let i=0;i<finePasses;i++){encoder.clearBuffer(mass);dispatch([['fineDeposit',pointGroups],['fineError',gridGroups],['fineBlurX',gridGroups],['fineBlurY',gridGroups],['fineBlurX',gridGroups],['fineBlurY',gridGroups],['fineGradient',gridGroups],['fineGather',pointGroups]]);}
  }
  used++;lastTimings.encodeMs+=performance.now()-encodeStarted;
 }
 async function submitAndRead(){
  assertAvailable();
  try{
   if(!encoder)throw Error('No GPU cursor transport is encoded');
   const submitted=performance.now();
   encoder.copyBufferToBuffer(particles,0,readback,0,count*12);device.queue.submit([encoder.finish()]);encoder=null;
   const validation=Promise.all(closeScopes()).catch(error=>[error]);
   await readback.mapAsync(GPUMapMode.READ);const mapped=performance.now();lastTimings.submitReadMs=mapped-submitted;
   const points=new Float32Array(readback.getMappedRange()).slice();readback.unmap();
   for(let k=0;k<points.length;k++)if(!Number.isFinite(points[k]))throw new Error('Non-finite GPU cursor particle');
   lastTimings.readCopyMs=performance.now()-mapped;
   const errors=await validation,error=errors.find(Boolean);if(error)throw error;
   lastTimings.totalMs=performance.now()-frameStarted;
   return points;
  }catch(error){disable(error);throw error;}
 }
 function destroy(){if(destroyed)return;destroyed=true;available=false;encoder=null;for(const slot of pool)for(const b of slot.buffers)b.destroy();particles.destroy();ref.destroy();readback.destroy();}
 return{uploadParticles,enqueuePreparedFlow,submitAndRead,supports,disable,destroy,backendType:'webgpu-cursor',get isAvailable(){return available&&!destroyed;},get lastError(){return lastError;},get lastTimings(){return lastTimings;}};
}
