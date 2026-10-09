// Vector sources and animation coordinates share the same deterministic dots.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { FIELD_WIDTH, FIELD_HEIGHT, hash, smoothstep } from "./card-particles.mjs";
import { compactDotSvg } from "./compact-dot-svg.mjs";

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || "sharp");
const sheets = require("../../utils/pointSheetLayout.json");
const directory = fileURLToPath(new URL("../../public/images/", import.meta.url));
const luma = (r, g, b) => .2126 * r + .7152 * g + .0722 * b;
const ink = luma(18, 23, 24);
const spacing = .95;
const illustrations = [
  ["get-fold", "get-fold"],
  ["activate-voting-power", "activate-voting-power-no-shadow"],
  ["govern", "govern"],
];

function makeDots(toneAt, motionAt, seed) {
  const coordinates = [], circles = [];
  for (let row = 0, y = spacing; y < FIELD_HEIGHT - spacing; row++, y += spacing) {
    for (let column = 0, x = spacing; x < FIELD_WIDTH - spacing; column++, x += spacing) {
      const px = x + (hash(column, row, seed) - .5) * spacing * .9;
      const py = y + (hash(column, row, seed + 1) - .5) * spacing * .9;
      const tone = toneAt(px, py);
      if (tone < .009) continue;
      const probability = Math.min(1, Math.sqrt(tone) * 1.8);
      if (hash(column, row, seed + 2) > probability) continue;
      // Half the old spacing and radius, with four times the sampling density.
      const radius = Math.min(.925, Math.sqrt(-Math.log(1 - tone) / (Math.PI * probability)) * spacing)
        * (.92 + hash(column, row, seed + 3) * .16);
      const phase = hash(column, row, seed + 4) * Math.PI * 2;
      const edge = smoothstep(0, 12, px) * smoothstep(0, 12, FIELD_WIDTH - px)
        * smoothstep(0, 12, py) * smoothstep(0, 12, FIELD_HEIGHT - py);
      const mobility = (.12 + .88 * (1 - smoothstep(.15, .8, tone))) * edge;
      // x, y, radius, phase, local variation, motion data; 6 float32s per dot.
      coordinates.push(px, py, radius, phase, mobility, motionAt(px, py, tone, edge));
      circles.push(`<circle cx="${px.toFixed(2)}" cy="${py.toFixed(2)}" r="${radius.toFixed(2)}"/>`);
    }
  }
  return { coordinates, markup: circles.join("") };
}

function occlusionPolygonAt(offset) {
  return sheets.occlusionPolygon.map(([x, y]) => `${x},${y + offset}`).join(" ");
}

for (const [index, [name, source]] of illustrations.entries()) {
  // Sample at the source's actual resolution. The previous 600px field and
  // three blur passes removed the fine grain before it ever reached the dots.
  const { data: pixels, info } = await sharp(`${directory}${source}.webp`)
    .removeAlpha().blur(.35).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let paper = 0;
  for (let x = 0; x < width; x++) paper += luma(...pixels.subarray(x * channels, x * channels + 3));
  paper /= width;
  const field = new Float32Array(width * height);
  for (let i = 0; i < field.length; i++) {
    field[i] = Math.max(0, Math.min(.985, (paper - luma(...pixels.subarray(i * channels, i * channels + 3))) / (paper - ink)));
  }
  const sample = (px, py) => {
    const x = Math.min(width - 1.001, px / FIELD_WIDTH * width);
    const y = Math.min(height - 1.001, py / FIELD_HEIGHT * height);
    const ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy, at = iy * width + ix;
    return (field[at] * (1 - tx) + field[at + 1] * tx) * (1 - ty)
      + (field[at + width] * (1 - tx) + field[at + width + 1] * tx) * ty;
  };
  const seed = 31 + index * 20;
  let coordinates, content;
  if (name === "activate-voting-power") {
    const [back, right, front, left] = sheets.polygon;
    const top = makeDots((x, y) => {
      const edge = x < front[0] ? left : right;
      const frontY = front[1] + (x - front[0]) * (edge[1] - front[1]) / (edge[0] - front[0]);
      return x >= left[0] && x <= right[0] && y <= frontY ? sample(x, y) : 0;
    }, () => 0, seed);
    const inside = (x, y) => sheets.polygon.every(([ax, ay], i) => {
      const [bx, by] = sheets.polygon[(i + 1) % sheets.polygon.length];
      return (bx - ax) * (y - ay) - (by - ay) * (x - ax) >= 0;
    });
    const plane = makeDots((x, y) => {
      if (!inside(x, y)) return 0;
      const depth = (y - back[1]) / (front[1] - back[1]);
      // Full paper-thin faces provide the hidden surface revealed by travel.
      return Math.min(.965, .3 + .63 * smoothstep(.05, .95, depth)
        + (hash(Math.floor(x * 2), Math.floor(y * 2), seed + 18) - .5) * .055);
    }, () => 1, seed + 10);
    coordinates = [...top.coordinates, ...plane.coordinates];
    const masks = [], layers = [];
    for (let layer = sheets.visibleSheets; layer >= 1; layer--) {
      const occluders = Array.from({ length: layer }, (_, upper) =>
        `<polygon points="${occlusionPolygonAt(upper * sheets.gap)}" fill="black"/>`).join("");
      masks.push(`<mask id="visible-${layer}" maskUnits="userSpaceOnUse" x="0" y="0" width="600" height="450"><rect width="600" height="450" fill="white"/>${occluders}</mask>`);
      layers.push(`<g mask="url(#visible-${layer})"><use href="#sheet" transform="translate(0 ${layer * sheets.gap})"/></g>`);
    }
    content = `<defs><g id="sheet">${plane.markup}</g>${masks.join("")}</defs>${layers.join("")}<g>${top.markup}</g>`;
  } else {
    const dots = makeDots(sample, (x, y, tone, edge) => name === "govern"
      ? smoothstep(90, 265, Math.hypot(x - 300, y - 225))
      : smoothstep(238, 290, y) * (1 - smoothstep(.5, .85, tone)) * edge
        * smoothstep(0, 40, FIELD_HEIGHT - y), seed);
    coordinates = dots.coordinates;
    content = dots.markup;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="678" viewBox="0 0 ${FIELD_WIDTH} ${FIELD_HEIGHT}" preserveAspectRatio="none"><g fill="#121718">${content}</g></svg>`;
  await writeFile(`${directory}${name}-dots.svg`, compactDotSvg(svg));
  await writeFile(`${directory}${name}-dots.bin`, Buffer.from(new Float32Array(coordinates).buffer));
  // Keep the float export for authoring. The page downloads compact geometry,
  // with subpixel precision retained instead of 24 bytes per fine circle.
  const count = coordinates.length / 6;
  const compact = Buffer.alloc(8 + count * 9);
  compact.write("IFP1");
  compact.writeUInt32LE(count, 4);
  for (let i = 0; i < count; i++) {
    const from = i * 6, to = 8 + i * 9;
    compact.writeUInt16LE(Math.round(coordinates[from] * 100), to);
    compact.writeUInt16LE(Math.round(coordinates[from + 1] * 100), to + 2);
    compact.writeUInt16LE(Math.round(coordinates[from + 2] * 1000), to + 4);
    compact[to + 6] = Math.floor(coordinates[from + 3] / (Math.PI * 2) * 256) % 256;
    compact[to + 7] = Math.round(coordinates[from + 4] * 255);
    compact[to + 8] = Math.round(coordinates[from + 5] * 255);
  }
  await writeFile(`${directory}${name}-dots.points`, compact);
  console.log(`${name}: ${coordinates.length / 6} vector dots`);
}
