const number = (hundredths) => String(hundredths / 100);

/** Round caps on zero-length subpaths are circles, with the same centre and radius.
 * Group equal radii to avoid a separate SVG element and three attributes per dot.
 * Integer hundredths preserve the original export's precision without drift.
 * Only contiguous circle runs are grouped; masks, transforms and paint order stay put.
 */
export function compactDotSvg(svg) {
  return svg.replace(/(?:<circle cx="[\d.]+" cy="[\d.]+" r="[\d.]+"\/>)+/g, (run) => {
    const groups = new Map();
    for (const match of run.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"\/>/g)) {
      const [x, y, radius] = match.slice(1).map((value) => Math.round(Number(value) * 100));
      if (!radius) continue;
      if (!groups.has(radius)) groups.set(radius, { x: 0, y: 0, path: "" });
      const group = groups.get(radius);
      group.path += `m${number(x - group.x)} ${number(y - group.y)}h0`;
      group.x = x;
      group.y = y;
    }
    return Array.from(groups, ([radius, { path }]) =>
      `<path fill="none" stroke="#121718" stroke-width="${number(radius * 2)}" stroke-linecap="round" d="${path}"/>`
    ).join("");
  });
}
