# Govern hero — approved working reference

Tiago approved the overall direction on 2026-09-30 at 01:41 with **Order 0.73**, playback paused for inspection: “estamos muito perto do que é suposto”. Preserve this as the baseline for subsequent refinements.

Approved: the wide centered Govern composition, moving negative-space circles and paired metaball merges, dark center, broad density gradient, and visible grain spacing. Keep the established site colors and typography.

Requested narrow refinements: outer black grains should not look larger than inner grains; soften the artificially uniform fine-grain halo around the circular vacancies. Do not replace the vacancies with white disks, fade/resample grains during motion, or undo the spacing control.

Exact pre-refinement source, prototype and supplied screenshots are preserved at:

`/Users/tiagosantos/.codex/visualizations/2026/09/29/01a0edae-8628-7dc3-b365-0863b6bb19ff/approved-2026-09-30-0141-order-073`

The manifest records source checksums and the approved viewing controls. These controls describe the reviewed frame, not a requirement to disable animation by default.

## First refinement after this checkpoint

Outer size outliers are reduced smoothly with Order, using each grain’s fixed home density; the center has no size correction. Boundary grains now have a small stable spread in resting clearance (up to half their local pitch) instead of all collecting at one radius. Population, opacity and movement remain continuous.

Verified against the actual rendered grain geometry: no overlaps at Order 1 in paused and animated samples, all 119,438 grains retained and opaque, Order 0 exact, paused controls settle. Type checking and diff whitespace checks pass. At Order 0.73, exterior 99th-percentile radius decreased from 1.210 to 0.985 CSS pixels at the 1200px test width; core stayed at 1.039.

## Reference calibration after further feedback

The supplied mint guide is the same drawing as `app/public/images/govern.webp`. The source point export re-samples that stippled image: its outer band contains about 4.25 times as many grains as the guide, with median radius 0.428px versus 0.798px at a 900px image width. The previous 119k-grain treatment therefore produced an overly fine texture.

The current renderer selects one stable source-cell quadrant per 2×2 block, doubles its radii to preserve ink area, and retains the approved transport and background supply. This selection happens once at creation: visible grains never appear/disappear during motion. Order arranges centers first and opens radius gaps cubically, with strict non-overlap still at 1. The initial UI value is the approved 0.73.

A material-warp transport trial was rejected because it introduced visible lighter patches; its files are preserved separately in the task visualization directory. The original approved checkpoint remains untouched. The current implementation is an animated interpretation, not a pixel-identical tracing of the guide.

## Current state after rejected calibration

The larger-grain calibration was rejected in the 02:20 feedback: oversized dots and rough circular edges moved further from the guide. The exact approved 01:41 renderer, spacing and radii have been restored from `approved-2026-09-30-0141-order-073`. The later calibration is preserved separately under `guide-calibration-trial`. UI Order defaults to 0.73. Do not treat the rejected quarter-population/cubic-radius treatment as current. Further visual experiments should be compared to the guide at a matched drawing scale before replacing this baseline.


## Separate guide reconstruction study

The next experiment is isolated at `http://127.0.0.1:60964/study`, backed by `govern-guide-comparison.html` in the task visualization directory. The approved renderer and main prototype remain unchanged. The comparison renders the supplied high-resolution guide and reconstructed grains at the same scale and in the site’s ink/paper colors.

The selected reconstruction contains 120,906 stable grains traced from original ink geometry, including source-supported residual fill in the middle/core. It avoids the old restippling, random core clones and radial hole-fill accumulation. Analytic coverage measured against the same guide regions: core 0.9728 versus 0.9753; transition 0.3944 versus 0.4614; outer 0.0731 versus 0.0791. The core now matches closely; the transition remains somewhat lighter. These measurements supplement visual comparison, not replace it.

Movement uses a continuous material field with constant grain radii and population. A nearest-circle branch was rejected after its seam opened a visible white crack. The replacement blends influences continuously and limits local deformation. The isolated study uses moderate drift; it does not yet contain the existing Order interaction or new metaball merge choreography. Do not replace the full live hero with this study silently.

The self-contained comparison, generation sources, chosen point cloud, motion helper and manifest are preserved under `guide-reconstruction-2026-09-30` in the task visualization directory.

## Movement and metaballs on the reconstructed texture

Tiago then explicitly requested movement and metaballs in the local `/study` version. That study now combines stronger continuous drift with two asynchronous fusion cycles, using the two touching pairs already present in the guide. The lower-right pair fully separates into two circular vacancies and merges into a larger round vacancy. The left pair rounds into one larger vacancy and returns to its original connected shape; fully splitting that pair distorted its outline, so the clean radial treatment is retained there. All 120,906 grains retain their identity and fixed radius; there are no painted white disks, particle births, or animated opacity masks.

The pair motion transports the existing material within a bounded neighborhood. Material area is preserved through the active interior; an outer blend makes displacement vanish smoothly before the neighboring circles. That blend is an approximation, so the claim is preservation of the drawing's visual density, not exact incompressibility everywhere. Empty-disc fits measured from the recovered grains prevent the rough earlier circle metadata from producing notches during separation.

The accepted static reconstruction checkpoint remains unchanged. The animated study and its generation sources are preserved separately under `guide-reconstruction-motion-2026-09-30`. Main hero, Order control, and online demo are unchanged by this isolated motion update.

## Faster motion and subpixel grain rendering

Tiago approved the reconstructed grains (“esses estão óptimos”) and requested stronger motion and a more vector-like appearance. The local study now advances the fusion timeline at 2.6× its previous rate; coherent drift advances at another 1.4×, for 3.64× overall. Amplitudes, grain geometry and density are unchanged. The pre-change version is retained under `approved-grain-before-faster-motion`.

Each grain is now an analytic circle on an instanced quad rather than a point sprite. Quad centers retain subpixel coordinates; round coverage is evaluated at the current screen resolution, including the study's 1×/2×/3× magnification. The canvas draws at least two physical pixels per CSS pixel. This remains a GPU canvas rendering of geometric circles, not an SVG document; only the comparison guide is an embedded raster image.

Verified the loaded study, pause/resume and 3× magnification. The 120,906 grains retain their radii and identity, with no invalid positions in the accelerated motion audit. This update remains local.

## Individual grains and moving vacancies

The faster coherent drift was rejected as looking like Photoshop Liquify. Tiago clarified that the circles which must retain their geometry and size are the small black grains. The local study now gives those grains individual bounded trajectories, keeps every radius constant and draws each as an analytic circle. Travel is limited by the original local density; the first independent-motion trial dispersed the middle too much and left dark collars, so its amplitude was reduced in dense material. The renderer remains geometric GPU drawing, not an SVG document or a warped bitmap.

The subsequent request also identified the 28 white vacancies which were still stationary. They now have separate translation cycles, alongside the two existing fusion pairs. Compact return flow moves the surrounding grains with each vacancy. Its broad transition reduces the concentration ring; neighboring translations fade away before the fusion source contours to avoid tearing the metaball edges. This transport uses an approximation and does not guarantee exact density preservation at every pixel.

The accelerated 80-second audit retains all 120,906 grains with constant radii, finite positions and a maximum movement of 0.245 world units per 60 Hz frame. A separate 45-second audit confirms movement of all 28 separate vacancies. The browser was inspected at normal scale and 3×, with no runtime errors. The current sources, self-contained comparison and checks are preserved under `guide-independent-particles-2026-09-30` in the task visualization directory; previous approved checkpoints remain available. These changes are only on the local `/study` page, not the main hero or online demo.


## Approved separated grains and the subsequent line correction

At 12:54 Tiago approved the local study as “muito perto do perfeito”, using **Grãos separados**. Preserve the exact pre-fix checkpoint `approved-2026-09-30-1254-separated-grains` in the task visualization directory. This view uses the same 120,906 recovered grains at a fixed 0.65 radius multiplier. Its lighter center is part of this newly approved appearance; do not silently restore the older dense treatment. The approval asks only to remove temporary dark lines created by grain crowding during movement.

The black grains exchange places locally in size-matched pairs, retaining their individual radii. All 28 separate vacancies move, alongside the existing two fusion cycles. The original problem came from adding overlapping transport offsets: between nearby vacancies, this could fold the point distribution into dark creases. The refinement composes the local flow maps, applies vacancy transport to the fused positions, then adds the small grain exchanges without amplifying them through the flow. The fusion boundary uses a stream-function transition with its derivative instead of multiplying displacement by a fade.

The refined source and self-contained study are preserved under `guide-grains-no-folds-2026-09-30`. The checkpoint name describes the targeted artifact, not a proof of exact global incompressibility or zero overlaps: spatial interpolation and the exterior fusion blend remain approximations. The accelerated 80-second sampled audit retains every grain, keeps radii fixed within Float32 precision, and finds finite positions with a maximum 60 Hz step of 0.328 world units. Browser inspection includes the full drawing and 2× magnification. This update is local to `/study`; the online demo is unchanged.


## Continuous tempo after the 14:43 recording

Tiago identified nearly stationary black grains beside rapidly moving ones. The supplied 5.37-second recording was inspected at separated times and in six consecutive 30 Hz frames around the lower-right fusion pair. The study now uses continuous bounded grain orbits, including grains without a partner; angular speed is chosen from travel distance rather than using an oscillation that repeatedly stops. Close safe pairs rotate together; longer pairs translate together by a small bounded offset. Radii, population, colors and the approved 0.65 display scale are unchanged.

Vacancy frequency is normalized by excursion distance to bring their peak translation speeds closer. The two fusion clocks run at 0.55 of the previous rate, retaining their existing shape paths. This deliberately reduces local speed peaks while giving the surrounding grain a continuous base motion. It does not claim identical velocity for all grains or eliminate every instantaneous cancellation.

A 60-second sampled audit compares each eighth grain to its nearest source neighbor. Strong speed contrast (faster neighbor above 1.5 world units/s and more than six times the slower one) falls from 1.235% to 0.307% of sampled pairs. Grains moving below 0.12 world units/s fall from 4.234% to 0.756%; the 95th-percentile speed falls from 3.968 to 1.712. The separate 80-second continuity audit passes with all 120,906 radii retained and maximum 60 Hz displacement 0.173 world units. These are numerical checks, not a claim of final visual approval.

The local study and source checkpoint are `guide-continuous-grain-tempo-2026-09-30` in the task visualization directory. The preceding approved texture and line-correction checkpoints remain intact. No online deployment was made.


## Approved tempo and live motion controls

Tiago approved the continuous-tempo study (“esta versão está muito boa”) and asked for more visible movement of the white vacancies plus live sliders. The exact accepted source is now preserved separately under `approved-2026-09-30-continuous-tempo`; do not overwrite that checkpoint.

The local study has four native range controls above the artwork: white-vacancy speed (0–3×), vacancy excursion (0–100% of the accepted safe path), metaball speed (0–3×), and black-grain speed (0–2×). The new initial settings are 1.80×, 100%, 1.50× and 1.00× respectively. “Versão aprovada” restores all four parameters to 1 without resetting the animation phase. Pause and initial-position comparison remain available. Independent accumulated clocks prevent phase jumps when speed changes; excursion eases smoothly during playback. Settings are saved through the visualization state interface.

The renderer still uses the accepted grain population, fixed radii and 0.65 display scale. A numerical check compares the approved control settings to the saved renderer at three times and finds identical output. Each independent control changes its intended motion, with fixed radii and finite positions. All four sliders and the approved reset were exercised through the browser, and the loaded page reports no runtime errors. The new source and screenshot are saved under `guide-live-motion-controls-2026-09-30`. This update is local to `/study`.


## Rejected neighbor-motion experiments and rollback after 15:53

Tiago reproduced fast grains beside stationary neighbors at space speed 3×, excursion 100%, metaballs 3× and grain speed 0×, then supplied a second recording explicitly rejecting the first attempted correction. Treat this combination as valid; do not blame the slider values or raise the grain slider to hide a transport defect.

The 15:38 clip was inspected at separated times and in consecutive 30 Hz crops. A dynamic-neighbor audit confirmed discontinuities around the lower-right pair. The material-CDF implementation moves columns when a moving circle tip reaches them, while adjacent columns remain nearly stationary; the hard square-root cross-section has a steep onset. Adding a shared carry and smoothing that cross-section improved aggregate speed figures but was visually rejected: the 15:53 clip still shows patterned waves and distorted edges. Both changes were removed.

A second, isolated shared-field experiment also retained visible artifacts near the fusion tips and was not promoted. All trial sources and audits are preserved under `rejected-neighbor-motion-2026-09-30`; neither is an approved direction. The live `/study` fragment has been byte-verified against `guide-live-motion-controls-2026-09-30`, with the user's 3× / 100% / 3× / 0× values retained in the browser. **The neighbor-motion problem remains unresolved.** Keep the original approved checkpoints intact and do not present lower numerical speed contrasts alone as a visual fix. No online deployment was made.


## Local correction to neighboring motion after renewed request

Tiago explicitly asked to continue solving the problem. The local study now removes the lower-right column-CDF transport and uses the continuous area-preserving radial fusion already used on the left, with measured source-circle fits. This removes the square-root column onset responsible for abrupt relative motion. **Behavioral tradeoff:** the right pair now rounds into a merged vacancy and returns to the original connected two-lobe silhouette; it no longer fully disconnects. Do not describe this as a complete split/merge replacement or as user-approved.

A separate real eligibility bug was found in ordinary vacancy motion: a source-position list omitted some grains carried into a flow by earlier composed maps. Selection now uses current positions and updates spatial bucket membership after each map. It produces exactly the same Float32 output as checking every grain across 101 sampled times over 50 seconds. Tight gaps have less excursion and less return-flow amplification. The renderer, population, grain radii, and 0.65 display scale remain unchanged. A zero grain clock now skips its exactly zero orbit contribution.

At the user's 3× / 100% / 3× / 0× values, the dynamic-neighbor audit finds the worst adjacent velocity difference reduced from 30.98 to 4.08 world units/s and sharp fast/still adjacency from 0.121% to 0.00466%. All 120,906 points retain their radii, with finite positions; frozen motion clocks return exactly unchanged output. Current-position buckets reduce full CPU sample time from 34.81 to 20.89 ms before the additional zero-clock shortcut. These figures support the correction but do not establish final visual approval.

The local browser was reopened after the preview process stopped, and the controls restored the user's exact values. The loaded page and artwork were inspected. Sources, audit and screenshots are saved under `guide-continuous-neighbors-2026-09-30`; all earlier approved checkpoints remain intact. This update is confined to `/study`; no online deployment was made.


## Side-by-side motion gallery after the 17:16 recording

The new local `/compare` page preserves five real source checkpoints and adds one separate, unapproved experiment: **Movimento distribuído**. The current `/study`, homepage and online demo are unchanged. Sources, manifest, checksums and verification files are in `govern-motion-gallery` inside the task visualization directory. Historical adapters retain each original clock cadence. All six use the same 120,906 source grains and the accepted 0.65 display radius for a comparable texture.

The supplied recording shows static interior fingerprints beside moving return-flow channels. In the new experiment, a continuous material circulation runs across the whole source field and along vacancy boundaries. Both connected pairs share their boundary stream-function constant to prevent internal jets. Fusion is sampled at the moving grain coordinates; vacancy transport then follows. Grain centers move and every radius remains fixed: there are no bitmap warps, painted white discs, fade substitutions or new grains.

Controls include common black-dot size, drawing scale and overall speed, plus per-model dot size and speed. The current and candidate models also expose vacancy speed, excursion, fusion speed and grain speed; the candidate adds grain travel. Historical models retain their original coupled clocks. White-hole size is deliberately not exposed: changing radii alone breaks the recovered geometry, and an independent size control requires coordinated material transport.

A 50-second candidate audit at the reported 3× / 100% / 3× / 0× combination finds about 1.075% of sampled grains nearly stationary (baseline around 25.6%), a maximum 60 Hz displacement of 0.276 world units, fixed radii and finite coordinates. These are diagnostic measurements, not visual approval. Candidate renders at 0, 1, 5 and 10 seconds were inspected for new halos or streaks. The gallery uses background workers and only animates visible models to keep the controls responsive; the more recent models may take roughly 20 seconds to initialize.


## Approved Leve preset for the shared demo — 2 October 2026

The user approved publishing the Leve configuration from the local `unified-live` comparison. The homepage uses 60,000 persistent circular grains, with the selected source radii fixed over time. Its fixed Mais movimento preset uses white size 1, vacancy/fusion speed 1.7, travel 1.6, fusion amount 1 and grain speed 1 on the existing 2.6 clock. White spaces remain particle absence in one common implicit field; every approaching hole can participate in a fusion.

The demo exposes Play/Pause only. The comparison page retains the experimental sliders; heavier white-size combinations are not exposed on the homepage. The component keeps its layout, reduced-motion behavior, visibility suspension and static artwork fallback. The numerical model runs in a worker with WebGPU where available, f64 WASM pressure and CPU fallbacks. The renderer interpolates the existing point identities.

Runtime modules are vendored under `app/public/govern-light/free-fusion-d447153622113473/`, with source hashes in `manifest.json`. The gallery remains separate. The release is prepared from the exact previous published source snapshot (build `O0OVYhFaldwqjsWncTt45`), applying only the hero component, its slider-only CSS removal, renderer and runtime assets. This avoids bundling unrelated pending interface work. Publication and verification details are recorded in the task's `govern-recovery/deployment/` directory.


## Fusion rim correction — 2026-10-03

The published demo now uses `fusion-rim-91c681baa3f75a44`, preserving the approved Leve preset (60,000 persistent circles, white size 1, travel 1.6, vacancy/fusion speed 1.7, grain speed 1, clock 2.6). Local comparison sliders remain available.

The former escape routing could concentrate points when a small black pocket closed between white spaces. The replacement transports displaced material collectively, measures residual particle mass after the other movements, and finishes evacuation just before the predicted seal. Its density support includes numerical cell coverage; it introduces no rigid boundary or painted white overlay. Forecast work is incremental and uses an exact WASM pressure solver. Public frames use exact simulation boundaries with a 16-frame interpolation buffer.

Validation: the actual browser model ran through 510 model seconds without persistent trapped groups, including the historical 505-second case. The CPU fallback ran through 75 seconds with no intrusion events. Point identities and radii remained fixed. Isolated subpixel contacts and small incursions from linear interpolation of fast curved paths remain documented in the task evidence; the interpolation path is separate from the corrected persistent rim. Performance figures are specific to the tested machine.

The release was applied to the latest published static deployment, preserving its other assets and page content. Deployment: `dpl_BreTvxnB9ydAowwY2qSrQ3DMqJdH`.

## Point entrance — 2026-10-03

The user requested removal of the static image shown before the live artwork. The hero now reserves its existing layout with a transparent canvas, and reveals the actual circles after initialization. There is no SVG or bitmap placeholder in either the server HTML or the React component.

Runtime `entrance-7677b27dd48692df` retains the exact simulation and Leve preset from `fusion-rim-91c681baa3f75a44`. Each point has a deterministic, spatially dispersed appearance delay across a 1.2-second entrance, followed by a 180 ms opacity fade. Point centers and radii are unchanged. A single GPU uniform advances the entrance; it does not add per-frame particle work on the main thread. All circles remain fully visible after the entrance. The 180 ms point fade follows the existing short content entrance timing; this artwork sequence does not change shared interface motion tokens.

Reduced motion draws the complete actual point frame immediately when ready. Offscreen suspension and Play/Pause retain their current elapsed time; resize does not restart the entrance. Recovery while paused draws the full frame. The approved pre-change files are backed up in the task's `qa/entrance-2026-10-03/before/` directory.

The WebGL check confirmed a transparent first frame, increasing point visibility, unchanged input coordinates/radii, and pixel equality with the previous renderer at full visibility. The local and published pages loaded without artwork images or console errors. Published as `dpl_57DL6ektSytS4UzcLB2bjyB5tn6U`; the public canvas confirms Leve, 60,000 points and white size 1. The existing simulation was preserved byte for byte; its longer numerical validation was not repeated for this entrance-only change.

### Local trial: enter already moving, with the text's rise

At the user's request, `entrance-moving-439a65ba9b0355bf` prepares the worker through model time 1.9 before revealing the canvas. Playback begins at model time 0.5, after the initial geometry transition; the existing 16-frame buffer already contains the surrounding frames. This removes the stationary start caused by filling the display buffer during the reveal. The 1.2-second point sequence is unchanged.

The canvas also rises 16 CSS pixels over 600 ms with `cubic-bezier(0.22,1,0.36,1)`, matching the existing ScrollFadeIn/LineReveal. That one-time transform follows the same visible elapsed clock, so pausing or leaving the page keeps the entrance synchronized. Reduced motion bypasses both warmup and rise. Simulation files and the point renderer are unchanged. This trial is available at `http://127.0.0.1:60966/`; the loaded canvas confirmed the new revision, 60,000 points, full reveal and no remaining transform or console error.

The user approved this entrance for the shared demo. Published unchanged as `dpl_vhxWEQ3jVo1R4nA4ynUKi6j5wmrK`, aliased to `https://interfold-governance-review.vercel.app/`, on 3 October 2026.

### Shorter point entrance (2026-10-09)

The user asked for a shorter entrance. The points now appear over 600 ms instead of 1.2 s. The points and the 16 px canvas rise now end at the same time. The text above the artwork uses the same 600 ms entrance.

The appearance delays now spread across 510 ms, and each point fades in over 90 ms instead of 180 ms. The fade is shorter because the renderer scales the delays and the fade with the entrance duration. Point positions, radii, the simulation and reduced motion do not change.

Only `ENTRANCE_DURATION` in `app/utils/governHeroRenderer.js` changes. The runtime files of `entrance-moving-439a65ba9b0355bf` and their `manifest.json` hashes do not change. Thus the `host.js` copy in that directory keeps the approved 1.2 s value.
