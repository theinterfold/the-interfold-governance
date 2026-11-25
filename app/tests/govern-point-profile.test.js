import {expect, test} from 'bun:test';
import {thinInterior} from '../motion/govern/point-selection.js';

test('an optional smaller point profile is a deterministic subset with unchanged order and radii', () => {
  const points = [];
  for (let y = 0; y < 450; y += 7) for (let x = 0; x < 600; x += 7)
    points.push([x, y, Math.fround(.2 + (x + y) % 13 / 100)]);
  const full = thinInterior(points), reduced = thinInterior(points, [], .8);
  expect(thinInterior(points, [], 1)).toEqual(full);
  expect(reduced).toEqual(thinInterior(points, [], .8));
  expect(reduced.length).toBe(Math.round(full.length * .8));
  let sourceIndex = -1;
  for (const point of reduced) {
    const next = full.indexOf(point, sourceIndex + 1);
    expect(next).toBeGreaterThan(sourceIndex);
    sourceIndex = next;
  }
  const smaller = new Set(thinInterior(points, [], .6));
  expect([...smaller].every(point => reduced.includes(point))).toBe(true);
});

test('invalid build profiles cannot silently produce an empty or enlarged artwork', () => {
  for (const fraction of [0, -.2, 1.01, NaN, Infinity])
    expect(() => thinInterior([[0, 0, .3]], [], fraction)).toThrow(RangeError);
});
