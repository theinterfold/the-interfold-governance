import {expect,test} from 'bun:test';
import {createPressureVelocityLimiter} from '../motion/govern/pressure-velocity-limit.js';

const grid={nx:17,ny:13,h:3},count=grid.nx*grid.ny,active=new Uint8Array(count).fill(1);
const field=(x=.8,y=.6)=>({dx:new Float32Array(count).fill(x),dy:new Float32Array(count).fill(y)});

test('a distant pressure singularity cannot slow an unchanged local correction',()=>{
  const a=field(),b=field(),limiter=createPressureVelocityLimiter(grid);
  b.dx[6*grid.nx+13]=100;b.dy[6*grid.nx+13]=-50;
  limiter.apply(a,active,.5);limiter.apply(b,active,.5);
  for(let y=3;y<=9;y++)for(let x=2;x<=8;x++){
    const k=y*grid.nx+x;
    expect(a.dx[k]).toBe(b.dx[k]);expect(a.dy[k]).toBe(b.dy[k]);
  }
});

test('large flat velocities are limited even when every gradient is zero',()=>{
  const a=field(),limiter=createPressureVelocityLimiter(grid),result=limiter.apply(a,active,.5);
  expect(result.maxVelocityGradient).toBe(0);
  expect(result.limitedCells).toBe(count);
  for(let k=0;k<count;k++){
    expect(Math.hypot(a.dx[k],a.dy[k])).toBeCloseTo(.35,6);
    expect(a.dy[k]/a.dx[k]).toBeCloseTo(.75,6);
  }
});

test('disabled pressure correction is an exact no-op after an enabled call',()=>{
  const limiter=createPressureVelocityLimiter(grid);limiter.apply(field(),active,.5);
  const a=field(12,-9),dx=a.dx.slice(),dy=a.dy.slice();
  const result=limiter.apply(a,active,0);
  expect(a.dx).toEqual(dx);expect(a.dy).toEqual(dy);expect(result.limitedCells).toBe(0);
});

test('safe vectors remain exact and boundary samples cannot bypass the pressure bound',()=>{
  const a=field(.1,-.1),limiter=createPressureVelocityLimiter(grid),untouched=7*grid.nx+5;
  a.dx[0]=40;a.dy[0]=-30;
  limiter.apply(a,active,.5);
  expect(a.dx[untouched]).toBe(Math.fround(.1));expect(a.dy[untouched]).toBe(Math.fround(-.1));
  expect(Math.hypot(a.dx[0],a.dy[0])).toBeCloseTo(.35,6);
});
