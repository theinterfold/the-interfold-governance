# Shared Interfold header and footer

The canonical source is `Interfold-Website/packages/site-header/src`.
The website imports its compiled `lib`; Governance consumes the identical release
in `app/vendor/site-header`. The vendored package needs no sibling repository at deployment.

Update the source, then run `bun run sync:header` from Interfold-Website. Select the active Governance checkout with `--governance-root PATH`, `INTERFOLD_GOVERNANCE_ROOT`, or `governanceRoot` in the ignored `.interfold-design.local.json` (in that order). Relative paths resolve from the website root. No sibling checkout is chosen implicitly. The destination is validated and logged before writing.

`bun run check:header` rebuilds in memory and compares both distributions without writing; it needs the same destination configuration. `bun run build:header` only builds the website release. Do not edit generated packages in either app.

The block owns header height, gutters, breakpoint, wordmark outlines, symbol,
navigation typography, action spacing and entrance/hover/menu animation.
Applications supply routes, the wallet or network action, and menu state.
Identity markup is rendered inside `SiteHeaderChrome`: use `governance` for
the suffix, `HomeLink` for the router adapter and `brandLinkProps` /
`symbolLinkProps` for the brand-kit context-menu events. Applications must not
recreate the wordmark, symbol, or their animation flags in navbar slots.
`SiteHeaderMenuButton` owns the mobile control in both applications.
Mobile menu entries share `interfold-menu-item` and the same CSS timing;
only their order and destinations vary.

Below 1280px, product headers show the Interfold symbol and the product name.
The Governance wordmark retains its rolling hover and keyboard-focus treatment.
The marketing site uses its existing Interfold wordmark at every width.

Applications may pass an `action` to `SiteHeaderMenuButton` for a control beside
the hamburger. The control stays next to the close button while the menu is open.
If it opens an account dialog, that dialog handles focus and Escape until it closes.

The generated `manifest.json` fingerprints the source, release and folding asset.
Both application builds verify the release. In Governance, the optional ignored
`.interfold-header.local.json` (`websiteRoot`, relative to that file) or
`INTERFOLD_HEADER_SOURCE` also checks against the active canonical checkout;
the review build checks this before copying sources. A stale or edited copy fails
the build instead of silently displaying different chrome. Standalone deployment
verifies the versioned release without requiring a sibling repository.
Governance adds its suffix on the wordmark's existing baseline, retaining its original spacing,
regular weight and upright style. Its approved colour is Fold Green at 65% alpha,
while the main wordmark remains Fold Green. Keyboard focus retains the shared outline.
Alternative treatments are compared locally on Governance’s /design-wordmark page.
No installed Trial font is embedded or referenced.

### Local navbar comparison · 23 October 2026

`SiteHeaderChrome.layout` supports `current`, `lockup`, `compact` and `divided`.
The three lockups place the original symbol and wordmark together on the left,
leave the centre empty and keep navigation on the right. Their geometry,
responsive sizing, colour and focus treatments are shared by both consumers.
The approved product default is `lockup`; the other alternatives remain available in the study.
`?navbarStudy=1&navbarLayout=lockup` opts into the local comparison. Its embedding
review page switches between the actual apps, keeping both mounted, and sends
validated layout messages so the chosen alternative stays identical. Study state
survives navigation only in the named review frames; normal standalone tabs do not
inherit it. Existing menu motion and brand asset interactions remain in their slots.
The active review distribution for this study is `new-chat-8/work/governance-current`;
pass that absolute path with `--governance-root` when syncing from this checkout.
Desktop navigation, mobile menu and footer links share `--site-chrome-hover`, a
dark forest green that keeps text readable on mint and grey backgrounds. Desktop hover and keyboard focus change colour; only the current page has a
persistent underline, using the established entrance animation. Keyboard focus
also retains its outline. Mobile links use
`site-header-menu-link` for that shared treatment and explicit static Gramercy Regular (400) typography; consumers must not override it with their editorial font or generic link weight.

Header and footer share `--site-chrome-width` (1440px including padding) and
`--site-chrome-gutter` (16px, 24px from 768px), restoring the original website
frame. Brand and mobile menu trigger align to this frame in both consumers.
Governance page content keeps `--site-content-width` (1052px) and
`--site-content-gutter` (16px, 32px from 768px).

`SiteFooter` owns the main website's four-column layout, wordmark and typography.
Its default content is Legal/Follow us links and the shared `GhostSignupForm`.
`siteUrl` resolves the default legal links; `Reveal` integrates the main website's
existing entrance animation. `linkGroups` supplies the two columns' application-specific
links, `copyright` supplies the baseline text, and `showUpdates={false}` omits the
newsletter. Governance uses The Interfold, DAO Constitution, Blog and X, without Updates.
Its navbar and footer share `--page-ground-shade` to contrast with the page body.
The footer follows the published homepage's breakpoints: one column below 768px,
four columns from 768px with brand, links and social links on the same top row.
The brand and copyright start in column one; link groups occupy columns three
and four. Wordmark size is 40/64px, with the original -8/-12px first-line hanging
alignment and matching inset on its second line. Do not add a separate tablet
stack or reduce the desktop wordmark until 1024px. Omitting Updates removes only
the newsletter slot, not the shared grid or its 412px desktop minimum height.
Structure always comes from theinterfold.com. Aesthetic changes to header or
footer must be global and synced to both consumers; only background colour may
vary by site. Do not recreate or independently restyle the footer in Governance.

`INTERFOLD_OUTLINE_RATIO` records the official symbol's straight-band thickness
relative to its viewBox. `INTERFOLD_SYMBOL_ASPECT_RATIO` and the shared responsive
`--site-symbol-width` / `--site-symbol-height` tokens determine the mark's actual
rendered width. Companion glyphs use that width times the outline ratio, with
non-scaling strokes, so their larger canvas does not make the lines heavier.
The symbol itself remains the original path.

`BendingChevron` also shares the homepage's two-arm, 200ms animation across
both applications. Pass `open` for a controlled disclosure, or place it directly
inside a native `summary` / Radix trigger, or after a native `select`, to follow
that control's state. Width and stroke can scale without changing the motion.

The separate `motion` entry point shares the main website's `ScrollFadeIn` and
reveal sequencer. It uses the existing Framer Motion runtime (also re-exported by
`motion/react`): 16px upward travel, 600ms duration, cubic-bezier(.22, 1, .36, 1),
with 140ms between blocks in document order. The main site's existing component
imports re-export this implementation; `LineRevealAuto` joins the same queue.
Governance uses it for page introductions, section headings, panels and the
footer's `Reveal` slot. `as` preserves each element's semantics and layout;
`amount="some"` lets a tall panel reveal as soon as it enters the viewport.
Entrances run once per mount, without replaying on data or filter changes.
Reduced motion and keyboard focus reveal content immediately. Queued entrances
are cancelled on unmount, so navigation never waits for the previous page.

`HoverArrowContent` in the same `motion` entry point owns the main website's
hover reveal: the label moves 8px left while the hidden arrow fades/slides in
over 180ms. Consumers supply colours, typography and hover/focus state.
Reduced motion removes travel. Keep it for links that deliberately reveal their
arrow on hover.

`SiteCtaLink` composes that motion with the website's editorial CTA, extracted
from FoldAuctionPage and consumed there and in the Governance hero. Its primary
Signal and secondary soft-green variants share Gramercy 14px, 46/52px height,
6px corners and the contrasting hover/focus arrow. Canonical CSS owns both label
and arrow colour, so consumer utility-class generation cannot hide the arrow.
`as` accepts a router link; external web destinations retain the website's new-tab
behavior. `--site-cta-font` binds the same Gramercy face under the consumer's local
font-family name without changing its typography.
Children may include a leading icon. With `align="start"`, icon and label stay
fixed while the arrow reveals to their right. The default centred mode keeps
the original 8px content travel for buttons.
`arrowGap` optionally sets the visible gap after that content, accounting for its
travel and reduced motion. Compact receipt links use 4px, matching the spacing
of the homepage's underlined links; omitting it preserves the button spacing.

`ArrowSlide`, `ExternalArrowSlide` and `UnderlinedArrowLink` share the main
homepage's other link pattern: a permanent underline and visible arrow, with a
300ms vertical roll on hover or keyboard focus. Reduced motion keeps the arrow
still. Governance homepage cards now compose this pattern to make their links
recognisable before interaction. Both consumers scan the shared source/release
for its utility classes and load the canonical styles.

`useMobileMenuBehavior` shares full-screen menu scroll locking, focus trapping,
Escape dismissal, focus restoration and closing at the desktop breakpoint. Each
site supplies its own menu content and presentation. Header links and wordmarks
use the canonical focus outline. Marketing opening motion and both hamburger
controls respect reduced motion; desktop always renders the canonical SVG wordmark.

### Shared navbar motion · 23 October 2026

SiteHeaderChrome owns the 950ms arrival (160ms delay) and the 450ms staggered
reveals from the original website; neither consumer adds a second entrance.
InterfoldSymbol's optional animated mode reuses the chosen Revezamento v35
from Brand-Motion/interfold-revezamento-ajustado.svg (4.97s reference).
The derived navbar asset retains its discrete samples and masks, rounds path
coordinates to 0.1 units (under 0.004 CSS px here), crops the artboard to the mark,
and uses the existing mint/green palette. The original reference stays untouched.
Both headers currently use mint; the paper faces of this asset match that ground.
On desktop, the symbol folds after the first header entrance in a tab, then returns
to its static path. The mobile header, viewports below 1280px and reduced motion
use the static symbol from the first paint. Resizing to mobile stops a pending or playing fold.
The local comparison can replay both through the validated review bridge; switching
sites preserves the current motion state (manual Replay remains available). Assets distribute through sync:header to both apps.

### Colour and speed comparison · 23 October 2026

The Governance suffix comparison offers Dark, Fold Green, Coral (negative),
Muted, Abstain grey and Signal from DESIGN.md. `navbarColor` and the review
selector persist alongside the layout, including reloads and switching sites.
Colour changes affect only the suffix, including hover/focus. Normal product
URLs use the approved Fold Green at 65%. Choosing a colour in the comparator shows Governance directly.
The symbol now runs at three times the saved speed: 4.97 / 3 = 1.6567 seconds.
All SVG time attributes and the static-path handoff use that duration; geometry,
normalised keyframes and easing remain unchanged. Header entrance and reduced
motion retain their shared behavior in both consumers.

### Terminal folds overlap · 23 October 2026

The two terminal tips now open during the body unfolding, using its easing and
starting at 1.09 / 3 seconds. Both finish with the delayed body half at 4.01 / 3
seconds (1.3367s total), eliminating the previous separate 0.32s final stage.
The body speed and half delay are unchanged. Frames and occlusion masks are
regenerated from the original projector for the overlapping geometry; the
React static-path handoff uses the same shorter duration in both consumers.

### First-visit entrance and softer suffixes · 23 October 2026

The shared header records its first entrance in sessionStorage per variant.
Refreshes and route remounts show the complete navbar and static symbol immediately.
Desktop/mobile instances coordinate their own symbol through the shared entrance runtime;
React Strict Mode retains the same first-visit decision and timeline. Storage denial falls back
to a static header. Reduced motion stays static, including manual replay.
The local study's Replay button explicitly restarts the motion; switching sites
no longer triggers it. Closing the tab ends the session.
The colour study now prioritises Abstain, Muted and Muted secondary greys, plus
Fold Green at 50%, 65% and 80% alpha. These are transparent treatments of the
existing green, not new palette tokens. Full Fold Green remains a reference.

### Brand-kit proportions and atomic refresh · 23 October 2026

Verified against https://github.com/theinterfold/brand-kit/blob/main/Logo/Lockup/interfold-lockup-dark.svg
(blob 6aa4f22b68f1a9e63b3a0edb28365d84c5a90d2d). Its 1000-unit horizontal
artwork gives the symbol 139.644 units, the gap 48.377, and the wordmark 811.979.
The 27 October correction uses the original lockup paths and its complete
122-unit coordinate frame, including the symbol's 2.67285-unit top inset.
The previous independent vertical centring and standalone symbol were approximations.
At the same 22px Gramercy scale as Docs, the outlined wordmark is 120.421 ×
17.202px and the symbol is about 20.71px wide, with a 7.17px gap. Compact uses
a common 20px type scale; narrow mobile uses 19px. Header symbols use the
lockup artwork; standalone illustrations retain their separate original artwork.
The folding image occupies the same artwork bounds as the lockup symbol.

The identity nodes remain mounted between review layouts. Layout and session
state are resolved before paint, with the identity hidden as one unit until ready,
so a refreshed study never paints the original centred symbol first or remounts
it into a new animation. The first-visit and explicit replay policies remain.
Sage (#687D71), verified in the current brand-kit README, joins the colour study.

### Navbar type-size study · 23 October 2026

The local comparison exposes 16, 18, 20, 22 and 24px, plus the layout's own
default. `navbarTypeSize` travels with layout and colour in the validated bridge,
query string and named-frame session state. It changes navbar type and the
wordmark/lockup proportionally in both apps, with no remount or motion replay.
Normal product URLs retain their sizing. Below 360px the existing 19px maximum
keeps Governance clear of the mobile menu button.

### Approved navbar and Network control · 23 October 2026

The accepted comparison is horizontal lockup, 24px type and Fold Green at 65%
for Governance. These are now the shared product defaults, not just study state.
The study still allows overrides. The Network Alpha control uses the shared
6px action radius, matching the wallet's corners. It retains its dark surface
and opens a separate panel 4px below the unchanged trigger. The shared
`SiteDropdownPanel` grows from 95% and moves down 8px, anchored at top centre.
It uses the Scaena/DialKit spring (visualDuration .15, bounce 0) for entrance
and exit; reduced motion makes this immediate. Its final width matches the
trigger exactly. Visibility follows completion; rapid reversals preserve velocity. The panel
starts hidden in SSR and closes on Escape, outside pointer input or focus leaving
the control. Arrow keys navigate destinations; Escape restores trigger focus.
Desktop and mobile network controls remain without a glowing dot; mobile
keeps its existing inline disclosure.

### Navigation arrows · 27 October 2026

Mobile-menu hover underlines only the stationary text label, not the animated
arrow or disclosure chevron. The Interfold menu selects `data-menu-theme="interfold"`
to retain its published green primary links (#3a5e3c), Signal hover (#82f5ad)
and existing muted green network destinations (#79907f). Governance retains
its own approved menu colours; both use the same markup and motion rules.

Desktop navbar and mobile menu links use ExternalArrowSlide only for external
destinations. Internal links have no arrow. Keep external diagonal arrows
visible at rest and roll the arrow on hover or keyboard focus; reduced motion
keeps it still. The site-nav-arrow classes preserve the website's 14px desktop
size, proportional mobile size and optical alignment in both applications.
The wallet and Network disclosure retain their own controls.

### Governance entrance before hydration · 27 October 2026

Server-rendered consumers run HEADER_ENTRANCE_BOOTSTRAP after the header and menu
trigger, before application scripts. It uses the same DOM runtime as SiteHeaderChrome:
950ms arrival after 160ms, the existing 450ms item reveals and symbol unfolding
from 1100ms. React adopts the active run without restarting it. The artwork's
deferred application loading cannot hold the header or postpone its symbol.
The mobile trigger joins that sequence through data-header-menu-trigger.
Refreshes show the complete static identity before hydration, without requesting
the folding SVG. First visits use the cacheable asset URL; only explicit review
replays request a new SVG timeline. Reduced motion, denied storage, image failure
and navigation restore the static symbol and cancel pending work.

### Fold stroke compensation · 27 October 2026

`assets/symbol-fold.svg` includes a screen-space optical correction for almost
coincident crease lines. It coalesces carriers closer than 24 of the 1000 artwork
units and releases the correction by 32 units, before separate folds merge.
Faces, ink, joins and occlusion masks use the same correction; adjusting masks
alone causes broken corners. The original 48-unit pen, projector timing, flap
sequence and final handoff are retained. The static brand path is untouched.

Regenerate with `python3 scripts/generate-symbol-motion.py --brand-motion /path/to/Brand-Motion`.
The approved Brand-Motion directory is read-only input. Add `--check` to verify
reproducibility. Generation asserts that the final pose is exactly unchanged.
Sync the generated SVG to both consumers through the normal header build.

The flap exit trim is restricted to decorative join patches. Applying its
infinite half-plane to the complete triangle erased the exposed right return
edge around frame 58 (967 ms). Ordinary finite face/depth masks still hide
occluded ink. The generator checks ink across the exposed 48-unit stroke at
that crossing, in addition to checking the unchanged final pose.

Depth masks use the finite paper polygons, not their expanded ink footprints.
Masking with ink that is itself occluded by another face produced the long
paper-coloured slit at 583 ms. The generator now also checks visible ink along
that exposed crease; all depth tests, stroke widths and fold timing remain.

### Production footer · 27 October 2026

The approved A2 footer is now unconditional: discreet 11px labels, 20px links,
28px leading and no extra label-to-link gap. Wrapped links keep a .75em hanging
indent. The comparison selector, query-dependent state and unused alternatives
are removed, so first paint matches the final footer without a client-side swap.

### Page navigation

Use `transitionPage(getSurface, commit, signal)` on internal page changes, including browser Back and Forward. It fades the outgoing content upwards by 18 px over 220 ms, commits the destination, then brings it up from 18 px below over 280 ms. Both use `cubic-bezier(0.55, 0, 0.1, 1)`. Keep persistent navigation outside the moving surface. A shared hero or proposal can keep its own transition while the surrounding content leaves. Reduced motion switches the page immediately. Initial loads, in-page anchors, filter updates and dialogs keep their own behavior. Abort a superseded transition so only the latest destination can commit.
