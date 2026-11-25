import { expect, test } from 'bun:test';
import { advancePresentation, nextSolverTime, nextPaintDeadline } from '../utils/governHeroPlayback';

test('autonomous completed frames retain smooth interpolation', () => {
  const display = advancePresentation(.5, 1/60, .6, 2.6);
  expect(display).toBeGreaterThan(.5);
  expect(display).toBeLessThan(.6);
});

test('an active or exiting cursor presents its latest feasible frame without a second smoothing delay', () => {
  for (const elapsed of [0, 1/144, 1/60, .1]) {
    expect(advancePresentation(.5, elapsed, .54, 2.6, true)).toBe(.54);
    expect(advancePresentation(.54, elapsed, .54, 2.6, true)).toBe(.54);
  }
  expect(advancePresentation(.54, 1/60, .64, 2.6, false)).toBeLessThan(.64);
});

test('a slow solver cannot create a catch-up queue or extrapolate through circles', () => {
  let display=.5, requested=.6, latest=.6;
  for(let frame=0;frame<120;frame++) display=advancePresentation(display,1/60,latest,2.6);
  expect(display).toBe(latest);
  requested=nextSolverTime(display,requested,.1)!;
  expect(requested).toBeCloseTo(.7);
  expect(nextSolverTime(display,requested,.1)).toBeNull();
  latest=.7;
  display=advancePresentation(display,1/60,latest,2.6);
  expect(display).toBeLessThan(latest);
  expect(display).toBeGreaterThan(.6);
});

test('sustained playback keeps a bounded presentation lead without accumulating debt', () => {
  for(const solverMs of [10,40,150]) {
    let display=.5,latest=.6,requested=.6,pending:null|{time:number,ready:number}=null;
    for(let now=0;now<4000;now+=1000/60){
      if(pending && now>=pending.ready){latest=pending.time;pending=null;}
      display=advancePresentation(display,1/60,latest,2.6);
      const next=nextSolverTime(display,requested,.1);
      if(next!==null && !pending){
        expect(next-requested).toBeCloseTo(.1);
        requested=next;pending={time:next,ready:now+solverMs};
      }
      expect(display).toBeLessThanOrEqual(latest);
      expect(latest-display).toBeLessThanOrEqual(.15+1e-9);
      expect(requested-latest).toBeLessThanOrEqual(.1+1e-9);
    }
  }
});

test('non-interactive look-ahead is bounded and stops when the buffer is full',()=>{
 let requested=0,steps=0;
 while(true){const next=nextSolverTime(0,requested,.1,1.8);if(next===null)break;requested=next;steps++;if(steps>25)throw Error('Unbounded queue');}
 expect(steps).toBe(19);
 expect(requested).toBeCloseTo(1.9);
 expect(nextSolverTime(0,requested,.1,1.8)).toBeNull();
 expect(nextSolverTime(.2,requested,.1,1.8)).toBeCloseTo(2);
});

test('paint cadence retains 60 updates per second across refresh rates and timing jitter',()=>{
 for(const hz of [60,120,144]){
  let deadline=-Infinity,draws=0;
  for(let i=0;i<hz*10;i++){
   const now=i*1000/hz+Math.sin(i*1.7)*.35;
   const next=nextPaintDeadline(now,deadline);
   if(next!==null){draws++;deadline=next;}
  }
  expect(draws).toBeGreaterThanOrEqual(599);
  expect(draws).toBeLessThanOrEqual(601);
 }
});

test('a delayed paint skips missed deadlines without a burst of catch-up paints',()=>{
 const initial=nextPaintDeadline(0,-Infinity)!;
 const resumed=nextPaintDeadline(1000,initial)!;
 expect(resumed).toBeGreaterThan(1000);
 expect(resumed).toBeLessThanOrEqual(1000+1000/60+.00001);
 expect(nextPaintDeadline(1001,resumed)).toBeNull();
});
