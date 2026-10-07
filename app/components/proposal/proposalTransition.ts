export type ProposalPartPosition = {
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  radius: number;
};

/** Move fixed snapshots with transforms; resizing their boxes each frame changes text fitting. */
export function proposalTransitionStyles(
  before: Map<string, ProposalPartPosition>,
  after: Map<string, ProposalPartPosition>
) {
  // Creation has no shared text in the action. Fit the incoming/outgoing fields
  // uniformly inside its travelling surface, as MorphDialog does for its content.
  const firstSurface = before.get("surface");
  const lastSurface = after.get("surface");
  if (firstSurface && lastSurface) {
    before = new Map(before);
    after = new Map(after);
    const fit = (part: ProposalPartPosition, from: ProposalPartPosition, to: ProposalPartPosition) => {
      const scale = Math.min(to.width / from.width, to.height / from.height);
      return {
        left: to.left + (to.width - from.width * scale) / 2 + (part.left - from.left) * scale,
        top: to.top + (to.height - from.height * scale) / 2 + (part.top - from.top) * scale,
        width: part.width * scale,
        height: part.height * scale,
        fontSize: part.fontSize * scale,
        radius: part.radius * scale,
      };
    };
    for (const part of ["create-title", "create-summary", "create-description"]) {
      const first = before.get(part);
      const last = after.get(part);
      if (!first && last) before.set(part, fit(last, lastSurface, firstSurface));
      if (first && !last) after.set(part, fit(first, firstSurface, lastSurface));
    }
  }
  const rules: string[] = [];
  after.forEach((last, part) => {
    const first = before.get(part);
    if (!first || !first.width || !first.height || !last.width || !last.height) return;
    const surface = part === "surface";
    const scaleX = surface ? first.width / last.width : first.fontSize / last.fontSize;
    const scaleY = surface ? first.height / last.height : scaleX;
    const name = `proposal-${part}`;
    // A full summary can be taller than the clamped row summary. Its visible region
    // contracts with the row, so the outgoing lines cannot cross the returning author.
    const clip = part === "summary" && first.height / scaleY > last.height + 1;
    const clipStart = `inset(0 -${Math.max(0, first.width / scaleX - last.width)}px -${Math.max(0, first.height / scaleY - last.height)}px 0)`;
    rules.push(`
      html[data-proposal-navigation]::view-transition-group(${name}) {
        width: ${last.width}px; height: ${last.height}px; transform-origin: 0 0;
        animation-name: ${name}-travel;
      }
      @keyframes ${name}-travel {
        from { transform: translate(${first.left}px, ${first.top}px) scale(${scaleX}, ${scaleY}); ${clip ? `clip-path: ${clipStart};` : ""} }
        to { transform: translate(${last.left}px, ${last.top}px) scale(1); ${clip ? "clip-path: inset(0);" : ""} }
      }
    `);
    if (surface) {
      rules.push(`
        html[data-proposal-navigation]::view-transition-image-pair(${name}) {
          animation-name: proposal-surface-corners;
          animation-duration: inherit; animation-timing-function: inherit;
          animation-fill-mode: both;
        }
        @keyframes proposal-surface-corners {
          from { border-radius: ${first.radius / scaleX}px / ${first.radius / scaleY}px; }
          to { border-radius: ${last.radius}px; }
        }
      `);
      return;
    }
    // Each text layout keeps its own aspect ratio. Only typography scales, never the column width.
    rules.push(`
      html[data-proposal-navigation]::view-transition-old(${name}) {
        width: ${first.width / scaleX}px; height: ${first.height / scaleY}px;
      }
      html[data-proposal-navigation]::view-transition-new(${name}) {
        width: ${last.width}px; height: ${last.height}px;
      }
    `);
    if (
      part === "timing" &&
      first.top < (before.get("title")?.top ?? 0) &&
      last.top > (after.get("author")?.top ?? Infinity)
    ) {
      // In a stacked row the deadline moves from above to below the reading text.
      // Clear that crossing, then restore it with the row controls.
      rules.push(`
        html[data-proposal-navigation="back"]::view-transition-old(${name}) {
          animation: proposal-context-out 90ms linear both;
        }
        html[data-proposal-navigation="back"]::view-transition-new(${name}) {
          animation: proposal-context-in 120ms 240ms linear both;
        }
      `);
    }
  });
  return rules.join("\n");
}
