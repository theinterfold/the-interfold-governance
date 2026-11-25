import {createUnifiedGovern} from './govern-unified-density.js';
import {createFixedStepModel} from '../../public/govern-light/entrance-moving-439a65ba9b0355bf/fixed-step-adapter.js';
import {createGPUFineBackend} from './create-gpu-fine-backend.js';
import {createGpuTransport} from './gpu-transport.js';
import {createGpuCursorTransport} from './gpu-cursor-transport.js';
import {createPoissonWasm} from '../../public/govern-light/entrance-moving-439a65ba9b0355bf/create-poisson-wasm.js';
import {createMovingWallPcgWasm} from '../../public/govern-light/entrance-moving-439a65ba9b0355bf/create-moving-wall-pcg-wasm.js';
import {selectPointProfile} from '../../public/govern-light/entrance-moving-439a65ba9b0355bf/point-profile.js';

// Hardware/kernel preparation needs no particles. Overlap it with the download.
export function prepareModelBackends(onProgress){
  return Promise.all([
    createGPUFineBackend(onProgress),
    createPoissonWasm({staggeredPressure:true}).catch(error=>{
      onProgress?.({stage:'wasm-pressure',status:'cpu-fallback',reason:error?.message||String(error)});return null;
    }),
    createMovingWallPcgWasm().catch(error=>{
      onProgress?.({stage:'wasm-pocket-pressure',status:'cpu-fallback',reason:error?.message||String(error)});return null;
    }),
  ]);
}

/** Isolated fallback entry point; no gallery route points here yet. */
export async function createModel(points,holes,onProgress,modelOptions={}){
  onProgress?.({stage:'prepare',index:0,total:1});
  const profile=selectPointProfile(points,modelOptions.profile??'original');
  points=profile.points;
  const [{device,fineBackendFactory},poissonBackend,movingWallPcgBackend]=
    await (modelOptions.backends??prepareModelBackends(onProgress));
  const base=createUnifiedGovern(points,holes,{
    forecastGridSpacing:.25,
    interactiveCursor:modelOptions.interactiveCursor===true,
    onCursorFlowFrame:modelOptions.onCursorFlowFrame,
    isCursorInteractive:modelOptions.isCursorInteractive,
    shouldInterruptCursor:modelOptions.shouldInterruptCursor,
    onVolumeStage:modelOptions.onVolumeStage,
    movingWallFlow:modelOptions.movingWallFlow!==false,
    movingWallPcgBackend,
    pocketOnly:modelOptions.pocketOnly===true,
    disableTopologyRescue:modelOptions.disableTopologyRescue!==false,
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
  await Promise.all([
    base.fineBackend?.ready?.(),
    device?createGpuTransport(base.grid,device,base.count,{circleCapacity:holes.length+(modelOptions.interactiveCursor?1:0)})
      .then(backend=>base.setGpuTransportBackend(backend))
      .catch(error=>onProgress?.({stage:'gpu-transport',status:'cpu-fallback',reason:error?.message||String(error)})):null,
    device&&modelOptions.interactiveCursor?createGpuCursorTransport(device,{count:base.count,coarse:base.grid,reference:base.reference})
      .then(backend=>base.setGpuCursorBackend(backend))
      .catch(error=>onProgress?.({stage:'gpu-cursor-transport',status:'cpu-fallback',reason:error?.message||String(error)})):null,
  ]);
  const model=createFixedStepModel(base,{step:.1});
  onProgress?.({stage:'prepare',index:1,total:1});
  model.pointProfile=profile;
  return model;
}
