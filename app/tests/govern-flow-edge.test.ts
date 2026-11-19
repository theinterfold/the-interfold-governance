import {expect,test} from 'bun:test';
import {flowEdgeWeight} from '../motion/govern/flow-edge.js';
import {thinInterior} from '../motion/govern/point-selection.js';
const source={x0:10,y0:10,x1:20,y1:20},roi={x0:-18,y0:-18,x1:48,y1:48};
test('local flow has no discontinuous velocity at any rectangular patch edge',()=>{
 for(let v=-18;v<=48;v+=.25){
  for(const [x,y] of [[-18,v],[48,v],[v,-18],[v,48]]){
   expect(flowEdgeWeight(x,y,source,roi)).toBe(0);
   const insideX=Math.min(48-.01,Math.max(-18+.01,x)),insideY=Math.min(48-.01,Math.max(-18+.01,y));
   expect(flowEdgeWeight(insideX,insideY,source,roi)).toBeLessThan(1e-8);
  }
 }
 for(let x=10;x<=20;x++)for(let y=10;y<=20;y++)expect(flowEdgeWeight(x,y,source,roi)).toBe(1);
 expect(flowEdgeWeight(47,47,source,roi)).toBe(0); // Rounded, not rectangular, outer support.
});
test('interior thinning preserves the sparse outer halo and surviving radii',()=>{
 // The density pass intentionally thins stacked grains anywhere. Represent
 // the outer halo with spaced points beyond the interior ellipse instead.
 const points=Array.from({length:1000},(_,i)=>{
  const angle=Math.floor(i/2)/500*Math.PI*2;
  return i%2?[300,225,.13+i*.00001]:[300+260*Math.cos(angle),225+205*Math.sin(angle),.13+i*.00001];
 });
 const halo=new Set(points.filter((_,i)=>i%2===0));
 const selected: number[][]=thinInterior(points);
 expect(selected.filter(p=>halo.has(p)).length).toBe(500);
 const interior=selected.filter(p=>!halo.has(p));
 // The center retains about 42%; allow deterministic sampling variation.
 expect(interior.length).toBeGreaterThan(180);
 expect(interior.length).toBeLessThan(240);
 for(const p of selected)expect(points.includes(p)).toBe(true);
 expect(thinInterior(points)).toEqual(selected);
});
