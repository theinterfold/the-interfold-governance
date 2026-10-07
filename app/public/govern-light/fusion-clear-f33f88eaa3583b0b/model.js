import {createUnifiedGovern} from './govern-unified-density.js';
import {createGPUFineBackend} from './create-gpu-fine-backend.js';

/** Browser worker entry point for the isolated unified preview. */
export async function createModel(points, holes, onProgress) {
  onProgress?.({stage:'prepare',index:0,total:1});
  const {device,fineBackendFactory}=await createGPUFineBackend(onProgress);
  const model=createUnifiedGovern(points,holes,{
    gpuDevice:device,
    fineBackendFactory,
    fineStrength:fineBackendFactory?1:0,
    quotaIterations:1,
    pressureIterations:50,
    maxTimeStep:1/15,
    currentBlurPasses:6,
    dipoleStrength:0,
    areaMode:'per-hole',
  });
  await model.fineBackend?.ready?.();
  onProgress?.({stage:'prepare',index:1,total:1});
  return model;
}
