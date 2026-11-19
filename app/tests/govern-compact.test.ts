import {expect,test} from 'bun:test';
import {thinInterior} from '../motion/govern/point-selection.js';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {selectPointProfile} from '../public/govern-light/entrance-moving-439a65ba9b0355bf/point-profile.js';
import {createUnifiedGovern as original} from '../public/govern-light/entrance-moving-439a65ba9b0355bf/govern-unified-density.js';
import {createUnifiedGovern as compact} from '../motion/govern/govern-unified-density.js';
import {createImplicitEvaluator} from '../public/govern-light/entrance-moving-439a65ba9b0355bf/govern-implicit-sdf.js';
import {createPoissonWasm} from '../public/govern-light/entrance-moving-439a65ba9b0355bf/create-poisson-wasm.js';
import {createMovingWallPcgWasm} from '../public/govern-light/entrance-moving-439a65ba9b0355bf/create-moving-wall-pcg-wasm.js';
const oldRoot=new URL('../public/govern-light/entrance-moving-439a65ba9b0355bf/',import.meta.url),newRoot=new URL('../public/govern-compact/',import.meta.url);
function decode(url:URL,scale=1){const bytes=gunzipSync(readFileSync(url)),points:number[][]=[];let x=0,y=0;for(let k=0;k<bytes.length;k+=5){x+=bytes.readInt16LE(k);y+=bytes.readInt16LE(k+2);points.push([x/64,y/64,Math.fround(bytes[k+4]/400*scale)]);}return points;}
const meta=JSON.parse(readFileSync(new URL('geometry.json',newRoot),'utf8'));
// Selection must use the original double radii, as the shipped baseline did.
const raw=gunzipSync(readFileSync(new URL('points.bin.gz',oldRoot))),source:number[][]=[];let x=0,y=0;
for(let k=0;k<raw.length;k+=5){x+=raw.readInt16LE(k);y+=raw.readInt16LE(k+2);source.push([x/64,y/64,raw[k+4]/400]);}
const points=decode(new URL('points.bin.gz',newRoot),meta.radiusScale);
test('compact download preserves every selected point, its order and exact Float32 radius',()=>{
 const full=thinInterior(selectPointProfile(source,'light').points,meta.holes);
 expect(points).toEqual(thinInterior(selectPointProfile(source,'light').points,meta.holes,.8));
 expect(points.length).toBe(Math.round(full.length*.8));
 const manifest=JSON.parse(readFileSync(new URL('manifest.json',newRoot),'utf8'));
 expect(manifest.pointFraction).toBe(.8);
 expect(manifest.totalBytes).toBeLessThan(300000);
 expect(manifest.files['points.bin.gz']).toBeLessThan(150000);
});
test('lighter fusion forecasting preserves circles, grain radii and boundary density over the motion',async()=>{
 const options={feasibleTransport:true,areaMode:'global',kernelRatio:.45,pressureIterations:20,currentBlurPasses:2,maxTimeStep:.100001,staggeredPressure:true,fineStrength:1,boundsBroadphase:true,adaptivePinch:true,disableTopologyRescue:true};
 const make=async(factory:any,h:number)=>factory(points,meta.holes,{...options,forecastGridSpacing:h,poissonBackend:await createPoissonWasm({staggeredPressure:true}),movingWallPcgBackend:await createMovingWallPcgWasm()});
 const a=await make(original,.125),b=await make(compact,.25);
 const outA=new Float32Array(points.length*3),outB=new Float32Array(points.length*3),costA:number[]=[],costB:number[]=[];
 let worstIntrusion=0,maxRimRatio=0,minRimRatio=Infinity;
 for(let frame=0;frame<=120;frame++){
  const t=frame*.1,controls={vacancyTime:t*1.7,fusionTime:t*1.7,grainTime:t,travel:1.6,whiteSize:1,fusionAmount:1};
  let now=performance.now();await a.sample(t,outA,controls);costA.push(performance.now()-now);
  now=performance.now();await b.sample(t,outB,controls);costB.push(performance.now()-now);
  expect(b.state.circles).toEqual(a.state.circles);
  const evaluator=createImplicitEvaluator(b.state);let rimA=0,rimB=0;
  for(let k=0;k<outB.length;k+=3){
   if(!Number.isFinite(outB[k]+outB[k+1]))throw Error('Non-finite point');
   if(outB[k+2]!==outA[k+2])throw Error('Changed radius');
   worstIntrusion=Math.max(worstIntrusion,evaluator.evaluateValue(outB[k],outB[k+1]));
   if(frame%10===0){const da=evaluator.evaluate(outA[k],outA[k+1]).signedGap,db=evaluator.evaluate(outB[k],outB[k+1]).signedGap;if(da>=0&&da<3)rimA++;if(db>=0&&db<3)rimB++;}
  }
  if(frame%10===0){minRimRatio=Math.min(minRimRatio,rimB/rimA);maxRimRatio=Math.max(maxRimRatio,rimB/rimA);}
 }
 expect(worstIntrusion).toBeLessThan(.001);expect(minRimRatio).toBeGreaterThan(.85);expect(maxRimRatio).toBeLessThan(1.15);
 const stats=(values:number[])=>{values.sort((a,b)=>a-b);return{median:values[60],p95:values[114],max:values[120],total:values.reduce((a,b)=>a+b,0)};};
 console.log('Fusion audit',JSON.stringify({original:stats(costA),compact:stats(costB),worstIntrusion,minRimRatio,maxRimRatio}));
},180000);
