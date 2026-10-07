/** Optional WebGPU fine-density factory with a lazy, same-algorithm CPU fallback.
 * Pass {requireGPU:true} for comparison runs that must never silently fall back. */
export async function createGPUFineBackend(onProgress,{requireGPU=false,powerPreference='low-power'}={}){
  const makeCpuFactory=()=> (coarse,reference,totalMass)=>createLazyCPUBackend(coarse,reference,totalMass);
  const gpu=globalThis.navigator?.gpu;
  if(!gpu){
    if(requireGPU)throw new Error('WebGPU is unavailable in this worker');
    return{device:null,fineBackendFactory:makeCpuFactory(),backendType:'cpu-fallback'};
  }
  let adapter,device,createFineDensityGPU;
  try{
    onProgress?.({stage:'gpu',status:'adapter'});
    adapter=await gpu.requestAdapter(powerPreference?{powerPreference}:undefined);
    if(!adapter)throw new Error('No WebGPU adapter is available');
    device=await adapter.requestDevice();
    ({createFineDensityGPU}=await import('./fine-density-gpu.js'));
  }catch(error){
    if(requireGPU)throw error;
    onProgress?.({stage:'gpu',status:'cpu-fallback',reason:error?.message||String(error)});
    return{device:null,fineBackendFactory:makeCpuFactory(),backendType:'cpu-fallback'};
  }
  let lostInfo=null;
  device.lost?.then(info=>{lostInfo=info;});
  const fineBackendFactory=(coarse,reference,totalMass)=>{
    let gpuBackend=null,gpuEnabled=true,cpuBackend=null,fallbackReason=null;
    const getCpu=async()=>{
      if(!cpuBackend){const {createFineDensity}=await import('./fine-density.js');cpuBackend=createFineDensity(coarse,reference,totalMass);}
      return cpuBackend;
    };
    const useCpu=async(...args)=> (await getCpu()).apply(...args);
    try{gpuBackend=createFineDensityGPU(coarse,reference,totalMass,device);}
    catch(error){
      if(requireGPU)throw error;
      gpuEnabled=false;fallbackReason=error?.message||String(error);
    }
    return{
      get isGPUEnabled(){return gpuEnabled&&!lostInfo;},
      get backendType(){return gpuEnabled&&!lostInfo?'webgpu':'cpu-fallback';},
      get fallbackReason(){return fallbackReason||(lostInfo?lostInfo.message:null);},
      async ready(){
        if(!gpuEnabled||lostInfo){if(requireGPU)throw new Error(fallbackReason||lostInfo?.message||'WebGPU fine backend unavailable');return;}
        try{await gpuBackend?.ready?.();}
        catch(error){if(requireGPU)throw error;gpuEnabled=false;fallbackReason=error?.message||String(error);onProgress?.({stage:'gpu',status:'cpu-fallback',reason:fallbackReason});}
      },
      async apply(points,weight,sampler,move,strength=1,maxCorrection=.15,state){
        if(requireGPU&&(!gpuEnabled||lostInfo))throw new Error(fallbackReason||lostInfo?.message||'WebGPU fine backend is unavailable');
        if(!gpuEnabled||lostInfo)return useCpu(points,weight,sampler,move,strength,maxCorrection,state);
        let appliedMoves=0;
        const guardedMove=(k,dx,dy)=>{appliedMoves++;return move(k,dx,dy);};
        if(move.acceptFree)guardedMove.acceptFree=(k,dx,dy)=>{appliedMoves++;return move.acceptFree(k,dx,dy);};
        try{return await gpuBackend.apply(points,weight,sampler,guardedMove,strength,maxCorrection,state);}
        catch(error){
          if(requireGPU||appliedMoves>0)throw error;
          gpuEnabled=false;fallbackReason=error?.message||String(error);
          onProgress?.({stage:'gpu',status:'cpu-fallback',reason:fallbackReason});
          return useCpu(points,weight,sampler,move,strength,maxCorrection,state);
        }
      },
    };
  };
  return{device,fineBackendFactory,backendType:'webgpu'};
}

function createLazyCPUBackend(coarse,reference,totalMass){
  let backend=null;
  async function getBackend(){
    if(!backend){const {createFineDensity}=await import('./fine-density.js');backend=createFineDensity(coarse,reference,totalMass);}
    return backend;
  }
  return{backendType:'cpu-fallback',isGPUEnabled:false,async ready(){},async apply(...args){return(await getBackend()).apply(...args);}};
}
