# Homepage vector dots and loops

The homepage currently uses the static SVG posters only, pending further startup
optimization. Its cards do not opt into `animated`, so no point coordinates are
fetched, workers started, live geometry mounted, or loops played. The loop
implementation is retained for later work.

Static exports use `compact-dot-svg.mjs`: round-capped zero-length path segments
preserve each dot's centre and radius at the original 0.01-unit precision. Equal
radii are grouped, reducing 217,223 circle elements to 341 paths and total SVG
source size from 9,111,260 to 2,919,515 bytes. Masks and sheet transforms are
preserved. The artwork remains vector; no points are dropped or rasterized.

`export-dots.mjs` reuses the original Pontilhismo luminance method and
stable noise from `card-particles.mjs`. All three original compositions are
retained, including the no-ground-shadow stack edit. Source-resolution sampling
and a light 0.35px blur preserve the fine grain. Spacing is 0.95 and maximum
radius 0.925 in a 600 × 450 field. Dense circles merge into the dark areas.

The page uses **inline vector SVG layers**. Each authored dot remains a circle
expressed by two SVG arcs. `pointLoop.worker.ts` decodes and groups coordinates
away from the UI thread, then terminates. `pointLoopPlayback.ts` inserts the SVGs
in separate turns and animates their HTML layers using Web Animations transform
and opacity. The browser can composite these layers without updating every SVG
path or repainting animated masks each frame. No raster animation assets, Canvas,
WebGL textures or JavaScript frame repaint loop are used.

The old SMIL renderer had 956 native animation elements and performed poorly in
Chrome; see `docs/design/home-animation-performance-2026-09-28.md`. The replacement
preserves all 217,223 authored dots with a test budget of at most 96 animated layers.
Tight view boxes limit compositing surface dimensions. Browser rendering caches
remain an implementation detail; source and live DOM geometry remain vector.

- Get FOLD: twelve concentric wave phases and two strength groups, with stable
  interleaving; the mound stays still. Six-second cycle.
- Activate voting power: five moving sheets with eight interleaved point cohorts
  each. The original trajectories gather below and settle into the top. A trial
  moving each sheet as one rigid surface was rejected. Twelve-second cycle, new
  sheet every 2.4 seconds. Inset faces use the page background instead of animated
  SVG masks. Depth order updates at a sheet wrap while the points are transparent.
- Govern: twelve interleaved radial groups retain the angular current and circular
  openings. Ten-second cycle.

Posters remain the loading, unsupported-browser and reduced-motion fallback.
The poster element is removed once the live geometry is ready. Preparation is
visibility-gated. Playback pauses for user pause, less than ten percent visibility,
hidden documents and unmount. Cleanup aborts loading, terminates the worker,
cancels animations and clears the sheet-order timer.

The user requested improvements without further profiling. TypeScript, lint,
geometry/lifetime invariants and live Chrome presentation/controls were checked.
No new FPS or CPU result is claimed for this version.

## Geometry files

- `*-dots.svg`: static vector poster, 900 × 678, transparent background.
- `*-dots.bin`: authoring export; six float32 values per point: x, y, radius,
  phase, local variation, motion data.
- `*-dots.points`: the page's compact coordinates, reducing the three live
  coordinate payloads from 5,213,352 to 1,955,031 bytes before HTTP compression.
  Header: ASCII `IFP1`, then little-endian uint32 count. Each nine-byte record is
  uint16 x/100, uint16 y/100, uint16 radius/1000, uint8 phase/256 × 2π,
  uint8 local variation/255, uint8 motion data/255. Maximum quantization is
  0.005 coordinate units and 0.0005 radius units; no dots are discarded.

`PointIllustration` loads only visible artwork. The homepage has no visible pause
buttons; offscreen, hidden-tab and reduced-motion safeguards remain. SVG geometry and percentage transforms scale with the card;
resizing needs no point regeneration.

```sh
SHARP_MODULE=/path/to/node_modules/sharp node scripts/pointillism/export-dots.mjs
```

## Earlier static study

`render-home.mjs` and `*-pointillism.*` are preserved historical exports. They are
not used by the homepage.

Uses the existing `Pontilhismo/card-particles.js` method: luminance field,
three blur passes, deterministic jitter, variable dot size and spatial rejection
to keep looser dots apart and let dense shadows join. The source image only
determines the points; it is not layered underneath the exported illustration.

The copied generator adds an optional `detectCores` argument. It is disabled here:
the original network-card core detector would replace large connected shadows
in these landscapes with oversized circles. No motion simulation is included.

`render-home.mjs` removes the original mint ground from the tonal field and
exports Interfold Black dots on transparency. The original study supplied the
shared page grey underneath. Original WebPs are preserved. SVGs are editable
masters, accompanied by lossless 900 × 675 WebPs. Rebuild with Node and Sharp:

```sh
SHARP_MODULE=/path/to/node_modules/sharp node scripts/pointillism/render-home.mjs
```
