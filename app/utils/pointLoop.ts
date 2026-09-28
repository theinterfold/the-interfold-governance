import sheetLayout from "./pointSheetLayout.json";

export const POINT_STRIDE = 6;
export const POINT_ASSET_VERSION = "svg-points-4";
export const POINT_LOOP_SECONDS = {
  "get-fold": 6,
  "activate-voting-power": 12,
  "govern": 10,
} as const;
export type PointIllustrationName = keyof typeof POINT_LOOP_SECONDS;

const TAU = Math.PI * 2;
/** Compact vector coordinates: hundredth-unit positions, thousandth-unit radii. */
export function decodePointCoordinates(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  if (buffer.byteLength < 8 || view.getUint32(0) !== 0x49465031) throw new Error("Invalid point file");
  const count = view.getUint32(4, true);
  if (!count || count > 500_000 || buffer.byteLength !== 8 + count * 9) throw new Error("Invalid point count");
  const points = new Float32Array(count * POINT_STRIDE);
  for (let i = 0; i < count; i++) {
    const at = 8 + i * 9, out = i * POINT_STRIDE;
    points[out] = view.getUint16(at, true) / 100;
    points[out + 1] = view.getUint16(at + 2, true) / 100;
    points[out + 2] = view.getUint16(at + 4, true) / 1000;
    points[out + 3] = view.getUint8(at + 6) / 256 * TAU;
    points[out + 4] = view.getUint8(at + 7) / 255;
    points[out + 5] = view.getUint8(at + 8) / 255;
  }
  return points;
}
const number = (value: number) => Number(value.toFixed(3)).toString();
const smoothStep = (start: number, end: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
};

export type PointLoopLayer = {
  markup: string;
  bounds: [number, number, number, number];
  origin: string;
  frames?: { offset: number; transform: string; opacity: number }[];
  duration: number;
  startTime: number;
  sheet?: boolean;
  children?: PointLoopLayer[];
};

type DotGroup = {
  path: string[];
  motion: number;
  mobility: number;
  count: number;
  x: number;
  y: number;
  phase: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

/** Keep every authored circle; batch by trajectory, never by spatial tiles. */
function groupDots(points: Float32Array, keyFor: (offset: number) => string) {
  const groups = new Map<string, DotGroup>();
  for (let i = 0; i < points.length; i += POINT_STRIDE) {
    const key = keyFor(i);
    let group = groups.get(key);
    if (!group) {
      group = { path: [], motion: 0, mobility: 0, count: 0, x: 0, y: 0, phase: 0,
        minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      groups.set(key, group);
    }
    const x = points[i], y = points[i + 1], radius = points[i + 2];
    const r = number(radius), diameter = number(2 * radius);
    group.path.push(`M${number(x - radius)} ${number(y)}a${r} ${r} 0 1 0 ${diameter} 0a${r} ${r} 0 1 0 -${diameter} 0Z`);
    group.minX = Math.min(group.minX, x - radius);
    group.minY = Math.min(group.minY, y - radius);
    group.maxX = Math.max(group.maxX, x + radius);
    group.maxY = Math.max(group.maxY, y + radius);
    group.x += x; group.y += y; group.phase += points[i + 3];
    group.motion += points[i + 5]; group.mobility += points[i + 4]; group.count++;
  }
  for (const group of groups.values()) {
    group.motion /= group.count;
    group.mobility /= group.count;
    group.x /= group.count; group.y /= group.count; group.phase /= group.count;
  }
  return groups;
}

type Pose = { x?: number; y?: number; angle?: number; opacity?: number };
function vectorLayer(group: DotGroup, duration: number, pose?: (life: number) => Pose,
  options: { sheet?: boolean; startTime?: number; background?: boolean } = {}): PointLoopLayer {
  // Tight bounds avoid allocating an entire card-sized compositing surface for
  // each group. These are SVG view boxes, not bitmap/canvas resolutions.
  const x = Math.floor(group.minX - 1), y = Math.floor(group.minY - 1);
  const width = Math.ceil(group.maxX + 1) - x, height = Math.ceil(group.maxY + 1) - y;
  const center = options.sheet ? [287, 153] : [300, 225];
  const background = options.background
    ? `<polygon points="${sheetLayout.occlusionPolygon.map((point) => point.join(",")).join(" ")}" fill="var(--page-ground)"/>` : "";
  const layer: PointLoopLayer = {
    markup: `${background}<path d="${group.path.join("")}"/>`,
    bounds: [x, y, width, height],
    origin: `${number((center[0] - x) / width * 100)}% ${number((center[1] - y) / height * 100)}%`,
    duration: duration * 1000,
    startTime: options.startTime ?? 0,
    sheet: options.sheet,
  };
  if (pose) {
    const samples = Math.round(duration * 12);
    layer.frames = Array.from({ length: samples + 1 }, (_, i) => {
      const p = pose(i / samples);
      return {
        offset: i / samples,
        transform: `translate3d(${number((p.x ?? 0) / width * 100)}%, ${number((p.y ?? 0) / height * 100)}%, 0) rotate(${number(p.angle ?? 0)}deg)`,
        opacity: p.opacity ?? 1,
      };
    });
  }
  return layer;
}

/** A continuous sheet lifetime: gather below, rise and settle into the top. */
export function sheetPose(life: number, layer: number): Pose {
  const depth = (1 - life) * 5;
  const tide = Math.sin(TAU * life - TAU * layer / 5);
  const envelope = smoothStep(0, .6, depth) * smoothStep(0, .8, 5 - depth);
  const ripple = Math.sin(Math.PI * depth);
  const born = 1 - smoothStep(4, 5, depth);
  const joined = smoothStep(.015, .25, depth);
  return {
    x: envelope * (6 * ripple + 9 * tide * Math.sin(depth * .8)),
    y: (depth + .07 * ripple) * sheetLayout.gap,
    angle: envelope * (.018 * ripple + .012 * tide * Math.sin(depth)) * 180 / Math.PI,
    opacity: born * joined,
  };
}

function sheetParticles(group: DotGroup, life: number, layer: number): Pose {
  const depth = (1 - life) * 5;
  const seed = group.phase / TAU;
  const born = 1 - smoothStep(3.9 + seed * .45, 5, depth);
  const joined = smoothStep(.015, .2 + seed * .35, depth);
  const loose = 1 - born, opacity = born * joined;
  const time = TAU * life - TAU * layer / 5;
  const curl = Math.sin(born * Math.PI) * loose * 11;
  const phase = group.x * .025 + group.y * .019;
  return {
    x: Math.cos(group.phase) * (18 + 34 * seed) * loose * loose
      + Math.sin(group.phase + born * Math.PI) * curl
      + opacity * Math.sin(phase - time * 2 + depth * .9) * 1.8,
    y: (20 + 38 * seed) * loose * loose
      + Math.cos(group.phase + born * Math.PI) * curl
      + opacity * Math.cos(phase * .8 - time + depth) * 2.4 - (1 - joined) * (3 + 5 * seed),
    opacity,
  };
}

/** Runs in a worker. All paths stay vector; playback transforms whole layers. */
export function buildPointLoopLayers(points: Float32Array, image: PointIllustrationName): PointLoopLayer[] {
  if (!points.length || points.length % POINT_STRIDE || points.some((value) => !Number.isFinite(value))) {
    throw new Error("Invalid illustration coordinates");
  }
  const duration = POINT_LOOP_SECONDS[image];
  if (image === "activate-voting-power") {
    const groups = groupDots(points, (i) => points[i + 5] === 0 ? "top" : String(Math.floor(points[i + 3] / TAU * 8)));
    const top = groups.get("top");
    if (!top || groups.size < 2) throw new Error("Invalid sheet coordinates");
    groups.delete("top");
    const particles = [...groups.values()];
    const sheet: DotGroup = { ...particles[0], path: [],
      minX: Math.min(...particles.map((group) => group.minX)),
      minY: Math.min(...particles.map((group) => group.minY)),
      maxX: Math.max(...particles.map((group) => group.maxX)),
      maxY: Math.max(...particles.map((group) => group.maxY)),
    };
    const layers = Array.from({ length: sheetLayout.visibleSheets + 1 }, (_, layer) => {
      const startTime = layer * sheetLayout.travelSeconds * 1000;
      const parent = vectorLayer(sheet, duration, (life) => ({ ...sheetPose(life, layer), opacity: 1 }), { sheet: true, startTime });
      parent.markup = "";
      parent.children = [
        vectorLayer(sheet, duration, (life) => ({ opacity: sheetPose(life, layer).opacity }), { background: true, startTime }),
        ...particles.map((group) => vectorLayer(group, duration, (life) => sheetParticles(group, life, layer), { startTime })),
      ];
      return parent;
    });
    // Opaque faces replace animated occlusion masks, using the existing inset
    // contour so adjoining dot edges overlap without pale seams.
    layers.push(vectorLayer(top, duration, undefined, { background: true }));
    return layers;
  }

  const phases = 12;
  const groups = groupDots(points, (i) => {
    const x = points[i], y = points[i + 1], phase = points[i + 3];
    if (image === "get-fold") {
      if (points[i + 5] < .001) return "still";
      const angle = Math.hypot(x - 290, (y - 238) * 2.4) * .062;
      const position = angle / TAU * phases;
      // Interleave adjacent phases across the boundary instead of exposing a
      // hard ring edge. Stable authored noise means the dots never flicker.
      const bin = Math.floor(position) + (phase / TAU < position % 1 ? 1 : 0);
      return `${bin % phases}:${Math.min(1, Math.floor(points[i + 5] * 2))}`;
    }
    const position = Math.hypot(x - 300, y - 225) / 28;
    return String(Math.min(phases - 1, Math.floor(position) + (phase / TAU < position % 1 ? 1 : 0)));
  });
  return [...groups].map(([key, group]) => {
    if (key === "still") return vectorLayer(group, duration);
    if (image === "get-fold") {
      const phase = Number(key.split(":")[0]) / phases * TAU;
      const strength = group.motion * (.93 + .07 * group.mobility);
      return vectorLayer(group, duration, (life) => {
        const t = life * TAU;
        return { y: strength * (Math.sin(phase - t) + .22 * Math.sin(phase * 2 - 2 * t + .7)) * 12 };
      });
    }
    const phase = (Number(key) + .5) * 28 * .009;
    return vectorLayer(group, duration, (life) => {
      const t = life * TAU;
      return { angle: (.14 * Math.sin(t + phase) + group.motion * .05 * Math.sin(2 * t)) * 180 / Math.PI };
    });
  });
}
