import {expect,test} from 'bun:test';
import {createLocalFineDensity} from '../motion/govern/cursor-fine-density.js';
import {createFineDensity} from '../public/govern-light/entrance-moving-439a65ba9b0355bf/fine-density.js';
import {createImplicitEvaluator} from '../public/govern-light/entrance-moving-439a65ba9b0355bf/govern-implicit-sdf.js';

test('cropped cursor density preserves the full-grid correction through its halo and after resizing',()=>{
 const grid={x0:-6,y0:-6,h:3,nx:17,ny:15};
 const reference=Float64Array.from({length:grid.nx*grid.ny},(_,k)=>9*(.16+.025*Math.sin(k%grid.nx*.3)+.02*Math.cos(Math.floor(k/grid.nx)*.4)));
 const state={circles:[{x:21,y:17,r:4},{x:27,y:19,r:3}],shrinks:new Float64Array([.15,0]),whiteSize:1,fusionMix:1,fusionAmount:1,kernelRatio:.45};
 const sampler=createImplicitEvaluator(state),data=[];
 for(let y=-5.8;y<35.8;y+=1.15)for(let x=-5.7;x<41.8;x+=1.1){
  if(sampler.evaluateValue(x,y)>0)continue;
  data.push(x,y,.34+.07*Math.sin(x*.4+y*.2));
 }
 const points=new Float32Array(data),original=points.slice();
 const mass=points.reduce((sum,v,k)=>sum+(k%3===2?v*v:0),0);
 const weight=sampler.evaluateGrid(grid.x0,grid.y0,grid.h,grid.nx,grid.ny);
 for(let k=0;k<weight.length;k++)weight[k]+=1;
 const full=createFineDensity(grid,reference,mass),local=createLocalFineDensity(grid,reference);
 const regions=[
  {x0:4.7,y0:3.3,x1:29.8,y1:27.6},
  {x0:15.2,y0:11.8,x1:23.1,y1:21.4},
  {x0:-6,y0:-6,x1:8.25,y1:8.25},
 ];
 for(const roi of regions){
  const expected=new Float64Array(points.length),actual=new Float64Array(points.length);
  const inside=k=>points[k]>=roi.x0&&points[k]<=roi.x1&&points[k+1]>=roi.y0&&points[k+1]<=roi.y1;
  const result=full.apply(points,weight,sampler,(k,dx,dy)=>{if(inside(k)){expected[k]=dx;expected[k+1]=dy;}},2,.45,state);
  local.prepare(weight,sampler,roi,result.scale,state);
  const cropped=local.apply(points,(k,dx,dy)=>{
   if(!inside(k))throw Error('Correction escaped its transport region');
   actual[k]=dx;actual[k+1]=dy;
  },2,.45);
  let maxDifference=0,moved=0;
  for(let k=0;k<points.length;k+=3){
   const distance=Math.hypot(actual[k],actual[k+1]);
   expect(Number.isFinite(distance)).toBe(true);
   expect(distance).toBeLessThanOrEqual(.450001);
   maxDifference=Math.max(maxDifference,Math.hypot(actual[k]-expected[k],actual[k+1]-expected[k+1]));
   if(distance>0)moved++;
  }
  expect(moved).toBeGreaterThan(10);
  expect(maxDifference).toBeLessThan(2e-6);
  expect(cropped.cells).toBeLessThan(((grid.nx-1)*3+1)*((grid.ny-1)*3+1));
 }
 expect(points).toEqual(original);
});
