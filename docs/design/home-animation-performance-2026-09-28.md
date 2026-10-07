# Homepage animation measurements — 28 September 2026

## Chrome result

**The animation workload is a substantial cause of the observed slowdown.** In a paired Chrome recording with the Mac connected to power, pausing all three loops reduced renderer main-thread task occupancy from **97.56% to 0.014%**. With the loops running, Chrome delivered approximately **14.45 drawn frames per second**, with **289 tasks over 50 ms in 20 seconds**; paused, there were no tasks over 50 ms.

The initial recording near the reported 3% battery state delivered about 5 FPS. Its power state changed around the recording, so it is not a controlled battery benchmark. The later plugged-in result is faster, but still visibly below a smooth animation rate. The paired running/paused recordings establish that connecting power alone did not resolve the animation cost.

No application behaviour or animation assets were changed. All three playback controls were returned to running, the original DevTools screenshot setting and docking side were restored, and DevTools was closed afterwards.

## Chrome method and measured results

Recorded the existing Chrome tab at `http://127.0.0.1:3100/`, with all three illustrations fully visible at approximately 335 CSS pixels wide per card. Page viewport was 1488 × 703 CSS pixels, host DPR 2, with DevTools docked below. No page reload or scroll occurred between conditions. CPU and network throttling were off; screenshots and memory capture were off. The user confirmed the Mac was connected to power, and Chrome no longer showed its Energy Saver toolbar indicator. Other applications, extensions and background tabs were left unchanged.

Running recording duration: 46.117 s. Paused recording duration: 67.397 s. To exclude recorder startup and compare equal durations, all values below use **seconds 5–25 of each trace**. Only the renderer process identified for the homepage was counted (PID 73916, main thread 6830873).

| Metric, matched 20-second window | All three loops running | All three loops paused |
| --- | ---: | ---: |
| Drawn frames | 289 | 0 — static page, expected |
| Drawn frames per second | 14.45 | Not applicable |
| Median / p95 interval between drawn frames | 68.43 / 75.63 ms | Not applicable |
| Renderer main-thread task wall time | 19.512 s | 0.0027 s |
| Main-thread task occupancy | 97.56% | 0.014% |
| Main-thread task CPU time | 3.143 s | 0.0023 s |
| Main-thread task CPU, fraction of one core | 15.72% | 0.011% |
| Tasks lasting over 50 ms | 289 | 0 |
| Longest task overlapping the window | 84.18 ms | 0.221 ms |

Task occupancy is elapsed wall time inside `RunTask`, **not total CPU utilisation**. CPU time uses each event's `tdur`; partially overlapping boundary tasks are clipped, with their CPU time apportioned by overlap. The considerable wall/CPU gap can include waits and scheduling and does not identify their cause. These are renderer main-thread metrics, not total browser CPU or GPU utilisation.

Frame counts use renderer `DrawFrame` events. Of 2,590 unique `BeginFrame` identifiers in the running window, 2,301 also had a `DroppedFrame` event (88.84%). This is Chrome's traced scheduling/drop count, not an assumed 60 Hz denominator. Paused FPS is deliberately not treated as a performance failure: an unchanged page has no frames to draw.

Native animation servicing occupied 1,589 ms and `UpdateLayoutTree` 1,375 ms in the active window. These are nested, inclusive event totals and must not be added together. Much of the occupied main-thread wall time remains unattributed in the DevTools summary. The A/B result identifies the loop workload collectively; it does not yet rank the three animations or identify a specific browser-internal bottleneck. DevTools profiling adds overhead, and this is a local development page rather than a production build benchmark.

Local recordings (not committed):

- `~/Downloads/Trace-20260928T134123.json.gz` — first recording, uncertain power transition, 44.544 s total; approximately 5.01 FPS over the complete trace.
- `~/Downloads/Trace-20260928T152307.json.gz` — all loops running, connected to power.
- `~/Downloads/Trace-20260928T152546.json.gz` — all loops paused, connected to power.

## Supplemental offline measurements

## Measured work

Preparation runs the application's actual `decodePointCoordinates` and `buildPointLoopContent` with the existing `.points` files. Seven sequential rounds use Bun on this machine. Inputs are read before timing; file output is outside timing. Measurements include decoding and SVG string construction, but exclude DOM parsing, layout and browser painting. Bun timings are not Chrome/V8 timings.

Fresh SVG parse-and-paint uses Sharp/librsvg with six evenly spaced animation phases per illustration. Native SVG animation values are frozen at each phase, preserving the paths, transforms, instances, opacity and masks. Output is 671 × 505 pixels, approximately the desktop card at DPR 2. Images rotate order between phases. File reads and output encoding are excluded; Sharp cache is off and its concurrency is one. This workload reparses geometry on each sample; Chrome can retain geometry and render caches. **Do not interpret these numbers as browser frame times or convert them into FPS.**

| Illustration | Authored dots | Animation elements | Preparation median (7 samples) | Fresh parse + paint median and range (6 phases) |
| --- | ---: | ---: | ---: | ---: |
| Get FOLD | 79,931 | 640 | 139.9 ms | 552.0 ms (544.8–577.3) |
| Activate voting power | 51,156 | 150 | 81.5 ms | 952.3 ms (935.6–1019.3) |
| Govern | 86,136 | 166 | 135.2 ms | 466.8 ms (457.8–499.7) |

Combined preparation: median **368.6 ms**, range **332.7–377.4 ms**. The first round took 370.4 ms. In the app this construction currently runs on the main thread when visible illustrations load.

The three illustrations contain 217,223 authored circles and 956 animation elements. The moving sheet template is reused across five instances, so authored geometry count understates rendered instances. Static SVG posters plus coordinate files total 11,066,291 bytes before HTTP compression. Runtime SVG strings expand to approximately 15.76 MB; this is generated markup, not another network download.

## Interpretation and possible next work

The stack is the most expensive illustration in the offline fresh-paint workload, despite having fewer authored dots. Moving masks and reused sheets are a plausible contributor. This offline ordering is not a measured per-loop Chrome ranking; the Chrome comparison above measures all three together.

The code includes pausing for offscreen illustrations, hidden documents and the existing user pause controls. The three loops start together when all cards are visible. User pause controls were verified in Chrome by their Play/Pause labels and the resulting trace. Offscreen and hidden-document behaviour was source-inspected, not independently profiled.

The measurement request is complete. A future optimisation pass should preserve the vector-dot appearance while reducing the geometry that must be updated and repainted each frame, then repeat this Chrome comparison. Individual-loop recordings would identify which illustration to prioritise. No optimisation was applied during measurement.

Source SHA-256 (`app/utils/pointLoop.ts`): `89712ab78607eca60fcd71674b784373e18616ad67e19d7550fba7e61cc6213d`.

## Subsequent implementation — no new profiling

The user subsequently requested optimisation and explicitly asked not to record
again. The renderer now uses worker-built inline SVG layers, transform/opacity
Web Animations, tight layer bounds, interruptible DOM insertion and layer ordering
in place of animated sheet masks. The rigid-sheet trial was rejected; the eight
particle cohorts and gathering trajectories were restored in the layer renderer.
All authored dots remain. User pause, offscreen/hidden-tab pause, reduced-motion
posters and abort/unmount cleanup remain in place.

TypeScript, lint, geometry/lifetime checks and live visual/control checks were
performed. **The preceding FPS/CPU figures describe the old renderer. No
post-change performance improvement has been measured.**
