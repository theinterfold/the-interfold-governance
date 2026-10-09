import { describe, expect, test } from "bun:test";
import { buildPointLoopLayers, decodePointCoordinates, POINT_STRIDE, sheetPose, type PointIllustrationName } from "../utils/pointLoop";

describe("Homepage vector loops", () => {
  test("preserves every authored dot with a bounded number of transform-only animations", async () => {
    let animatedLayers = 0;
    for (const image of ["get-fold", "activate-voting-power", "govern"] as PointIllustrationName[]) {
      const buffer = await Bun.file(new URL(`../public/images/${image}-dots.points`, import.meta.url)).arrayBuffer();
      const points = decodePointCoordinates(buffer);
      const flatten = (layers: ReturnType<typeof buildPointLoopLayers>): ReturnType<typeof buildPointLoopLayers> =>
        layers.flatMap((layer) => [layer, ...flatten(layer.children ?? [])]);
      const layers = flatten(buildPointLoopLayers(points, image));
      // The sheet is instanced five times; count its identical geometry once.
      const uniqueGeometry = [...new Set(layers.map((layer) => layer.markup))].join("");
      expect((uniqueGeometry.match(/M/g) ?? []).length).toBe(points.length / POINT_STRIDE);
      expect(uniqueGeometry).not.toMatch(/<(?:mask|filter|image|animate|animateTransform)\b/);
      for (const layer of layers) {
        expect(layer.bounds.every(Number.isFinite)).toBe(true);
        expect(layer.bounds[2]).toBeGreaterThan(0);
        expect(layer.bounds[3]).toBeGreaterThan(0);
        if (!layer.frames) continue;
        animatedLayers++;
        expect(layer.frames[0].offset).toBe(0);
        expect(layer.frames.at(-1)!.offset).toBe(1);
        for (const frame of layer.frames) {
          expect(Object.keys(frame).sort()).toEqual(["offset", "opacity", "transform"]);
          expect(frame.transform).not.toMatch(/NaN|Infinity/);
          expect(frame.opacity).toBeGreaterThanOrEqual(0);
          expect(frame.opacity).toBeLessThanOrEqual(1);
        }
        if (image !== "activate-voting-power") expect(layer.frames[0].transform).toBe(layer.frames.at(-1)!.transform);
      }
    }
    expect(animatedLayers).toBeLessThanOrEqual(96);
  });

  test("a sheet wraps only while invisible and travels from below into the top", () => {
    for (let layer = 0; layer < 5; layer++) {
      expect(sheetPose(0, layer).opacity).toBe(0);
      expect(sheetPose(1, layer).opacity).toBe(0);
      expect(sheetPose(.1, layer).y!).toBeGreaterThan(sheetPose(.9, layer).y!);
      expect(sheetPose(.5, layer).opacity).toBe(1);
    }
  });
});
