import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createForecastAreaSolver} from '../motion/govern/forecast-area.js';
import {createSimulationCursor,CURSOR_RADIUS} from '../motion/govern/simulation-cursor.js';
import {createUnifiedGovern} from '../motion/govern/govern-unified-density.js';
import {packCursorHoles} from '../motion/govern/cursor-metaball.js';
import {createPoissonWasm} from '../public/govern-light/entrance-moving-439a65ba9b0355bf/create-poisson-wasm.js';
import {createImplicitEvaluator} from '../public/govern-light/entrance-moving-439a65ba9b0355bf/govern-implicit-sdf.js';

test('cursor forecasts are pure and retargeting is continuous',()=>{
 const c=createSimulationCursor(true);c.setTarget(200,200,1,0);
 const before=c.circle(.2);c.circle(20);expect(c.circle(.2)).toEqual(before);
 c.setTarget(400,300,1,.2);expect(c.circle(.2)).toEqual(before);
 const next=c.circle(.3);expect(Math.hypot(next.x-before.x,next.y-before.y)).toBeLessThanOrEqual(120.0001);
 expect(c.circle(10).r).toBe(CURSOR_RADIUS);
 expect(c.circle(10,1.5).r*1.5).toBe(CURSOR_RADIUS);
});
test('disabled, invalid and leaving pointers cannot create a stray circle',()=>{
 expect(createSimulationCursor().circle(0)).toBeNull();
 const c=createSimulationCursor(true);expect(c.circle(0).x).toBe(-1000);
 c.setTarget(NaN,100,1,0);expect(c.circle(0).x).toBe(-1000);
 c.setTarget(200,200,1,0);const before=c.circle(1);
 c.setTarget(0,0,0,1);expect(c.circle(1)).toEqual(before);
 expect(c.circle(3)).toEqual({x:200,y:200,r:.001});
 c.reset();expect(c.circle(0).x).toBe(-1000);
});
test('the real solver merges the cursor while preserving every grain and its radius',async()=>{
 const root=new URL('../public/govern-compact/',import.meta.url);
 const meta=JSON.parse(readFileSync(new URL('geometry.json',root),'utf8'));
 const bytes=gunzipSync(readFileSync(new URL('points.bin.gz',root))),points=[];
 let x=0,y=0;for(let k=0;k<bytes.length;k+=5){x+=bytes.readInt16LE(k);y+=bytes.readInt16LE(k+2);points.push([x/64,y/64,Math.fround(bytes[k+4]/400*meta.radiusScale)]);}
 const model=createUnifiedGovern(points,meta.holes,{interactiveCursor:true,feasibleTransport:true,areaMode:'global',kernelRatio:.45,pressureIterations:20,currentBlurPasses:2,maxTimeStep:.100001,staggeredPressure:true,fineStrength:1,boundsBroadphase:true,adaptivePinch:true,disableTopologyRescue:true,poissonBackend:await createPoissonWasm({staggeredPressure:true})});
 const out=new Float32Array(points.length*3);let worstIntrusion=0,merged=false;
 for(let frame=0;frame<=50;frame++){
  const t=frame*.1;
  if(frame>0)model.setCursor(285+Math.max(0,frame-20)*2,215,frame<35?1:0,t-.1);
  await model.sample(t,out,{vacancyTime:t*1.7,fusionTime:t*1.7,grainTime:t,travel:1.6,whiteSize:1,fusionAmount:1});
  expect(model.state.circles.length).toBe(meta.holes.length+1);
  expect(model.state.shrinks.at(-1)).toBe(0);
  const holes=packCursorHoles(model.state),evaluator=createImplicitEvaluator(model.state),cursor=model.state.circles.at(-1);
  if(frame>=12&&frame<35)expect(holes.at(-1)).toBe(20);
  if(frame>=12&&frame<35)for(const h of model.state.circles.slice(0,-1)){
   const distance=Math.hypot(cursor.x-h.x,cursor.y-h.y);
   if(distance<cursor.r+h.r&&evaluator.evaluateValue((cursor.x+h.x)/2,(cursor.y+h.y)/2)>0)merged=true;
  }
  for(let i=0;i<points.length;i++){
   if(!Number.isFinite(out[i*3]+out[i*3+1]))throw Error('Non-finite particle');
   if(out[i*3+2]!==points[i][2])throw Error('Changed particle radius');
   worstIntrusion=Math.max(worstIntrusion,evaluator.evaluateValue(out[i*3],out[i*3+1]));
  }
 }
 expect(merged).toBe(true);expect(worstIntrusion).toBeLessThan(.001);
 expect(packCursorHoles(model.state).at(-1)).toBeCloseTo(.001,6);
 console.log('Shared cursor solver audit',{count:points.length,worstIntrusion,merged});
},120000);

test('area forecasts preserve the interactive radius while solving total vacant area',()=>{
 const forecast=createForecastAreaSolver({x0:0,y0:0,h:1,nx:100,ny:100});
 const state={circles:[{x:30,y:50,r:12},{x:65,y:50,r:20}],whiteSize:1,fusionMix:1,fusionAmount:1,kernelRatio:.45,fixedRadiusIndex:1,shrinks:new Float64Array([1,0])};
 const target=forecast.rasterArea(state,1),result=forecast.solve(state,{sourceArea:target,initialShrink:0});
 expect(result.shrinks[0]).toBeCloseTo(1,2);expect(result.shrinks[1]).toBe(0);
 expect(result.quota.maxQuotaError).toBeLessThan(.001);expect([...state.shrinks]).toEqual([1,0]);
});

test('a nearby pointer is reached in one solved frame instead of a long trailing chase',()=>{
 const c=createSimulationCursor(true);c.setTarget(250,200,1,0);
 c.setTarget(300,200,1,1);
 expect(Math.hypot(c.circle(1.1).x-300,c.circle(1.1).y-200)).toBeLessThan(2);
 expect(c.circle(1.1).r).toBe(CURSOR_RADIUS);
});
