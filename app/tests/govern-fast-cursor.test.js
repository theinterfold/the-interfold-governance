import {expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createUnifiedGovern} from '../motion/govern/govern-unified-density.js';
import {createPoissonWasm} from '../public/govern-light/entrance-moving-439a65ba9b0355bf/create-poisson-wasm.js';
import {createMovingWallPcgWasm} from '../public/govern-light/entrance-moving-439a65ba9b0355bf/create-moving-wall-pcg-wasm.js';
import {createImplicitEvaluator} from '../public/govern-light/entrance-moving-439a65ba9b0355bf/govern-implicit-sdf.js';

import {thinInterior} from '../motion/govern/point-selection.js';
import {selectPointProfile} from '../public/govern-light/entrance-moving-439a65ba9b0355bf/point-profile.js';

function sourceGeometry() {
  // Keep this retained physical-path regression on its original full population.
  // The product build can choose a lighter renderer profile independently.
  const root = new URL('../public/govern-light/entrance-moving-439a65ba9b0355bf/', import.meta.url);
  const holes = JSON.parse(readFileSync(new URL('holes.json', root), 'utf8'));
  const bytes = gunzipSync(readFileSync(new URL('points.bin.gz', root)));
  const points = [];
  let x = 0, y = 0;
  for (let k = 0; k < bytes.length; k += 5) {
    x += bytes.readInt16LE(k);
    y += bytes.readInt16LE(k + 2);
    points.push([x / 64, y / 64, bytes[k + 4] / 400]);
  }
  return {points: thinInterior(selectPointProfile(points, 'light').points, holes, 1), holes};
}

// Measure material, not the white outline. A contour-only intrusion check also
// passes when thousands of grains collapse onto a rim and leave an empty wake.
function materialDensity(model, particles, evaluator, center, region) {
  let actual = 0, expected = 0;
  function contains(x, y) {
    if (Math.hypot(x - center.x, y - center.y) >= (region === 'wake' ? 15 : 35)) return false;
    const gap = evaluator.evaluate(x, y).signedGap;
    return gap >= 0 && (region === 'wake' || gap < 2);
  }
  for (let k = 0; k < particles.length; k += 3) {
    if (contains(particles[k], particles[k + 1])) actual += particles[k + 2] ** 2;
  }
  const grid = model.grid;
  // Integrate the existing density reference over the same exposed fluid.
  // Using the shared implicit boundary excludes legitimately fused white areas.
  for (let y = center.y - 36; y < center.y + 36; y++) {
    for (let x = center.x - 36; x < center.x + 36; x++) {
      if (!contains(x + .5, y + .5)) continue;
      const ix = Math.round((x + .5 - grid.x0) / grid.h);
      const iy = Math.round((y + .5 - grid.y0) / grid.h);
      expected += model.reference[iy * grid.nx + ix] / (grid.h * grid.h);
    }
  }
  return {actual, expected, ratio: expected > 0 ? actual / expected : null};
}

test('fast cursor jumps and reversals retain material density without a crowded rim or empty wake', async () => {
  const {points, holes} = sourceGeometry();
  let streamedFrames = 0, lastStreamTime = -Infinity, worstStreamIntrusion = 0, callbackAuditMs = 0;
  const streamedJumps = new Set();
  function inspectGrains(particles, state, label) {
    expect(particles.length).toBe(points.length * 3);
    expect(state.circles.length).toBe(holes.length + 1);
    expect(state.shrinks.at(-1)).toBe(0);
    const evaluator = createImplicitEvaluator(state);
    let intrusion = 0;
    for (let i = 0, k = 0; i < points.length; i++, k += 3) {
      if (!Number.isFinite(particles[k] + particles[k + 1])) throw Error(`Non-finite grain ${i} in ${label}`);
      if (particles[k + 2] !== points[i][2]) throw Error(`Changed grain radius ${i} in ${label}`);
      intrusion = Math.max(intrusion, evaluator.evaluateValue(particles[k], particles[k + 1]));
    }
    expect(intrusion).toBeLessThan(.001);
    return {evaluator, intrusion};
  }
  const model = createUnifiedGovern(points, holes, {
    interactiveCursor: true,
    feasibleTransport: true,
    areaMode: 'global',
    kernelRatio: .45,
    pressureIterations: 20,
    currentBlurPasses: 2,
    maxTimeStep: .100001,
    staggeredPressure: true,
    fineStrength: 1,
    boundsBroadphase: true,
    adaptivePinch: true,
    disableTopologyRescue: true,
    poissonBackend: await createPoissonWasm({staggeredPressure: true}),
    movingWallPcgBackend: await createMovingWallPcgWasm(),
    onCursorFlowFrame({time, particles, state}) {
      const auditStarted = performance.now();
      expect(Number.isFinite(time)).toBe(true);
      expect(time).toBeGreaterThanOrEqual(lastStreamTime - 1e-9);
      lastStreamTime = time;
      streamedFrames++;
      const {intrusion} = inspectGrains(particles, state, `streamed time ${time}`);
      worstStreamIntrusion = Math.max(worstStreamIntrusion, intrusion);
      if (time >= 2) expect(state.circles.at(-1).r).toBe(20);
      for (const frame of jumps.keys()) {
        if (time > (frame - 1) * .1 + 1e-9 && time <= frame * .1 + 1e-9) streamedJumps.add(frame);
      }
      callbackAuditMs += performance.now() - auditStarted;
    },
  });
  const out = new Float32Array(points.length * 3);
  const jumps = new Map([[21, 335], [31, 285], [41, 435], [51, 285]]);
  const rows = [];
  let targetX = 285, previousCenter = null, wakeCenter = null;
  expect(points.length).toBe(33112);

  for (let frame = 0; frame <= 54; frame++) {
    const time = frame * .1;
    if (jumps.has(frame)) {
      targetX = jumps.get(frame);
      wakeCenter = {...previousCenter};
    }
    if (frame > 0) model.setCursor(targetX, 215, 1, time - .1);
    const started = performance.now(), auditBefore = callbackAuditMs;
    await model.sample(time, out, {
      vacancyTime: time * 1.7,
      fusionTime: time * 1.7,
      grainTime: time,
      travel: 1.6,
      whiteSize: 1,
      fusionAmount: 1,
    });
    const elapsed = performance.now() - started - (callbackAuditMs - auditBefore);
    const cursor = model.state.circles.at(-1);
    const {evaluator} = inspectGrains(out, model.state, `frame ${frame}`);
    previousCenter = {x: cursor.x, y: cursor.y};
    expect(model.count).toBe(points.length);
    if (frame >= 20) expect(cursor.r).toBe(20);

    if ([...jumps.keys()].some(jump => frame >= jump && frame <= jump + 2)) {
      const ring = materialDensity(model, out, evaluator, cursor, 'ring');
      const wake = materialDensity(model, out, evaluator, wakeCenter, 'wake');
      rows.push({frame, elapsed, ring, wake});
      // Tiny exposed slivers have too few grains for a stable density estimate.
      if (ring.expected > 8) expect(ring.ratio).toBeLessThanOrEqual(1.75);
      if (wake.expected > 8) expect(wake.ratio).toBeGreaterThanOrEqual(.7);
    }
  }
  expect(rows.length).toBe(12);
  expect(streamedFrames).toBeGreaterThan(4);
  expect(streamedJumps.size).toBe(4);
  console.log('Fast cursor material audit', {
    count: points.length,
    sampledFrames: rows.length,
    streamedFrames,
    worstStreamIntrusion,
    worstRing: Math.max(...rows.map(row => row.ring.ratio ?? 0)),
    leastWake: Math.min(...rows.filter(row => row.wake.expected > 8).map(row => row.wake.ratio)),
    // CPU timing is diagnostic; CI hardware speed is not a correctness gate.
    maximumSampleMs: Math.max(...rows.map(row => row.elapsed)),
  });
}, 120000);

test('cursor entry, fast reversals and leaving do not launch distant grains through global pressure', async () => {
  const {points, holes} = sourceGeometry();
  const out = new Float32Array(points.length * 3);
  let frame = 0, previousCursor = {x: 285, y: 215, r: 0}, beforePressure = null;
  const observedFrames = new Set();
  let inspectedSteps = 0, worstP95 = 0, worstMove = 0;
  const model = createUnifiedGovern(points, holes, {
    interactiveCursor: true,
    feasibleTransport: true,
    areaMode: 'global',
    kernelRatio: .45,
    pressureIterations: 20,
    currentBlurPasses: 2,
    maxTimeStep: .100001,
    staggeredPressure: true,
    fineStrength: 1,
    boundsBroadphase: true,
    adaptivePinch: true,
    disableTopologyRescue: true,
    poissonBackend: await createPoissonWasm({staggeredPressure: true}),
    movingWallPcgBackend: await createMovingWallPcgWasm(),
    onVolumeStage({stage, particles, state, stepDuration}) {
      if (frame < 31) return;
      if (stage === 'before-pressure') beforePressure = particles.slice();
      if (stage !== 'after-pressure' || !beforePressure) return;
      const end = state.circles.at(-1);
      const start = previousCursor.r <= .01 ? end : previousCursor;
      const dx = end.x - start.x, dy = end.y - start.y, lengthSquared = dx * dx + dy * dy;
      const gain = Math.min(1, stepDuration / .1), moves = [];
      let maximum = 0;
      for (let k = 0; k < particles.length; k += 3) {
        const x = beforePressure[k], y = beforePressure[k + 1];
        const u = lengthSquared ? Math.max(0, Math.min(1, ((x - start.x) * dx + (y - start.y) * dy) / lengthSquared)) : 0;
        if (Math.hypot(x - start.x - u * dx, y - start.y - u * dy) <= 100) continue;
        // Normalize adaptive substeps so subdivisions cannot hide the same
        // excessive velocity behind a smaller interval.
        const move = Math.hypot(particles[k] - x, particles[k + 1] - y) / gain;
        moves.push(move);
        maximum = Math.max(maximum, move);
      }
      expect(moves.length).toBeGreaterThan(10000);
      moves.sort((a, b) => a - b);
      const p95 = moves[Math.floor(moves.length * .95)];
      // The broken pressure solve moved 61–76% of distant grains by ~2.2
      // units, although FVM had left those grains still. Preserve the normal
      // small authored motion rather than asserting an immobile background.
      expect(p95).toBeLessThanOrEqual(.4);
      expect(maximum).toBeLessThanOrEqual(1.8);
      worstP95 = Math.max(worstP95, p95);
      worstMove = Math.max(worstMove, maximum);
      inspectedSteps++;
      observedFrames.add(frame);
    },
  });

  // Match the frame-by-frame browser reproduction: enter at31, move slowly
  // at46–60, jump at65/75/85, then leave at95 and retain the settled state.
  for (frame = 0; frame <= 100; frame++) {
    const time = frame * .1;
    const pointerX = frame < 65 ? 285 + Math.max(0, Math.min(15, frame - 45)) * 2 : frame < 75 ? 365 : frame < 85 ? 215 : 365;
    if (frame > 0) model.setCursor(pointerX, 215, frame > 30 && frame < 95 ? 1 : 0, Math.max(0, time - .1));
    await model.sample(time, out, {
      vacancyTime: time * 1.7,
      fusionTime: time * 1.7,
      grainTime: time,
      travel: 1.6,
      whiteSize: 1,
      fusionAmount: 1,
    });
    previousCursor = {...model.state.circles.at(-1)};
  }
  for (const observed of [31, 46, 60, 65, 75, 85, 95, 100]) expect(observedFrames.has(observed)).toBe(true);
  console.log('Distant cursor pressure audit', {inspectedSteps, worstP95, worstMove});
}, 120000);
