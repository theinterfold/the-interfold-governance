import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {packCursorRenderField} from '../motion/govern/cursor-render-field.js';
import {createImplicitEvaluator} from '../public/govern-light/entrance-moving-439a65ba9b0355bf/govern-implicit-sdf.js';

const holes=JSON.parse(readFileSync(new URL('../public/govern-compact/geometry.json',import.meta.url),'utf8')).holes;
function unpack(field,cursor){
 const circles=[],shrinks=[];
 for(let i=0;i<field.circles.length;i+=4){circles.push({x:field.circles[i],y:field.circles[i+1],r:field.circles[i+3]});shrinks.push(field.circles[i+3]-field.circles[i+2]);}
 circles.push(cursor);shrinks.push(0);
 return {...field,circles,shrinks,whiteSize:1};
}

test('render metadata retains nominal kernel support and excludes the physical cursor',()=>{
 const state={circles:[...holes,{x:300,y:225,r:20}],shrinks:Array.from({length:33},(_,i)=>i===32?0:2+i*.01),whiteSize:1.2,fusionMix:.35,pairMixes:[.2,.7],kernelRatio:.45,fusionAmount:.8};
 const before=JSON.stringify(state),field=packCursorRenderField(state);
 expect(field.circles.length).toBe(32*4);
 expect(field.circles[3]).toBe(Math.fround(holes[0].r*1.2));
 expect(field.circles[2]).toBe(Math.fround(holes[0].r*1.2-2));
 expect(field.pairMixes).toEqual([.2,.7]);
 expect(field.pairMixes).not.toBe(state.pairMixes);
 expect(JSON.stringify(state)).toBe(before);
});

test('packed render geometry reconstructs shared contour values across union, partial and full fusion',()=>{
 const cursor={x:353,y:70,r:20};let worst=0,naiveWorst=0;
 for(const mix of[0,.35,1]){
  const state={circles:[...holes,{...cursor,r:cursor.r/1.2}],shrinks:Array.from({length:33},(_,i)=>i===32?0:2+i*.01),whiteSize:1.2,fusionMix:mix,pairMixes:[mix*.6,mix],kernelRatio:.45,fusionAmount:.8};
  const field=packCursorRenderField(state),restored=unpack(field,cursor),exact=createImplicitEvaluator(state),packed=createImplicitEvaluator(restored);
  // Treating effective radii as nominal loses the support and decay lengths.
  const naive=createImplicitEvaluator({...restored,circles:restored.circles.map((c,i)=>({...c,r:c.r-restored.shrinks[i]})),shrinks:new Array(33).fill(0)});
  for(let y=35;y<=400;y+=7)for(let x=75;x<=510;x+=7){
   const expected=exact.evaluateValue(x,y);worst=Math.max(worst,Math.abs(expected-packed.evaluateValue(x,y)));naiveWorst=Math.max(naiveWorst,Math.abs(expected-naive.evaluateValue(x,y)));
  }
 }
 expect(worst).toBeLessThan(.0001);
 expect(naiveWorst).toBeGreaterThan(.05);
});
