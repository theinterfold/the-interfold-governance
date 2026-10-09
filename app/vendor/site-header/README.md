# Shared Interfold header and footer

The canonical source is `Interfold-Website/packages/site-header/src`.
The website imports its compiled `lib`; Governance consumes the identical release
in `app/vendor/site-header`. The vendored package needs no sibling repository at deployment.

Update the source, then run `bun run sync:header` from Interfold-Website to rebuild
both consumers. Do not edit the generated package in either app.

The block owns header height, gutters, breakpoint, wordmark outlines, symbol,
navigation typography and action spacing. Applications supply routes, the wallet
or network action, menu state and their existing opening animations.
Governance adds its suffix on the wordmark's existing baseline, inheriting the
same colour on hover and keyboard focus.
Desktop navigation, mobile menu and footer links share `--site-chrome-hover`, a
dark forest green that keeps text readable on mint and grey backgrounds. Hover
and keyboard focus retain a visible underline; the desktop line animates in,
while the current page keeps its persistent underline. Mobile links use
`site-header-menu-link` for that shared treatment.

Header and footer share `--site-content-width` (1052px) and
`--site-content-gutter` (16px, 32px from 768px). Their content, brand and mobile
menu trigger align to this frame in both consumers. Governance's page-content
tokens alias these values, with no separate header/footer width overrides.

`SiteFooter` owns the main website's four-column layout, wordmark and typography.
Its default content is Legal/Follow us links and the shared `GhostSignupForm`.
`siteUrl` resolves the default legal links; `Reveal` integrates the main website's
existing entrance animation. `linkGroups` supplies the two columns' application-specific
links, `copyright` supplies the baseline text, and `showUpdates={false}` omits the
newsletter. Governance uses The Interfold, DAO Constitution, Blog and X, without Updates.
Its navbar and footer share `--page-ground-shade` to contrast with the page body.
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
