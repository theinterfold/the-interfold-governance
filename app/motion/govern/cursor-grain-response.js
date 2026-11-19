// A small visual response, independent of both cursor position and native physics.
// Positions are never accumulated: stopping restores the original grain layout.
export const CURSOR_GRAIN_MAX_SHIFT = 2.4;
export const CURSOR_GRAIN_REACH = 3;
export const DEFAULT_GRAIN_RESPONSE = Object.freeze({strength: 8, reach: 2, settleMs: 340});
export function normalizeGrainResponse(settings = {}) {
  const clamp = (key, low, high) => Number.isFinite(settings[key])
    ? Math.max(low, Math.min(high, settings[key])) : DEFAULT_GRAIN_RESPONSE[key];
  return {strength: clamp('strength', 0, 8), reach: clamp('reach', 1, 2.5), settleMs: clamp('settleMs', 40, 400)};
}

export function createCursorGrainResponse() {
  const shift = new Float32Array(2);
  let previous = null;
  function reset() { previous = null; shift.fill(0); }
  function update(cursor, now, settleMs = DEFAULT_GRAIN_RESPONSE.settleMs) {
    if (!(cursor?.r > 0) || !Number.isFinite(cursor.x + cursor.y + now)) {
      reset(); return shift;
    }
    const elapsed = previous ? (now - previous.time) / 1000 : 0;
    if (elapsed <= 0 || elapsed > .15) {
      shift.fill(0);
    } else {
      const vx = (cursor.x - previous.x) / elapsed;
      const vy = (cursor.y - previous.y) / elapsed;
      const speed = Math.hypot(vx, vy);
      const gain = CURSOR_GRAIN_MAX_SHIFT / Math.max(450, speed);
      // Quick engagement; a short, non-oscillating return when the pointer rests.
      const weight = -Math.expm1(-elapsed / (speed > 1 ? .035 : settleMs / 1000));
      shift[0] += (vx * gain - shift[0]) * weight;
      shift[1] += (vy * gain - shift[1]) * weight;
      if (speed === 0 && Math.hypot(...shift) < .001) shift.fill(0);
    }
    previous = {x: cursor.x, y: cursor.y, time: now};
    return shift;
  }
  return {update, reset};
}

export const cursorGrainResponseGlsl = `
  uniform vec3 uCursor;
  uniform vec2 uGrainShift;
  uniform float uGrainReach;
  vec2 respondToCursor(vec2 position) {
    if (uCursor.z <= 0.) return position;
    vec2 q = (position - uCursor.xy) / (uCursor.z * uGrainReach);
    float s = dot(q, q);
    if (s >= 1.) return position;
    float f = 1. - s;
    // Curl of a compact stream function: no first-order density compression.
    // Both displacement and its first derivative vanish at the circular limit.
    float crossFlow = uGrainShift.x * q.y - uGrainShift.y * q.x;
    return position + f*f*f*uGrainShift - 6.*f*f*crossFlow*vec2(q.y,-q.x);
  }
`;
