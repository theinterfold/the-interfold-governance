/** Same one-pixel density correction as fine-density.js, computed in parallel.
 * Positions are still accepted by the existing exact CPU boundary integrator.
 * This experimental backend is isolated from the approved local model. */
export function createFineDensityGPU(coarse,reference,totalMass,device){
  const nx=(coarse.nx-1)*3+1,ny=(coarse.ny-1)*3+1,n=nx*ny,groups=Math.ceil(n/128);
  const usage=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC;
  const buffer=(size,label)=>device.createBuffer({size:Math.ceil(size/4)*4,usage,label});
  const retention=buffer(n*4,'forecast pocket retained density'),retentionData=new Float32Array(n);retentionData.fill(1);device.queue.writeBuffer(retention,0,retentionData);
  let hadRetention=false;
  const grid=buffer(n*24,'fine grid'),weights=buffer(reference.length*4,'coarse white weight'),
    circles=buffer(32*16,'white circles'),mass=buffer(n*4,'deposited mass'),
    partial=buffer(Math.max(128,groups)*4,'desired capacity'),
    params=device.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const packedGrid=new Float32Array(n*6);
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
    const fx=Math.max(0,Math.min(coarse.nx-1.001,x/coarse.h)),fy=Math.max(0,Math.min(coarse.ny-1.001,y/coarse.h)),
      ix=fx|0,iy=fy|0,u=fx-ix,v=fy-iy,k=iy*coarse.nx+ix;
    packedGrid[(y*nx+x)*6]=((reference[k]*(1-u)+reference[k+1]*u)*(1-v)+(reference[k+coarse.nx]*(1-u)+reference[k+coarse.nx+1]*u)*v)/9;
  }
  device.queue.writeBuffer(grid,0,packedGrid);
  const code=`
    struct Cell { reference:f32, desired:f32, error:f32, temp:f32, vx:f32, vy:f32 }
    struct Params { nx:u32, ny:u32, cx:u32, cy:u32, count:u32, holes:u32, groups:u32, pad:u32,
      x0:f32, y0:f32, totalMass:f32, strength:f32, maxCorrection:f32, mix:f32, ratio:f32, whiteSize:f32 }
    @group(0) @binding(0) var<storage,read_write> grid:array<Cell>;
    @group(0) @binding(1) var<storage,read> coarse:array<f32>;
    @group(0) @binding(2) var<storage,read> circles:array<vec4<f32>>;
    @group(0) @binding(3) var<storage,read> points:array<f32>;
    @group(0) @binding(4) var<storage,read_write> mass:array<atomic<u32>>;
    @group(0) @binding(5) var<storage,read_write> partial:array<f32>;
    @group(0) @binding(6) var<storage,read_write> moves:array<vec4<f32>>;
    @group(0) @binding(7) var<uniform> p:Params;
    @group(0) @binding(8) var<storage,read> retention:array<f32>;
    var<workgroup> sums:array<f32,128>;
    fn coarseSample(x:f32,y:f32)->f32{
      let f=clamp(vec2<f32>(x,y)/3.,vec2<f32>(0.),vec2<f32>(f32(p.cx)-1.001,f32(p.cy)-1.001));
      let i=vec2<u32>(f);let uv=fract(f);let k=i.y*p.cx+i.x;
      return (coarse[k]*(1.-uv.x)+coarse[k+1u]*uv.x)*(1.-uv.y)+(coarse[k+p.cx]*(1.-uv.x)+coarse[k+p.cx+1u]*uv.x)*uv.y;
    }
    fn signedGap(pos:vec2<f32>)->f32{
      var k:array<f32,32>;var dx:array<f32,32>;var dy:array<f32,32>;var high=0.;
      for(var j=0u;j<p.holes;j++){
        let c=circles[j];let delta=pos-c.xy;let radius=max(length(delta),1e-9);
        let d=radius-c.z;let reach=1.5*c.w;
        if(d>=reach){continue;}
        let u=max(0.,d/reach);let u2=u*u;let u3=u2*u;let u4=u3*u;
        let G=1.-10.*u3+15.*u4-6.*u4*u;
        let Gp=select(0.,(-30.*u2+60.*u3-30.*u4)/reach,d>0.);
        let ik=1./(p.ratio*c.w);let e=exp(-d*ik);let derivative=e*(Gp-G*ik)/radius;
        k[j]=e*G;dx[j]=derivative*delta.x;dy[j]=derivative*delta.y;high=max(high,k[j]);
      }
      var w=0.;var gx=0.;var gy=0.;
      if(p.mix<=1e-9){
        for(var j=0u;j<p.holes;j++){if(k[j]>w){w=k[j];gx=dx[j];gy=dy[j];}}
      }else if(p.mix>=1.-1e-9){
        for(var j=0u;j<p.holes;j++){w+=k[j];gx+=dx[j];gy+=dy[j];}
      }else if(high>0.){
        var sum=0.;let power=1./p.mix;
        for(var j=0u;j<p.holes;j++){if(k[j]>0.){let z=pow(k[j]/high,power);sum+=z;gx+=z*dx[j]/k[j];gy+=z*dy[j]/k[j];}}
        w=high*pow(sum,p.mix);gx*=w/sum;gy*=w/sum;
      }
      return clamp((1.-w)/max(length(vec2<f32>(gx,gy)),.05),-24.,24.);
    }
    @compute @workgroup_size(128) fn desired(@builtin(global_invocation_id) gid:vec3<u32>,@builtin(local_invocation_index) li:u32,@builtin(workgroup_id) wg:vec3<u32>){
      let k=gid.x;var t=0.;
      if(k<p.nx*p.ny){
        let x=f32(k%p.nx);let y=f32(k/p.nx);var occupancy=1.;
        if(grid[k].reference>.001 && coarseSample(x,y)>.35){let u=clamp(.5+signedGap(vec2<f32>(x+p.x0,y+p.y0)),0.,1.);occupancy=u*u*(3.-2.*u);}
        t=grid[k].reference*occupancy*retention[k];grid[k].desired=t;
      }
      sums[li]=t;workgroupBarrier();
      for(var stride=64u;stride>0u;stride/=2u){if(li<stride){sums[li]+=sums[li+stride];}workgroupBarrier();}
      if(li==0u){partial[wg.x]=sums[0];}
    }
    @compute @workgroup_size(128) fn capacity(@builtin(local_invocation_index) li:u32){
      var sum=0.;for(var j=li;j<p.groups;j+=128u){sum+=partial[j];}sums[li]=sum;workgroupBarrier();
      for(var stride=64u;stride>0u;stride/=2u){if(li<stride){sums[li]+=sums[li+stride];}workgroupBarrier();}
      if(li==0u){partial[0]=p.totalMass/sums[0];}
    }
    @compute @workgroup_size(128) fn deposit(@builtin(global_invocation_id) gid:vec3<u32>){
      let i=gid.x;if(i>=p.count){return;}let a=i*3u;
      let f=clamp(vec2<f32>(points[a]-p.x0,points[a+1u]-p.y0),vec2<f32>(0.),vec2<f32>(f32(p.nx)-1.001,f32(p.ny)-1.001));
      let cell=vec2<u32>(f);let uv=fract(f);let k=cell.y*p.nx+cell.x;let m=points[a+2u]*points[a+2u]*1048576.;
      atomicAdd(&mass[k],u32(round(m*(1.-uv.x)*(1.-uv.y))));atomicAdd(&mass[k+1u],u32(round(m*uv.x*(1.-uv.y))));
      atomicAdd(&mass[k+p.nx],u32(round(m*(1.-uv.x)*uv.y)));atomicAdd(&mass[k+p.nx+1u],u32(round(m*uv.x*uv.y)));
    }
    @compute @workgroup_size(128) fn errorField(@builtin(global_invocation_id) gid:vec3<u32>){
      let k=gid.x;if(k>=p.nx*p.ny){return;}grid[k].error=f32(atomicLoad(&mass[k]))/1048576.-grid[k].desired*partial[0];
    }
    @compute @workgroup_size(128) fn blurX(@builtin(global_invocation_id) gid:vec3<u32>){
      let k=gid.x;if(k>=p.nx*p.ny){return;}let x=k%p.nx;let y=k/p.nx;
      var value=grid[k].error;if(x>0u&&x<p.nx-1u&&y>0u&&y<p.ny-1u){value=(grid[k-1u].error+2.*value+grid[k+1u].error)*.25;}grid[k].temp=value;
    }
    @compute @workgroup_size(128) fn blurY(@builtin(global_invocation_id) gid:vec3<u32>){
      let k=gid.x;if(k>=p.nx*p.ny){return;}let x=k%p.nx;let y=k/p.nx;
      var value=grid[k].temp;if(x>0u&&x<p.nx-1u&&y>0u&&y<p.ny-1u){value=(grid[k-p.nx].temp+2.*value+grid[k+p.nx].temp)*.25;}grid[k].error=value;
    }
    @compute @workgroup_size(128) fn gradient(@builtin(global_invocation_id) gid:vec3<u32>){
      let k=gid.x;if(k>=p.nx*p.ny){return;}if(k%p.nx<p.nx-1u&&k/p.nx<p.ny-1u){grid[k].vx=grid[k].error-grid[k+1u].error;grid[k].vy=grid[k].error-grid[k+p.nx].error;}
    }
    fn field(k:u32,channel:u32)->f32{if(channel==0u){return grid[k].reference;}if(channel==1u){return grid[k].vx;}return grid[k].vy;}
    fn fineSample(pos:vec2<f32>,channel:u32)->f32{
      let f=clamp(pos-vec2<f32>(p.x0,p.y0),vec2<f32>(0.),vec2<f32>(f32(p.nx)-1.001,f32(p.ny)-1.001));let cell=vec2<u32>(f);let uv=fract(f);let k=cell.y*p.nx+cell.x;
      return (field(k,channel)*(1.-uv.x)+field(k+1u,channel)*uv.x)*(1.-uv.y)+(field(k+p.nx,channel)*(1.-uv.x)+field(k+p.nx+1u,channel)*uv.x)*uv.y;
    }
    @compute @workgroup_size(128) fn gather(@builtin(global_invocation_id) gid:vec3<u32>){
      let i=gid.x;if(i>=p.count){return;}let a=i*3u;let pos=vec2<f32>(points[a],points[a+1u]);
      let gain=p.strength/max(.04,fineSample(pos,0u)*partial[0]);
      var delta=gain*vec2<f32>(fineSample(pos-vec2<f32>(.5,0.),1u),fineSample(pos-vec2<f32>(0.,.5),2u));
      let distance=length(delta);if(distance>p.maxCorrection){delta*=p.maxCorrection/distance;}
      let to=pos+delta;
      var free=false;
      if(p.maxCorrection<=.5){
        if(coarseSample(to.x-p.x0,to.y-p.y0)<.20){free=true;}
        else if(signedGap(to)>.2){free=true;}
      }
      moves[i]=vec4<f32>(delta,select(0.,1.,free),0.);
    }
  `;
  const module=device.createShaderModule({label:'fine density',code});
  const layout=device.createBindGroupLayout({entries:[
    ...[0,4,5,6].map(binding=>({binding,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}})),
    ...[1,2,3,8].map(binding=>({binding,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}})),
    {binding:7,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform'}}]});
  const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]});
  const pipelines=Object.fromEntries(['desired','capacity','deposit','errorField','blurX','blurY','gradient','gather'].map(entryPoint=>[entryPoint,device.createComputePipeline({label:entryPoint,layout:pipelineLayout,compute:{module,entryPoint}})]));
  let pointBuffer,moveBuffer,readback,bindings,lastCount=0;
  function resize(count){
    if(lastCount===count)return;lastCount=count;
    pointBuffer?.destroy();moveBuffer?.destroy();readback?.destroy();
    pointBuffer=buffer(count*12,'fine points');moveBuffer=buffer(count*16,'fine velocity');
    readback=device.createBuffer({size:count*16,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
    bindings=device.createBindGroup({layout,entries:[grid,weights,circles,pointBuffer,mass,partial,moveBuffer,params,retention].map((buffer,binding)=>({binding,resource:{buffer}}))});
  }
  async function apply(points,weight,sampler,move,strength=1,maxCorrection=.15,state){
    const start=performance.now(),count=points.length/3;resize(count);
    const hasRetention=!!state.pocketTargetBounds?.length;
    if(hasRetention||hadRetention){
      retentionData.fill(1);
      if(hasRetention)for(const box of state.pocketTargetBounds){
        const ax=Math.max(0,Math.floor(box.x0-coarse.x0)),bx=Math.min(nx-1,Math.ceil(box.x1-coarse.x0));
        const ay=Math.max(0,Math.floor(box.y0-coarse.y0)),by=Math.min(ny-1,Math.ceil(box.y1-coarse.y0));
        for(let y=ay;y<=by;y++)for(let x=ax;x<=bx;x++)retentionData[y*nx+x]=state.retainedFractionAt(x+coarse.x0,y+coarse.y0);
      }
      device.queue.writeBuffer(retention,0,retentionData);hadRetention=hasRetention;
    }
    const shape=new Float32Array(32*4),size=state.whiteSize??1;
    for(let j=0;j<state.circles.length;j++){const c=state.circles[j],nominal=c.r*size;shape.set([c.x,c.y,nominal-(state.shrinks?.[j]??0),nominal],j*4);}
    const data=new ArrayBuffer(64),ui=new Uint32Array(data),f=new Float32Array(data);
    ui.set([nx,ny,coarse.nx,coarse.ny,count,state.circles.length,groups,0]);
    f.set([coarse.x0,coarse.y0,totalMass,strength,maxCorrection,state.fusionMix??1,.1+((state.kernelRatio??.75)-.1)*(state.fusionAmount??1),size],8);
    device.queue.writeBuffer(params,0,data);device.queue.writeBuffer(weights,0,weight);device.queue.writeBuffer(circles,0,shape);device.queue.writeBuffer(pointBuffer,0,points);
    const encoder=device.createCommandEncoder();encoder.clearBuffer(mass);
    const pass=encoder.beginComputePass();pass.setBindGroup(0,bindings);
    for(const [name,number]of [['desired',groups],['capacity',1],['deposit',Math.ceil(count/128)],['errorField',groups],['blurX',groups],['blurY',groups],['blurX',groups],['blurY',groups],['gradient',groups],['gather',Math.ceil(count/128)]]){pass.setPipeline(pipelines[name]);pass.dispatchWorkgroups(number);}
    pass.end();encoder.copyBufferToBuffer(moveBuffer,0,readback,0,count*16);device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);const delta=new Float32Array(readback.getMappedRange());
    const computed=performance.now();let maxMove=0;
    let freeMoves=0,constrainedMoves=0;
    for(let i=0;i<count;i++){
      const dx=delta[i*4],dy=delta[i*4+1],length=Math.sqrt(dx*dx+dy*dy);
      if(length>1e-6){
        if(delta[i*4+2] && move.acceptFree){move.acceptFree(i*3,dx,dy);freeMoves++;}
        else{move(i*3,dx,dy);constrainedMoves++;}
      }
      maxMove=Math.max(maxMove,length);
    }
    readback.unmap();return{maxMove,freeMoves,constrainedMoves,stageMs:{gpu:computed-start,move:performance.now()-computed}};
  }
  return{apply,async ready(){const info=await module.getCompilationInfo();const errors=info.messages.filter(m=>m.type==='error');if(errors.length)throw new Error(errors.map(e=>`${e.lineNum}: ${e.message}`).join('\n'));}};
}
