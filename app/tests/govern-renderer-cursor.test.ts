import {expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {advancePresentation, nextSolverTime, nextPaintDeadline} from '../utils/governHeroPlayback.js';
import {packCursorHoles} from '../motion/govern/cursor-metaball.js';
import {createCursorPresence,cursorRegionAmount} from '../motion/govern/cursor-interaction.js';

// Exercise the real adapter against a worker that never completes its pending
// sample. The rendered pointer must remain independent of solver progress.
const source = readFileSync(new URL('../utils/governHeroRenderer.js', import.meta.url), 'utf8')
  .replace(/^import[^\n]+\n/gm, '')
  .replace('new URL(import.meta.url).search', '""')
  .replace(/export /g, '')
  .replace(/await import\(\/\* webpackIgnore: true \*\/ `[^`]+`\)/, 'await rendererModule()');

async function setup(reducedMotion = false) {
  const points = new Float32Array([200, 210, .4, 350, 225, .3]);
  const draws: any[] = [], messages: any[] = [], workers: any[] = [];
  let now=100;
  const canvas = {dataset: {} as Record<string, string>,
    getBoundingClientRect: () => ({left: 0, top: 0, width: 600, height: 450})};
  const renderer = {resize() {}, dispose() {},
    drawInterpolated(lo: any, hi: any, alpha: number, zoom: number, scale: number, entrance: number, cursor: any) {
      draws.push({points: Array.from(lo.points), cursor: {...cursor}, alpha});
    }};
  const context: any = {canvas, console, AbortController, DOMException, Event,
    Float32Array, ArrayBuffer, devicePixelRatio: 1, performance: {now: () => now},
    document: {dispatchEvent() {}}, setTimeout: () => 1, clearTimeout() {},
    advancePresentation, nextSolverTime, nextPaintDeadline, packCursorHoles,
    createCursorPresence,cursorRegionAmount,
    prewarmGovernWorker() {},
    fetch: async (url: string) => url.includes('geometry.json')
      ? {ok: true, json: async () => ({count: 2, holes: [{x: 300, y: 225, r: 15}]})} : {},
    rendererModule: async () => ({createGrainRenderer: () => renderer}),
    readPointStream: async (_response: any, meta: any, reveal: Function) => {
      reveal(points, meta.count); return points;
    },
    Worker: class {
      onmessage: any;
      constructor() {workers.push(this);}
      postMessage(message: any) {messages.push(message);}
      terminate() {}
    },
  };
  runInNewContext(source + '\nglobalThis.makeHero = createGovernHero;', context);
  const api = await context.makeHero(canvas, reducedMotion, {animateEntrance: false});
  await Promise.resolve();
  return {api, canvas, draws, messages, workers, points,setNow:(value:number)=>{now=value;}};
}

test('latest pointer renders on every RAF while native physics is blocked', async () => {
  const p = await setup();
  p.api.setPlaying(true);
  p.workers[0].onmessage({data: {type: 'ready'}});
  expect(p.messages.filter(m => m.type === 'sample')).toHaveLength(1);
  expect(p.messages.find(m => m.type === 'sample').pointer).toEqual([300, 225, 0]);

  p.api.setPointer(330, 240, true);
  p.api.render(.1);
  expect(p.draws.at(-1).cursor).toEqual({x: 330, y: 240, r: 20});
  const drawn = p.draws.length;
  p.api.setPointer(410, 195, true);
  p.api.render(.1 + 1 / 120);
  expect(p.draws.length).toBe(drawn + 1);
  expect(p.draws.at(-1).cursor).toEqual({x: 410, y: 195, r: 20});
  expect(p.draws.at(-1).points).toEqual(Array.from(p.points));
  expect(p.messages.filter(m => m.type === 'pointer')).toHaveLength(0);
  expect(p.messages.filter(m => m.type === 'sample')).toHaveLength(1);
  expect(p.canvas.dataset.cursorBackend).toBe('webgl-shared-field');
  p.api.dispose();
});

test('leave and suspension clear the visual cursor before another RAF', async () => {
  const p = await setup();
  p.api.setPlaying(true); p.api.setPointer(330, 240, true); p.api.render(.1);
  const beforeLeave = p.draws.length;
  p.api.setPointer(0, 0, false);
  expect(p.draws.length).toBe(beforeLeave + 1);
  expect(p.draws.at(-1).cursor.r).toBe(0);
  p.api.setPointer(350, 220, true); p.api.render(.2);
  p.api.setPlaying(false);
  expect(p.draws.at(-1).cursor.r).toBe(0);
  p.api.dispose();
});

test('reduced motion never starts a worker or displays the cursor field', async () => {
  const p = await setup(true);
  p.api.setPlaying(true); p.api.setPointer(330, 240, true); p.api.render(.1);
  expect(p.workers).toHaveLength(0);
  expect(p.draws.at(-1).cursor.r).toBe(0);
  p.api.dispose();
});

test('ordinary exit settles over 400 ms, re-entry stays immediate and suspension clears', async () => {
  const p=await setup();p.api.setPlaying(true);
  p.api.setPointer(330,240,true);p.api.render(.1);
  p.api.exitPointer();
  expect(p.draws.at(-1).cursor.r).toBe(20);
  p.setNow(180);p.api.render(.18);
  expect(p.draws.at(-1).cursor.r).toBeGreaterThan(10);
  expect(p.draws.at(-1).cursor.r).toBeLessThan(20);
  p.api.setPointer(410,195,true);p.api.render(.19);
  expect(p.draws.at(-1).cursor).toEqual({x:410,y:195,r:20});
  p.api.exitPointer();p.setNow(580);p.api.render(.58);
  expect(p.draws.at(-1).cursor.r).toBe(0);
  p.api.setPointer(350,220,true);p.api.exitPointer();p.api.setPlaying(false);
  expect(p.draws.at(-1).cursor.r).toBe(0);
  p.api.dispose();
});
