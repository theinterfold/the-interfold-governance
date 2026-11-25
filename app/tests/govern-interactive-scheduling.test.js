import {expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createUnifiedGovern} from '../motion/govern/govern-unified-density.js';
import {createCursorFlow} from '../motion/govern/cursor-flow.js';
import {createSimulationCursor} from '../motion/govern/simulation-cursor.js';
import {createPoissonWasm} from '../public/govern-light/entrance-moving-439a65ba9b0355bf/create-poisson-wasm.js';
import {createMovingWallPcgWasm} from '../public/govern-light/entrance-moving-439a65ba9b0355bf/create-moving-wall-pcg-wasm.js';
import {createImplicitEvaluator} from '../public/govern-light/entrance-moving-439a65ba9b0355bf/govern-implicit-sdf.js';

const controls = time => ({vacancyTime: time * 1.7, fusionTime: time * 1.7,
  grainTime: time, travel: 1.6, whiteSize: 1, fusionAmount: 1});

function sourceGeometry() {
  const root = new URL('../public/govern-compact/', import.meta.url);
  const geometry = JSON.parse(readFileSync(new URL('geometry.json', root), 'utf8'));
  const bytes = gunzipSync(readFileSync(new URL('points.bin.gz', root))), points = [];
  let x = 0, y = 0;
  for (let k = 0; k < bytes.length; k += 5) {
    x += bytes.readInt16LE(k); y += bytes.readInt16LE(k + 2);
    points.push([x / 64, y / 64, Math.fround(bytes[k + 4] / 400 * geometry.radiusScale)]);
  }
  return {points, holes: geometry.holes};
}

test('a new pointer reverses from the accepted wall, not the discarded exponential trajectory', () => {
  const cursor = createSimulationCursor(true);
  cursor.setTarget(285, 215, 1, 0);
  cursor.setTarget(335, 215, 1, 1);
  const accepted = {x: 294.7, y: 215, r: 20};
  expect(cursor.circle(1.02).x).toBeGreaterThan(accepted.x + 10);
  cursor.rebase(accepted, 1.02);
  cursor.setTarget(215, 215, 1, 1.02);
  expect(cursor.circle(1.02)).toEqual(accepted);
  expect(cursor.circle(1.03).x).toBeCloseTo(accepted.x - 12, 7);
});

test('continuous input can stop a real material step, reverse, and resume ordinary physics', async () => {
  const {points, holes} = sourceGeometry();
  let live = false, pending = false, interruptNext = false;
  const accepted = [], stages = [];
  const model = createUnifiedGovern(points, holes, {
    interactiveCursor: true, feasibleTransport: true, areaMode: 'global', kernelRatio: .45,
    pressureIterations: 20, currentBlurPasses: 2, maxTimeStep: .100001,
    staggeredPressure: true, fineStrength: 1, boundsBroadphase: true,
    adaptivePinch: true, disableTopologyRescue: true,
    poissonBackend: await createPoissonWasm({staggeredPressure: true}),
    movingWallPcgBackend: await createMovingWallPcgWasm(),
    isCursorInteractive: () => live,
    shouldInterruptCursor: () => pending,
    onCursorFlowFrame({time, state}) {
      if (!live) return;
      accepted.push({time, cursor: {...state.circles.at(-1)}});
      if (interruptNext) pending = true;
    },
    onVolumeStage({stage}) {
      if (live) stages.push(stage);
    },
  });
  const out = new Float32Array(points.length * 3);
  function inspect() {
    const evaluator = createImplicitEvaluator(model.state);
    let intrusion = 0;
    for (let i = 0, k = 0; i < points.length; i++, k += 3) {
      if (!Number.isFinite(out[k] + out[k + 1]) || out[k + 2] !== points[i][2])
        throw Error(`Changed grain ${i}`);
      intrusion = Math.max(intrusion, evaluator.evaluateValue(out[k], out[k + 1]));
    }
    expect(intrusion).toBeLessThan(.001);
    expect(model.state.circles.at(-1).r).toBe(20);
  }
  await model.sample(0, out, controls(0));
  for (let frame = 1; frame <= 10; frame++) {
    const time = frame * .1;
    model.setCursor(285, 215, 1, time - .1);
    await model.sample(time, out, controls(time));
  }
  live = true; interruptNext = true;
  model.setCursor(335, 215, 1, 1);
  await model.sample(1.1, out, controls(1.1));
  expect(accepted.length).toBe(1);
  expect(model.lastStep.interrupted).toBe(true);
  expect(model.acceptedTime).toBeGreaterThan(1);
  expect(model.acceptedTime).toBeLessThan(1.1);
  expect(model.acceptedTime).toBe(accepted[0].time);
  expect(model.state.circles.at(-1)).toEqual(accepted[0].cursor);
  expect(stages).not.toContain('before-pressure');
  inspect();

  // This short reverse would initially move forward if the cursor resampled
  // the old exponential path instead of rebasing on its accepted subdivision.
  const start = model.acceptedTime, previous = {...model.state.circles.at(-1)};
  pending = false;
  model.setCursor(215, 215, 1, start);
  await model.sample(start + .01, out, controls(start + .01));
  expect(accepted.length).toBe(2);
  expect(model.acceptedTime).toBeCloseTo(start + .01, 10);
  expect(model.state.circles.at(-1).x).toBeCloseTo(previous.x - 12, 7);
  expect(accepted[1].time).toBeGreaterThan(accepted[0].time);
  inspect();

  pending = false; interruptNext = false;
  const resumed = model.acceptedTime + .1;
  model.setCursor(215, 215, 1, model.acceptedTime);
  await model.sample(resumed, out, controls(resumed));
  expect(model.lastStep.interrupted).not.toBe(true);
  expect(model.acceptedTime).toBe(resumed);
  expect(stages).toContain('after-pressure');
  inspect();

  // Continuous pointer work must neither move native walls without pressure
  // recovery nor be able to cancel the scheduled maintenance step forever.
  const native = model.state.circles.slice(0, -1).map(circle => ({...circle}));
  const nativeShrinks = [...model.state.shrinks];
  stages.length = 0; pending = true;
  for (let i = 0; i < 4; i++) {
    model.setCursor(i % 2 ? 255 : 315, 215, 1, model.acceptedTime);
    await model.sampleCursor(model.acceptedTime + .1, out);
    expect(model.lastStep.fastLane).toBe(true);
    expect(model.state.circles.slice(0, -1)).toEqual(native);
    expect([...model.state.shrinks]).toEqual(nativeShrinks);
  }
  expect(stages).not.toContain('after-pressure');
  inspect();
  const heldCursor = {...model.state.circles.at(-1)};
  await model.sampleMaintenance(model.acceptedTime + .1, out, controls(resumed + .1));
  expect(model.lastStep.maintenance).toBe(true);
  expect(model.lastStep.interrupted).not.toBe(true);
  expect(model.state.circles.at(-1)).toEqual(heldCursor);
  expect(model.state.circles.slice(0, -1)).not.toEqual(native);
  expect(stages).toContain('after-pressure');
  inspect();

}, 30000);

test('a failed GPU cursor piece falls back from unchanged CPU material', async () => {
  const particles = new Float32Array([0, 0, .5]), source = particles.slice();
  const state = x => ({circles: [{x, y: 30, r: 5}], sized: [{x, y: 30, r: 5}],
    shrinks: new Float64Array([0]), whiteSize: 1, fusionMix: 1, fusionAmount: 1,
    pairMixes: [], kernelRatio: .45});
  const starts = [], failure = new Error('simulated device loss');
  let failed = false, corrections = 0;
  const gpu = {get isAvailable() {return !failed;}, supports: () => true,
    uploadParticles(input) {expect([...input]).toEqual([...source]);},
    enqueuePreparedFlow() {throw failure;}, disable(error) {expect(error).toBe(failure); failed = true;}};
  const flow = createCursorFlow(particles, source, {
    prepare() {return {stats: {}};},
    apply(input) {starts.push(input[0]); input[0] += .1; return {};},
  }, {x0: -40, y0: -40, x1: 200, y1: 150}, {x0: -40, y0: -40, h: 3, nx: 81, ny: 64}, () => gpu);
  await flow.apply(state(25), state(73), {time: .1, dt: .1, massScale: 1,
    retainedFractionAt: () => 1, move() {}, correctTexture() {corrections++;}});
  expect(failed).toBe(true);
  expect(starts.length).toBe(4);
  expect(starts[0]).toBe(0);
  expect(particles[0]).toBeCloseTo(.4, 6);
  expect(particles[2]).toBe(.5);
  expect(corrections).toBe(4);
});
