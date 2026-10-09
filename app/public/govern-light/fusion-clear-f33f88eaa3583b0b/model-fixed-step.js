import {createUnifiedGovern} from './govern-unified-density.js';
import {createFixedStepModel} from './fixed-step-adapter.js';
import {createGPUFineBackend} from './create-gpu-fine-backend.js';
import {createGpuTransport} from './gpu-transport.js';
import {createPoissonWasm} from './create-poisson-wasm.js';
import {selectPointProfile} from './point-profile.js';

/** Isolated fallback entry point; no gallery route points here yet. */
export async function createModel(points,holes,onProgress,modelOptions={}){
  onProgress?.({stage:'prepare',index:0,total:1});
  const profile=selectPointProfile(points,modelOptions.profile??'original');
  points=profile.points;
  const {device,fineBackendFactory}=await createGPUFineBackend(onProgress);
  let poissonBackend=null;
  try{poissonBackend=await createPoissonWasm({staggeredPressure:true});}
  catch(error){onProgress?.({stage:'wasm-pressure',status:'cpu-fallback',reason:error?.message||String(error)});}
  const base=createUnifiedGovern(points,holes,{
    gpuDevice:device,
    fineBackendFactory,
    poissonBackend,
    pressureIterations:20,
    // Tolerate binary rounding in consecutive k*0.1 timestamps so the core
    // performs one internal advance per fixed grid interval.
    maxTimeStep:.100001,
    currentBlurPasses:2,
    areaMode:'global',
    kernelRatio:.45,
    internalProjectionSlack:0,
    feasibleTransport:true,
    staggeredPressure:true,
    fineStrength:1,
    boundsBroadphase:true,
    adaptivePinch:true,
  });
  await base.fineBackend?.ready?.();
  if(device){
    try{base.setGpuTransportBackend(await createGpuTransport(base.grid,device,base.count));}
    catch(error){onProgress?.({stage:'gpu-transport',status:'cpu-fallback',reason:error?.message||String(error)});}
  }
  const model=createFixedStepModel(base,{step:.1});
  onProgress?.({stage:'prepare',index:1,total:1});
  model.pointProfile=profile;
  return model;
}
