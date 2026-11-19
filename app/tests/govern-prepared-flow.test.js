import {expect,test} from 'bun:test';
import {createMovingWallFlow} from '../motion/govern/moving-wall-flow.js';

function circleSampler(cx,cy,radius){
  return {
    evaluateGrid(x0,y0,h,nx,ny){
      const values=new Float64Array(nx*ny);
      for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)values[y*nx+x]=radius*radius-(x0+x*h-cx)**2-(y0+y*h-cy)**2;
      return values;
    },
  };
}
const options={roi:{x0:-24,y0:-24,x1:24,y1:24},h:1,dt:.1,spatialStep:.5,wallNormal:false,tolerance:1e-9,iterations:200};

test('prepared face flux exports the independently known displaced circle area',()=>{
  const old=circleSampler(0,0,6),next=circleSampler(0,0,7);
  const prepared=createMovingWallFlow(()=>1).prepare(old,next,options);
  const {nx,ny,h}=prepared.grid;
  let outwardMass=0;
  // Constant density makes the stored face coefficients equal aperture. The
  // telescoping divergence measures exported material at the open ROI edge.
  for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){
    const k=y*nx+x;
    outwardMass+=h*(prepared.vx[k]*prepared.right[k]-prepared.vx[k-1]*prepared.right[k-1]+
      prepared.vy[k]*prepared.down[k]-prepared.vy[k-nx]*prepared.down[k-nx]);
  }
  expect(Math.abs(prepared.stats.sourceVolume-Math.PI*(7*7-6*6))).toBeLessThan(.6);
  expect(Math.abs(outwardMass-prepared.stats.sourceVolume)).toBeLessThan(1e-5);
  expect(prepared.stats.residual).toBeLessThan(1e-8);
});

test('preparation preserves source data and the CPU result even when it warms the pressure cache',()=>{
  const reference=Float64Array.from([1,1,1,1]),savedReference=reference.slice();
  const before=Float32Array.from([-14,-2,.3,-8,10,.2,8,-12,.4,15,1,.3]);
  const source=before.slice(),savedSource=source.slice();
  const old=circleSampler(0,0,6),next=circleSampler(1,0,6);
  const flow=createMovingWallFlow(()=>reference[0]),fresh=createMovingWallFlow(()=>reference[0]);
  const prepared=flow.prepare(old,next,options);
  const afterWarm=before.slice(),afterFresh=before.slice();
  const warmStats=flow.apply(afterWarm,source,old,next,options),freshStats=fresh.apply(afterFresh,source,old,next,options);
  expect(reference).toEqual(savedReference);expect(source).toEqual(savedSource);
  expect(prepared.stats.sourceVolume).toBe(freshStats.sourceVolume);
  expect(prepared.stats.positiveVolume).toBe(freshStats.positiveVolume);
  expect(prepared.stats.negativeVolume).toBe(freshStats.negativeVolume);
  expect(prepared.stats.cells).toBe(freshStats.cells);
  expect(warmStats.residual).toBeLessThan(1e-8);
  for(let k=0;k<afterWarm.length;k++)expect(Math.abs(afterWarm[k]-afterFresh[k])).toBeLessThan(1e-6);
  for(let k=2;k<afterWarm.length;k+=3)expect(afterWarm[k]).toBe(before[k]);
});

test('prepared transport rejects pocket-density modes while the original CPU path remains available',()=>{
  const flow=createMovingWallFlow(()=>1),old=circleSampler(0,0,6),next=circleSampler(1,0,6);
  expect(()=>flow.prepare(old,next,{...options,pocketOnly:true})).toThrow();
  expect(()=>flow.prepare(old,next,{...options,measuredPocketCorrection:{pockets:[]}})).toThrow();
  const points=Float32Array.from([-14,0,.3,14,0,.3]),saved=points.slice();
  const result=flow.apply(points,saved,old,next,{...options,pocketOnly:true});
  expect(result.pocketOnly).toBe(true);expect(points).toEqual(saved);
});
