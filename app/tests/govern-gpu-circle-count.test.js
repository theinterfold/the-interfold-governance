import {expect,test} from 'bun:test';
import {createGpuTransport} from '../motion/govern/gpu-transport.js';
import {createFineDensityGPU} from '../motion/govern/fine-density-gpu.js';

// Exercise the real packing/dispatch paths against buffer bounds. The previous
// 32-circle transport rejected the cursor, while fine density overflowed its
// typed array; either failure silently and permanently selected the CPU backend.
function gpuHarness(){
  const names=['GPUBufferUsage','GPUShaderStage','GPUMapMode'];
  const descriptors=names.map(name=>Object.getOwnPropertyDescriptor(globalThis,name));
  const values=[{STORAGE:1,COPY_DST:2,COPY_SRC:4,UNIFORM:8,MAP_READ:16},{COMPUTE:1},{READ:1}];
  names.forEach((name,i)=>Object.defineProperty(globalThis,name,{value:values[i],configurable:true,writable:true}));
  const shaders=[],bindings=[];
  const device={
    createBuffer({size}){return {bytes:new ArrayBuffer(size),destroy(){},async mapAsync(){},unmap(){},getMappedRange(){return this.bytes;}};},
    queue:{writeBuffer(buffer,offset,data){
      const bytes=ArrayBuffer.isView(data)?new Uint8Array(data.buffer,data.byteOffset,data.byteLength):new Uint8Array(data);
      if(offset+bytes.byteLength>buffer.bytes.byteLength)throw new RangeError('GPU write exceeds buffer');
      new Uint8Array(buffer.bytes,offset,bytes.byteLength).set(bytes);
    },submit(){}},
    createShaderModule({code}){shaders.push(code);return {async getCompilationInfo(){return {messages:[]};}};},
    createBindGroupLayout(){return {};},createPipelineLayout(){return {};},
    createComputePipeline(){return {};},async createComputePipelineAsync(){return {};},
    createBindGroup({entries}){const result=new Map(entries.map(entry=>[entry.binding,entry.resource.buffer]));bindings.push(result);return result;},
    createCommandEncoder(){return {
      clearBuffer(buffer){new Uint8Array(buffer.bytes).fill(0);},
      beginComputePass(){return {setPipeline(){},setBindGroup(){},dispatchWorkgroups(){},end(){}};},
      copyBufferToBuffer(from,fromOffset,to,toOffset,size){new Uint8Array(to.bytes,toOffset,size).set(new Uint8Array(from.bytes,fromOffset,size));},
      finish(){return {};},
    };},
  };
  return {device,shaders,bindings,restore(){names.forEach((name,i)=>descriptors[i]?Object.defineProperty(globalThis,name,descriptors[i]):delete globalThis[name]);}};
}
const grid={x0:0,y0:0,h:3,nx:3,ny:3};
const state=count=>({circles:Array.from({length:count},(_,i)=>({x:100+i,y:200-i,r:i===32?20:10})),shrinks:new Float64Array(count),whiteSize:1,fusionMix:1,pairMixes:[1,1],kernelRatio:.45,fusionAmount:1});

test('GPU transport accepts the cursor and reduces the active count without a phantom circle',async()=>{
  const gpu=gpuHarness();
  try{
    const backend=await createGpuTransport(grid,gpu.device,2),points=new Float32Array([1,2,.1,3,4,.2]),field=new Float32Array(9);
    await backend.step(points,field,field,field,points,points,state(33));
    const binding=gpu.bindings.at(-1),uniform=new Uint32Array(binding.get(7).bytes),circles=new Float32Array(binding.get(5).bytes);
    expect(uniform[3]).toBe(33);
    expect(Array.from(circles.slice(32*6,32*6+4))).toEqual([132,168,20,30]);
    expect(gpu.shaders[0]).toContain('array<f32,33>');
    expect(gpu.shaders[0]).not.toContain('i<32u');
    expect(gpu.shaders[0].match(/i<params.holes/g)?.length).toBe(5);
    await backend.step(points,field,field,field,points,points,state(32));
    expect(uniform[3]).toBe(32);
    await expect(backend.step(points,field,field,field,points,points,state(34))).rejects.toThrow('input size mismatch');
    backend.destroy();
  }finally{gpu.restore();}
});

test('GPU fine density packs the 33rd circle and uses the active count at dispatch',async()=>{
  const gpu=gpuHarness();
  try{
    const reference=new Float32Array(9).fill(1),backend=createFineDensityGPU(grid,reference,2,gpu.device);
    const points=new Float32Array([1,2,.1,3,4,.2]);
    await backend.ready();
    await backend.apply(points,reference,null,()=>{},1,.15,state(33));
    const binding=gpu.bindings.at(-1),uniform=new Uint32Array(binding.get(7).bytes),circles=new Float32Array(binding.get(2).bytes);
    expect(uniform[5]).toBe(33);
    expect(Array.from(circles.slice(32*4,33*4))).toEqual([132,168,20,20]);
    expect(gpu.shaders[0].match(/array<f32,33>/g)?.length).toBe(3);
    await backend.apply(points,reference,null,()=>{},1,.15,state(32));
    expect(uniform[5]).toBe(32);
    await expect(backend.apply(points,reference,null,()=>{},1,.15,state(34))).rejects.toThrow('circle capacity exceeded');
  }finally{gpu.restore();}
});

test('GPU circle capacity is explicit and validated before resource allocation',async()=>{
  const gpu=gpuHarness();
  try{
    await expect(createGpuTransport(grid,gpu.device,1,{circleCapacity:31})).rejects.toThrow('circle capacity');
    expect(()=>createFineDensityGPU(grid,new Float32Array(9),1,gpu.device,{circleCapacity:65})).toThrow('circle capacity');
    const backend=await createGpuTransport(grid,gpu.device,1,{circleCapacity:40});
    const points=new Float32Array([1,2,.1]),field=new Float32Array(9);
    await backend.step(points,field,field,field,points,points,state(40));
    expect(new Uint32Array(gpu.bindings.at(-1).get(7).bytes)[3]).toBe(40);
    expect(gpu.shaders[0]).toContain('array<f32,40>');
    backend.destroy();
  }finally{gpu.restore();}
});
