import {expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createUnifiedGovern} from '../motion/govern/govern-unified-density.js';
import {createPoissonWasm} from '../public/govern-light/entrance-moving-439a65ba9b0355bf/create-poisson-wasm.js';
import {createMovingWallPcgWasm} from '../public/govern-light/entrance-moving-439a65ba9b0355bf/create-moving-wall-pcg-wasm.js';
import {createImplicitEvaluator} from '../public/govern-light/entrance-moving-439a65ba9b0355bf/govern-implicit-sdf.js';
import {createWhiteBounds} from '../public/govern-light/entrance-moving-439a65ba9b0355bf/white-bounds.js';

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

function pointerAt(frame) {
  if (frame < 65) return [285 + Math.max(0, Math.min(15, frame - 45)) * 2, 215];
  if (frame < 75) return [365, 215];
  if (frame < 85) return [215, 215];
  if (frame < 95) return [365, 215];
  if (frame < 105) return [365, 315];
  if (frame < 115) return [215, 315];
  if (frame < 125) return [215, 155];
  if (frame < 135) return [365, 315];
  if (frame < 145) return [215, 155];
  return [365, 215];
}

function transportBounds(start, end, padding, spacing, snapped, grid) {
  // Audit the observed old and new boundaries independently of production
  // constants, so moving the numerical seam cannot make the test follow it.
  const reach = 50;
  let x0 = Math.max(grid.x0, Math.min(start.x, end.x) - reach - padding);
  let y0 = Math.max(grid.y0, Math.min(start.y, end.y) - reach - padding);
  let x1 = Math.min(grid.x0 + (grid.nx - 1) * grid.h, Math.max(start.x, end.x) + reach + padding);
  let y1 = Math.min(grid.y0 + (grid.ny - 1) * grid.h, Math.max(start.y, end.y) + reach + padding);
  if (snapped) {
    const left = Math.floor(x0 / spacing) * spacing, top = Math.floor(y0 / spacing) * spacing;
    x0 = left + spacing;
    y0 = top + spacing;
    x1 = left + (Math.ceil((x1 - left) / spacing) - 1) * spacing;
    y1 = top + (Math.ceil((y1 - top) / spacing) - 1) * spacing;
  }
  return {x0, y0, x1, y1};
}

function fluidSamples(model, particles, state) {
  const evaluator = createImplicitEvaluator(state), actual = [], reference = [];
  const visibleFluid = (x, y) => x >= 0 && x <= 600 && y >= 0 && y <= 450 &&
    evaluator.evaluate(x, y).signedGap > 5;
  for (let k = 0; k < particles.length; k += 3) {
    if (visibleFluid(particles[k], particles[k + 1])) {
      actual.push([particles[k], particles[k + 1], particles[k + 2] ** 2]);
    }
  }
  const grid = model.grid;
  for (let y = .5; y < 450; y++) {
    for (let x = .5; x < 600; x++) {
      if (!visibleFluid(x, y)) continue;
      const ix = Math.round((x - grid.x0) / grid.h), iy = Math.round((y - grid.y0) / grid.h);
      reference.push([x, y, model.reference[iy * grid.nx + ix] / grid.h ** 2]);
    }
  }
  return {actual, reference};
}

function boundaryContrast(samples, bounds) {
  function measure(points) {
    const mass = new Float64Array(8);
    for (const [x, y, weight] of points) {
      if (x < bounds.x0 - 7 || x > bounds.x1 + 7 || y < bounds.y0 - 7 || y > bounds.y1 + 7) continue;
      for (let side = 0; side < 4; side++) {
        const vertical = side < 2;
        const edge = side === 0 ? bounds.x0 : side === 1 ? bounds.x1 : side === 2 ? bounds.y0 : bounds.y1;
        const along = vertical ? y : x, low = vertical ? bounds.y0 : bounds.x0, high = vertical ? bounds.y1 : bounds.x1;
        if (along < low + 8 || along > high - 8) continue;
        const distance = Math.abs((vertical ? x : y) - edge);
        if (distance < 2) mass[side * 2] += weight;
        else if (distance >= 3 && distance < 7) mass[side * 2 + 1] += weight;
      }
    }
    return mass;
  }
  const actual = measure(samples.actual), expected = measure(samples.reference), rows = [];
  for (let side = 0; side < 4; side++) {
    const edge = side * 2, flank = edge + 1;
    // Sparse slivers have too few grains for a stable density measurement.
    if (expected[edge] <= 8 || expected[flank] <= 8) continue;
    rows.push({side, contrast: (actual[edge] / expected[edge]) / (actual[flank] / expected[flank])});
  }
  return rows;
}

function thinContourMass(model, particles, state) {
  const evaluator = createImplicitEvaluator(state), bounds = createWhiteBounds(model.grid);
  bounds.setState(state);
  const circles = state.circles.map(() => ({actual: 0, expected: 0}));
  const sectors = Array.from({length: 12}, () => ({actual: 0, expected: 0}));
  const cursorIndex = state.circles.length - 1, cursor = state.circles[cursorIndex];
  function locate(x, y) {
    if (bounds.pointOutside(x, y)) return null;
    const gap = evaluator.evaluate(x, y).signedGap;
    if (gap < 0 || gap >= .5) return null;
    // Assign fused contours once, to the nearest effective circle boundary.
    let index = -1, nearest = Infinity;
    for (let i = 0; i < state.circles.length; i++) {
      const circle = state.circles[i];
      if (circle.r < .1) continue;
      const distance = Math.abs(Math.hypot(x - circle.x, y - circle.y) -
        (circle.r * state.whiteSize - state.shrinks[i]));
      if (distance < nearest) {nearest = distance; index = i;}
    }
    const sector = index === cursorIndex ? Math.min(11,
      Math.floor((Math.atan2(y - cursor.y, x - cursor.x) + Math.PI) / (2 * Math.PI) * 12)) : -1;
    return {index, sector};
  }
  function deposit(x, y, mass, kind) {
    const location = locate(x, y);
    if (!location || location.index < 0) return;
    circles[location.index][kind] += mass;
    if (location.sector >= 0) sectors[location.sector][kind] += mass;
  }
  for (let k = 0; k < particles.length; k += 3) {
    deposit(particles[k], particles[k + 1], particles[k + 2] ** 2, 'actual');
  }
  const grid = model.grid;
  for (let y = .25; y < 450; y += .5) for (let x = .25; x < 600; x += .5) {
    const ix = Math.round((x - grid.x0) / grid.h), iy = Math.round((y - grid.y0) / grid.h);
    deposit(x, y, model.reference[iy * grid.nx + ix] / grid.h ** 2 * .25, 'expected');
  }
  const angular = sectors.map((_, start) => {
    const band = {start, actual: 0, expected: 0};
    for (let offset = 0; offset < 3; offset++) {
      const sector = sectors[(start + offset) % 12];
      band.actual += sector.actual; band.expected += sector.expected;
    }
    return band;
  });
  return {native: circles.slice(0, cursorIndex), cursor: circles[cursorIndex], angular};
}

test('repeated fast sweeps do not leave rectangular seams or concentrated contour bands', async () => {
  const {points, holes} = sourceGeometry();
  const auditedFrames = new Set([115, 135, 145]);
  let frame = 0, streamedCenters = [];
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
    onCursorFlowFrame({state}) {
      if (auditedFrames.has(frame)) streamedCenters.push({...state.circles.at(-1)});
    },
  });
  const out = new Float32Array(points.length * 3), rows = [], contourRows = [];
  const grainMassAllowance = Math.max(...points.map(point => point[2] ** 2));
  let previous = {x: 285, y: 215};
  expect(points.length).toBe(33112);

  // The initial horizontal sweep looked clean. Repeating it, then sweeping a
  // square and diagonals, exposed a persistent straight density seam.
  for (frame = 0; frame <= 150; frame++) {
    const time = frame * .1, [x, y] = pointerAt(frame);
    if (frame > 0) model.setCursor(x, y, frame > 30 ? 1 : 0, time - .1);
    streamedCenters = [];
    await model.sample(time, out, {
      vacancyTime: time * 1.7,
      fusionTime: time * 1.7,
      grainTime: time,
      travel: 1.6,
      whiteSize: 1,
      fusionAmount: 1,
    });
    const cursor = model.state.circles.at(-1);
    if (frame === 115 || frame === 145) {
      const contour = thinContourMass(model, out, model.state);
      // The old global pressure clamp left native bands at 3.64x / 2.30x
      // density in these frames. Audit the half-pixel band: a two-pixel ring
      // averages the dark line together with its depleted neighbors.
      const nativeLimit = frame === 115 ? 2.1 : 1.65;
      for (let index = 0; index < contour.native.length; index++) {
        const band = contour.native[index];
        expect(band.actual, `native contour ${index}, frame ${frame}`).toBeLessThanOrEqual(
          nativeLimit * band.expected + grainMassAllowance);
      }
      expect(contour.cursor.expected).toBeGreaterThan(5);
      expect(contour.cursor.actual / contour.cursor.expected, `cursor contour, frame ${frame}`).toBeLessThan(2.1);
      // Keep every angular window, including tiny exposed slivers. A single
      // grain of tolerance handles discrete sampling without dropping them.
      for (const band of contour.angular) {
        expect(band.actual, `cursor sector ${band.start}, frame ${frame}`).toBeLessThanOrEqual(
          3.75 * band.expected + grainMassAllowance);
      }
      contourRows.push({frame, ...contour});
    }
    if (auditedFrames.has(frame)) {
      expect(streamedCenters.length).toBeGreaterThan(1);
      expect(cursor.r).toBe(20);
      const samples = fluidSamples(model, out, model.state);
      const centers = [previous, ...streamedCenters];
      const segments = [[previous, cursor], ...centers.slice(1).map((end, i) => [centers[i], end])];
      for (const [label, padding, spacing, limit] of [['old', 12, 3, 1.35], ['new', 36, 4, 1.45]]) {
        for (const snapped of [false, true]) {
          const seen = new Set();
          for (const [start, end] of segments) {
            const bounds = transportBounds(start, end, padding, spacing, snapped, model.grid);
            const key = JSON.stringify(bounds);
            if (seen.has(key)) continue;
            seen.add(key);
            for (const row of boundaryContrast(samples, bounds)) {
              const labelAtFrame = `${label} boundary, frame ${frame}, side ${row.side}, snapped ${snapped}`;
              expect(Number.isFinite(row.contrast), labelAtFrame).toBe(true);
              expect(row.contrast, labelAtFrame).toBeLessThan(limit);
              rows.push({frame, label, snapped, ...row});
            }
          }
        }
      }
    }
    previous = {...cursor};
  }
  for (const audited of auditedFrames) expect(rows.some(row => row.frame === audited)).toBe(true);
  expect(rows.length).toBeGreaterThan(200);
  expect(contourRows.map(row => row.frame)).toEqual([115, 145]);
  console.log('Cursor transport boundary audit', {
    frames: [...auditedFrames],
    measuredBands: rows.length,
    worstOldBoundary: Math.max(...rows.filter(row => row.label === 'old').map(row => row.contrast)),
    worstNewBoundary: Math.max(...rows.filter(row => row.label === 'new').map(row => row.contrast)),
    contourBands: contourRows.map(row => ({
      frame: row.frame,
      cursorDensity: row.cursor.actual / row.cursor.expected,
      nativeMassExcess: Math.max(...row.native.map(band => band.actual - band.expected)),
      angularWindows: row.angular.length,
    })),
  });
}, 120000);
