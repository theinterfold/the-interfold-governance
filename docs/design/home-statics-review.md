# Homepage static artwork review — 28 September 2026

## Current experiment: three vector-dot loops

The user requested the original compositions as independent vector dots and a
first loop on Get FOLD, then loops for the other two cards. All three load their
`*-dots.svg` exports and progressively animate the same circle coordinates.
The dense shadows are formed by overlapping dots, rather than a bitmap
underlay. Source originals and the edited no-shadow stack remain untouched.

The user found the initial dots too large and the loops too subtle. The current
export halves the dot spacing/radius and samples at the source's full resolution
with much less smoothing. Concentric water waves now take six seconds with more
amplitude, keeping the mound still. Govern's angular current takes ten seconds,
also with more amplitude, while preserving the circular openings.

The user then found the stepped motion robotic and the dots unsmooth. Voting
power now rises continuously, with a little difference in speed, lateral drift
and tilt between sheets. Sheets still advance one position per 2.4 seconds on
average, joining the fixed top as a new sheet appears below; a slower tide gives
the full flow a twelve-second loop. The original top is retained; complete thin lower
faces are reconstructed in points so movement reveals actual surfaces instead
of stretching dark image strips. Transparent occlusion preserves their overlap.
The previous opening/settling and held-step motions are superseded. Water now
uses two continually travelling swells, and Govern's flow has staggered spatial
phases rather than one shared reversal. Neighbouring points stay coherent.

The user clarified that they wanted actual vector output. The former WebGL
renderer is replaced by inline SVG: fine circular arc geometry, native SVG
animations and vector masks, with no animated bitmap or canvas.

The first native SVG trial used spatial tiles and the user spotted rectangular
seams. It is superseded by interleaved motion cohorts: water-wave phases, eight
particle phases per sheet, and fine radial phases for Govern. This preserves
all 217,223 source circles while reducing animation elements from 4,777 to 956.
Compact coordinate files reduce their combined payload from 5.2 MB to 2.0 MB
before HTTP compression; the static poster files are additional. Offline frames
show continuous sheets without rectangular cuts. Full browser CPU/FPS, including
mobile, has not been measured; do not equate fewer animations with a verified
frame-rate guarantee.

The user explicitly clarified that there must be no white gaps between sheets.
Expanded occlusion masks were removed. A slight inset now allows the adjoining
point surfaces to overlap, covering the earlier motion/antialias seams as well.
The same contour is shared by the native SVG loop and its static poster.

Each card has a pause control outside its navigation link. Reduced motion and
loading failures keep the static SVG. Native SVG clocks pause offscreen and in
hidden tabs. Geometry remains vector at every display size.

Image assignments remain Get FOLD / mound, Voting power / sheets, and Govern /
circles. Their metaphors were discussed, but no swap has been selected. Among
the fourteen later references, the extruded symbol was suggested for Get FOLD,
image 8's thin sheets for Voting power and image 12's network for Govern. These
remain candidates, not approved replacements.

## Approved card layout and preceding bitmap treatment

The user found the dark family too dark and requested a return to the original
images, evaluated directly on the homepage. The preceding bitmap version used `get-fold.webp`,
`activate-voting-power-no-shadow.webp` and `govern.webp`, desaturated together in CSS at their
original 900 × 678 aspect ratio. Their texture and shadows remain intact, without
an overlay gradient. The cards now have a 1px Interfold Black contour, the shared
corner radius, no step numbers or top rules, and white copy surfaces. Titles use
the same 24px Gramercy role, with underlines and always-visible arrows from the
main homepage; descriptions share the 14px Inter body role. Arrows roll only on
hover or focus, respecting reduced motion. That stage preceded the current first-loop experiment.

The `activate-voting-power-no-shadow.webp` edit removes the cast ground shadow
under the original stack. Original source is preserved as
`activate-voting-power.webp`. Built-in ImageGen source:
`exec-785a7d4e-546f-400d-8325-73a446e671a5.png`, under the generated-images directory below.
Edit instruction: remove only the soft ground shadow and restore the pale mint
background; preserve the sheet count, top mounds, stipple, perspective, framing
and dark sheet faces. Exported to 900 × 678 WebP for the page. The user's proposed
next phase is vector dots based on these compositions, followed by loops.

## Earlier dark artwork studies

The versions below are preserved for comparison; they are not used on the page.
Their review states record the earlier individual approvals before the user
rejected the combined dark treatment.

| Card | Asset in `app/public/images` | Review state |
| --- | --- | --- |
| Get FOLD | `get-fold-dark.webp` | Approved |
| Activate voting power | `activate-voting-power-dark.webp` | Approved: the user's attached version, with its lower sheets slightly darker |
| Govern | `govern-dark.webp` | Current proposal: pale mass, dark circular openings; ready to compare with the approved pair |

Images are 900 × 675 WebP exports. Existing original WebPs and earlier pointillism
exports are preserved. These are bitmap edits made with the built-in ImageGen
tool, not exports from the procedural Pontilhismo converter.

## Selected sources and edit instructions

Generated source files are retained under
`/Users/tiagosantos/.codex/generated_images/01a0c624-fdeb-7893-a239-b810ed14998e/`.

- Get FOLD: `exec-af69b611-d78f-4540-90be-a836344e2151.png`.
  Preserve the original asymmetric mound; use neutral grey grazing light on
  charcoal, quiet continuous shadows and fine stipple at the tonal transitions.
- Activate voting power: `exec-7466dbf8-88aa-454d-bb75-423f12703f1b.png`.
  The final edit target was the specific image attached by the user. Darken only
  the lower paper-thin sheets modestly (about 20%); preserve that attachment's
  sheet count, geometry, pale top, mounds, framing and grain. This supersedes the
  earlier inverted-colour and extra-sheet experiments.
- Govern: `exec-9a4d6631-4225-4ebf-9cbf-d4b0c9ec2056.png`.
  Translate the original into a monochrome negative: mint paper and circular
  openings become charcoal; the dark stippled mass becomes pale grey. Preserve
  the original graphic silhouette, fine density transitions and arrangement of
  openings, without adding a glossy 3D sphere or a background gradient.

The current comparison is the thread's `home-statics-comparison.html`; its revised
set contains exactly the three assets above.

## Visual consistency — subsequent review

The user found the three images inconsistent as a family. Keep the earlier
selections for comparison; the following are new proposals, not replacements
already applied to the homepage.

- The approved mound (`get-fold-dark.webp`) stays unchanged as the style reference.
- `activate-voting-power-family.webp`: the selected thin-sheet geometry with a
  quieter mid-grey top, restrained highlights and dark lower sheets.
  Generated source: `exec-2bf66b35-1d17-4150-b4e5-85a78a67a9fb.png`.
- `govern-family.webp`: dark circular openings retained, with the near-white mass
  reduced to shaded middle greys and fine stipple to match the mound.
  Generated source: `exec-a31a4eb1-855e-4afa-8d55-1bf0cb64a2cc.png`.

Both refinements were made with built-in ImageGen, supplying the mound as an
explicit style reference alongside each edit target. Direction: match its fine
stipple scale, quiet deep shadows and restrained highlights; preserve subject
geometry, neutral charcoal background and thin planes; avoid broad white areas,
glossy 3D materials and background gradients. The lower sheets remain dark and
the circular openings remain negative spaces.

The comparison `home-family-comparison.html` has Original, Previous set and New
test views. These are still static illustrations; loops remain deferred.
