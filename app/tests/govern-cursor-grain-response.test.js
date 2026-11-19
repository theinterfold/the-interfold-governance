import {expect, test} from 'bun:test';
import {createCursorGrainResponse, CURSOR_GRAIN_MAX_SHIFT, DEFAULT_GRAIN_RESPONSE, normalizeGrainResponse} from '../motion/govern/cursor-grain-response.js';

test('entry has no impulse, fast reversals stay bounded and rest restores exactly', () => {
  const response = createCursorGrainResponse();
  expect([...response.update({x: 450, y: 100, r: 20}, 0)]).toEqual([0, 0]);
  let time = 0, shift;
  for (let i = 0; i < 300; i++) {
    time += 1000 / 120;
    shift = response.update({x: 300 + 100 * Math.sin(i), y: 225 + 80 * Math.cos(i), r: 20}, time);
    expect(Math.hypot(...shift)).toBeLessThanOrEqual(CURSOR_GRAIN_MAX_SHIFT + 1e-6);
  }
  for (let i = 0; i < 480; i++) shift = response.update({x: 300, y: 225, r: 20}, time += 1000 / 120);
  expect([...shift]).toEqual([0, 0]);
});

test('leave, resize and a suspended clock cannot leave a stale response', () => {
  const response = createCursorGrainResponse();
  const move = start => {
    response.update({x: 200, y: 225, r: 20}, start);
    expect(response.update({x: 210, y: 225, r: 20}, start + 10)[0]).toBeGreaterThan(0);
  };
  move(0);
  expect([...response.update({x: 210, y: 225, r: 0}, 20)]).toEqual([0, 0]);
  expect([...response.update({x: 400, y: 100, r: 20}, 30)]).toEqual([0, 0]);
  response.reset(); move(100);
  expect([...response.update({x: 500, y: 300, r: 20}, 1000)]).toEqual([0, 0]);
  response.reset();
  expect([...response.update({x: 100, y: 100, r: 20}, 1010)]).toEqual([0, 0]);
});

test('the same motion and rest have consistent strength at 30, 60 and 120 Hz', () => {
  const sample = fps => {
    const response = createCursorGrainResponse();
    let shift;
    for (let i = 0; i <= fps / 2; i++) shift = response.update({x: 100 + 300 * i / fps, y: 225, r: 20}, i * 1000 / fps);
    const moving = shift[0];
    for (let i = 1; i <= fps / 10; i++) shift = response.update({x: 250, y: 225, r: 20}, 500 + i * 1000 / fps);
    return [moving, shift[0]];
  };
  const reference = sample(120);
  for (const fps of [30, 60]) sample(fps).forEach((value, i) => expect(value).toBeCloseTo(reference[i], 5));
});

test('demo settings cannot overwrite the product defaults or pass invalid shader values', () => {
  expect(normalizeGrainResponse({strength: 0, reach: 2, settleMs: 280})).toEqual({strength: 0, reach: 2, settleMs: 280});
  expect(normalizeGrainResponse({strength: Infinity, reach: NaN, settleMs: undefined})).toEqual(DEFAULT_GRAIN_RESPONSE);
  expect(normalizeGrainResponse({strength: 100, reach: 0, settleMs: -10})).toEqual({strength: 8, reach: 1, settleMs: 40});
  expect(normalizeGrainResponse()).toEqual({strength: 8, reach: 2, settleMs: 340});
});

test('longer return changes only the settling response, not engagement or final restoration', () => {
  const sample = settleMs => {
    const response = createCursorGrainResponse();
    let shift;
    for (let i = 0; i <= 30; i++) shift = response.update({x: 100 + i * 4, y: 225, r: 20}, i * 10, settleMs);
    const moving = shift[0];
    for (let i = 1; i <= 10; i++) shift = response.update({x: 220, y: 225, r: 20}, 300 + i * 10, settleMs);
    const resting = shift[0];
    for (let i = 11; i <= 400; i++) shift = response.update({x: 220, y: 225, r: 20}, 300 + i * 10, settleMs);
    return {moving, resting, end: [...shift]};
  };
  const fast = sample(85), slow = sample(400);
  expect(slow.moving).toBe(fast.moving);
  expect(slow.resting).toBeGreaterThan(fast.resting * 2);
  expect(fast.end).toEqual([0, 0]);
  expect(slow.end).toEqual([0, 0]);
});
