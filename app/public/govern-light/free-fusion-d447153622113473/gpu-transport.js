/** Experimental GPU pressure/grain transport. The GPU performs the common
 * feasible moves and marks near-wall contacts for the original CPU collision
 * routine. Exact CPU handling of flagged moves preserves contour behavior. */
const WG=256;
const shader=/* wgsl */`
struct Circle { x:f32, y:f32, effectiveR:f32, reach:f32, invKappa:f32, support2:f32 };
struct Output { x:f32, y:f32, needsCpu:u32, unused:u32 };
struct Params {
  count:u32, nx:u32, ny:u32, unused0:u32,
  x0:f32, y0:f32, h:f32, stepGain:f32,
  fusionMix:f32, pairMix0:f32, pairMix1:f32, uncertainty:f32,
};
@group(0) @binding(0) var<storage,read> particles:array<f32>;
@group(0) @binding(1) var<storage,read> field:array<vec2<f32>>;
@group(0) @binding(2) var<storage,read> weightGrid:array<f32>;
@group(0) @binding(3) var<storage,read> grain:array<f32>;
@group(0) @binding(4) var<storage,read> previousGrain:array<f32>;
@group(0) @binding(5) var<storage,read> circles:array<Circle>;
@group(0) @binding(6) var<storage,read_write> output:array<Output>;
@group(0) @binding(7) var<uniform> params:Params;
fn clampGridX(x:f32)->f32{return clamp((x-params.x0)/params.h,0.0,f32(params.nx)-1.001);}
fn clampGridY(y:f32)->f32{return clamp((y-params.y0)/params.h,0.0,f32(params.ny)-1.001);}
fn gridPoint(x:f32,y:f32)->vec4<f32>{
  let fx=clampGridX(x);let fy=clampGridY(y);
  let ix=u32(fx);let iy=u32(fy);
  return vec4<f32>(f32(iy*params.nx+ix),fx-f32(ix),fy-f32(iy),0.0);
}
fn interpolateWeight(x:f32,y:f32)->f32{
  let g=gridPoint(x,y);let k=u32(g.x);let u=g.y;let v=g.z;
  return mix(mix(weightGrid[k],weightGrid[k+1u],u),mix(weightGrid[k+params.nx],weightGrid[k+params.nx+1u],u),v);
}
fn interpolateField(x:f32,y:f32,component:u32)->f32{
  let g=gridPoint(x,y);let k=u32(g.x);let u=g.y;let v=g.z;
  if(component==0u){return mix(mix(field[k].x,field[k+1u].x,u),mix(field[k+params.nx].x,field[k+params.nx+1u].x,u),v);}
  return mix(mix(field[k].y,field[k+1u].y,u),mix(field[k+params.nx].y,field[k+params.nx+1u].y,u),v);
}
fn exactWeight(x:f32,y:f32)->f32{
  var values:array<f32,32>;
  for(var i:u32=0u;i<32u;i++){
    let c=circles[i];let dx=x-c.x;let dy=y-c.y;let rad2=dx*dx+dy*dy;
    if(rad2>=c.support2){values[i]=0.0;continue;}
    let distance=sqrt(rad2)-c.effectiveR;
    if(distance>=c.reach){values[i]=0.0;continue;}
    var gate=1.0;
    if(distance>0.0){let u=distance/c.reach;let u2=u*u;let u3=u2*u;gate=1.0-10.0*u3+15.0*u3*u-6.0*u3*u2;}
    values[i]=exp(-distance*c.invKappa)*gate;
  }
  var pairA=values[6];var pairB=values[8];var pairMix=params.pairMix0;
  if(pairMix<=1e-9){values[6]=max(pairA,pairB);}
  else if(pairMix>=1.0-1e-9){values[6]=pairA+pairB;}
  else if(pairA<=0.0||pairB<=0.0){values[6]=max(pairA,pairB);}
  else{let high=max(pairA,pairB);values[6]=high*pow(pow(pairA/high,1.0/pairMix)+pow(pairB/high,1.0/pairMix),pairMix);}
  values[8]=0.0;
  pairA=values[30];pairB=values[31];pairMix=params.pairMix1;
  if(pairMix<=1e-9){values[30]=max(pairA,pairB);}
  else if(pairMix>=1.0-1e-9){values[30]=pairA+pairB;}
  else if(pairA<=0.0||pairB<=0.0){values[30]=max(pairA,pairB);}
  else{let high=max(pairA,pairB);values[30]=high*pow(pow(pairA/high,1.0/pairMix)+pow(pairB/high,1.0/pairMix),pairMix);}
  values[31]=0.0;
  let mixAmount=params.fusionMix;
  if(mixAmount<=1e-9){var maximum=0.0;for(var i:u32=0u;i<32u;i++){maximum=max(maximum,values[i]);}return maximum;}
  if(mixAmount>=1.0-1e-9){var total=0.0;for(var i:u32=0u;i<32u;i++){total+=values[i];}return total;}
  var maximum=0.0;for(var i:u32=0u;i<32u;i++){maximum=max(maximum,values[i]);}
  if(maximum<=0.0){return 0.0;}
  var sum=0.0;for(var i:u32=0u;i<32u;i++){if(values[i]>0.0){sum+=pow(values[i]/maximum,1.0/mixAmount);}}
  return maximum*pow(sum,mixAmount);
}
@compute @workgroup_size(${WG}) fn step(@builtin(global_invocation_id) gid:vec3<u32>){
  let i=gid.x;if(i>=params.count){return;}
  let k=i*3u;let startX=particles[k];let startY=particles[k+1u];
  let offset=params.h*0.5;
  var dx=interpolateField(startX-offset,startY,0u);
  var dy=interpolateField(startX,startY-offset,1u);
  let magnitude=length(vec2<f32>(dx,dy));
  if(magnitude>2.2){dx*=2.2/magnitude;dy*=2.2/magnitude;}
  dx=dx*params.stepGain+grain[k]-previousGrain[k];
  dy=dy*params.stepGain+grain[k+1u]-previousGrain[k+1u];
  if(abs(dx)+abs(dy)<1e-8){output[i]=Output(startX,startY,0u,0u);return;}
  let length2=dx*dx+dy*dy;
  let steps=select(u32(ceil(sqrt(length2)/0.5)),1u,length2<=0.25);
  let sx=dx/f32(steps);let sy=dy/f32(steps);
  var x=startX;var y=startY;var needsCpu=0u;
  for(var j:u32=0u;j<steps;j++){
    let toX=x+sx;let toY=y+sy;
    let g=gridPoint(toX,toY);let p=u32(g.x);
    if(weightGrid[p]<0.25&&weightGrid[p+1u]<0.25&&weightGrid[p+params.nx]<0.25&&weightGrid[p+params.nx+1u]<0.25){x=toX;y=toY;continue;}
    if(interpolateWeight(toX,toY)<0.25){x=toX;y=toY;continue;}
    let value=exactWeight(toX,toY)-1.0;
    if(value<=-params.uncertainty){x=toX;y=toY;continue;}
    needsCpu=1u;break;
  }
  if(needsCpu!=0u){output[i]=Output(startX+dx,startY+dy,1u,0u);}
  else{output[i]=Output(x,y,0u,0u);}
}
`;

export async function createGpuTransport(grid,device,count){
  if(!Number.isInteger(count)||count<1)throw Error('Invalid particle count');
  const n=grid.nx*grid.ny,SU=GPUBufferUsage,SM=GPUShaderStage;
  const buffer=(size,usage)=>device.createBuffer({size:Math.ceil(size/4)*4,usage});
  const particles=buffer(count*12,SU.STORAGE|SU.COPY_DST);
  const field=buffer(n*8,SU.STORAGE|SU.COPY_DST);
  const weightGrid=buffer(n*4,SU.STORAGE|SU.COPY_DST);
  const grain=buffer(count*12,SU.STORAGE|SU.COPY_DST);
  const previousGrain=buffer(count*12,SU.STORAGE|SU.COPY_DST);
  const circles=buffer(32*24,SU.STORAGE|SU.COPY_DST);
  const output=buffer(count*16,SU.STORAGE|SU.COPY_SRC);
  const params=buffer(48,SU.UNIFORM|SU.COPY_DST);
  const readback=buffer(count*16,SU.COPY_DST|SU.MAP_READ);
  const layout=device.createBindGroupLayout({entries:[
    {binding:0,visibility:SM.COMPUTE,buffer:{type:'read-only-storage'}},
    {binding:1,visibility:SM.COMPUTE,buffer:{type:'read-only-storage'}},
    {binding:2,visibility:SM.COMPUTE,buffer:{type:'read-only-storage'}},
    {binding:3,visibility:SM.COMPUTE,buffer:{type:'read-only-storage'}},
    {binding:4,visibility:SM.COMPUTE,buffer:{type:'read-only-storage'}},
    {binding:5,visibility:SM.COMPUTE,buffer:{type:'read-only-storage'}},
    {binding:6,visibility:SM.COMPUTE,buffer:{type:'storage'}},
    {binding:7,visibility:SM.COMPUTE,buffer:{type:'uniform'}},
  ]});
  const module=device.createShaderModule({code:shader,label:'gpu-transport'});
  const info=await module.getCompilationInfo(),errors=info.messages.filter(m=>m.type==='error');
  if(errors.length)throw Error('GPU transport WGSL: '+errors.map(m=>`${m.lineNum}:${m.linePos} ${m.message}`).join(' | '));
  const pipeline=await device.createComputePipelineAsync({layout:device.createPipelineLayout({bindGroupLayouts:[layout]}),compute:{module,entryPoint:'step'}});
  const bindGroup=device.createBindGroup({layout,entries:[
    {binding:0,resource:{buffer:particles}},{binding:1,resource:{buffer:field}},
    {binding:2,resource:{buffer:weightGrid}},{binding:3,resource:{buffer:grain}},
    {binding:4,resource:{buffer:previousGrain}},{binding:5,resource:{buffer:circles}},
    {binding:6,resource:{buffer:output}},{binding:7,resource:{buffer:params}},
  ]});
  const packedField=new Float32Array(n*2),packedCircles=new Float32Array(32*6),packedParams=new ArrayBuffer(48),paramsU32=new Uint32Array(packedParams),paramsF32=new Float32Array(packedParams);
  paramsU32[0]=count;paramsU32[1]=grid.nx;paramsU32[2]=grid.ny;paramsU32[3]=0;
  paramsF32[4]=grid.x0;paramsF32[5]=grid.y0;paramsF32[6]=grid.h;
  let destroyed=false;
  async function step(pointTriples,dxGrid,dyGrid,wGrid,grainTriples,previousGrainTriples,state,stepGain=1,uncertainty=.01){
    if(destroyed)throw Error('GPU transport destroyed');
    if(pointTriples.length!==count*3||grainTriples.length!==count*3||previousGrainTriples.length!==count*3||dxGrid.length!==n||dyGrid.length!==n||wGrid.length!==n||state.circles.length!==32)throw Error('GPU transport input size mismatch');
    for(let k=0,j=0;k<n;k++,j+=2){packedField[j]=dxGrid[k];packedField[j+1]=dyGrid[k];}
    const size=state.whiteSize??1,ratio=.1+((state.kernelRatio??.75)-.1)*(state.fusionAmount??1);
    for(let i=0,j=0;i<32;i++,j+=6){
      const c=state.circles[i],nominal=c.r*size,effectiveR=nominal-(state.shrinks?.[i]??0),reach=1.5*nominal;
      packedCircles[j]=c.x;packedCircles[j+1]=c.y;packedCircles[j+2]=effectiveR;packedCircles[j+3]=reach;
      packedCircles[j+4]=1/(ratio*nominal);packedCircles[j+5]=(effectiveR+reach+1e-5)**2;
    }
    paramsF32[7]=stepGain;paramsF32[8]=state.fusionMix??1;
    paramsF32[9]=state.pairMixes?.[0]??1;paramsF32[10]=state.pairMixes?.[1]??1;paramsF32[11]=uncertainty;
    device.queue.writeBuffer(particles,0,pointTriples);
    device.queue.writeBuffer(field,0,packedField);
    device.queue.writeBuffer(weightGrid,0,wGrid);
    device.queue.writeBuffer(grain,0,grainTriples);
    device.queue.writeBuffer(previousGrain,0,previousGrainTriples);
    device.queue.writeBuffer(circles,0,packedCircles);
    device.queue.writeBuffer(params,0,packedParams);
    const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,bindGroup);pass.dispatchWorkgroups(Math.ceil(count/WG));pass.end();
    encoder.copyBufferToBuffer(output,0,readback,0,count*16);device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const raw=readback.getMappedRange(),f32=new Float32Array(raw),u32=new Uint32Array(raw),positions=new Float32Array(count*2),uncertain=[];
    for(let i=0,j=0,k=0;i<count;i++,j+=4,k+=2){positions[k]=f32[j];positions[k+1]=f32[j+1];if(u32[j+2])uncertain.push(i);}
    readback.unmap();
    return {positions,uncertain,uncertainFraction:uncertain.length/count};
  }
  function destroy(){if(destroyed)return;destroyed=true;for(const b of [particles,field,weightGrid,grain,previousGrain,circles,output,params,readback])b.destroy();}
  return {step,destroy,count,grid};
}
