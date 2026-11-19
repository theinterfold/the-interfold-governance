// Shared compact sum geometry for GPU cursor transport.
// The caller defines Params p, Circle, and old+next shapes at binding 3.
export const geometryWgsl = /* wgsl */ `

// Masks conservatively list compact supports intersecting the query cell.
// Outside the prepared field, exact projection still checks every circle.
fn geometryMask(pos:vec2<f32>,endpoint:u32)->vec2<u32>{
 let cell=vec2<i32>(floor((pos-vec2<f32>(p.x0,p.y0))/p.h));
 if(cell.x<0||cell.y<0||cell.x>=i32(p.nx)||cell.y>=i32(p.ny)){return vec2<u32>(0xffffffffu,0xffffffffu);}
 let n=p.nx*p.ny;let k=u32(cell.y)*p.nx+u32(cell.x);
 return vec2<u32>(nearWall[n*(1u+endpoint*2u)+k],nearWall[n*(2u+endpoint*2u)+k]);
}

struct Hit {
  value: f32,
  gap: f32,
  gradient: f32,
  nx: f32,
  ny: f32,
};

fn valueAt(pos: vec2<f32>, endpoint: u32) -> f32 {
  var weight = 0.0;
  let masks=geometryMask(pos,endpoint);var remaining=masks.x;var offset=0u;
  loop {
    if(remaining==0u){if(offset==32u){break;}offset=32u;remaining=masks.y;if(remaining==0u){break;}}
    let i=offset+firstTrailingBit(remaining);remaining=remaining&(remaining-1u);if(i>=p.holes){continue;}
    let circle = shapes[endpoint * p.holes + i];
    if (circle.reach <= 1e-9) { continue; }
    let offset = pos - vec2<f32>(circle.x, circle.y);
    let radius2 = dot(offset, offset);
    if (radius2 >= circle.support2) { continue; }
    let radius = max(sqrt(radius2), 1e-9);
    let distance = radius - circle.effectiveR;
    if (distance >= circle.reach) { continue; }
    var gate = 1.0;
    if (distance > 0.0) {
      let u = distance / circle.reach;
      let u2 = u * u;
      let u3 = u2 * u;
      let u4 = u3 * u;
      gate = 1.0 - 10.0 * u3 + 15.0 * u4 - 6.0 * u4 * u;
    }
    weight = weight + exp(-distance * circle.invKappa) * gate;
  }
  return weight - 1.0;
}

fn evaluateAt(pos: vec2<f32>, endpoint: u32) -> Hit {
  var weight = 0.0;
  var gradient = vec2<f32>(0.0);
  var nearest = 1e20;
  var fallback = vec2<f32>(0.0);
  let masks=geometryMask(pos,endpoint);var remaining=masks.x;var offset=0u;
  loop {
    if(remaining==0u){if(offset==32u){break;}offset=32u;remaining=masks.y;if(remaining==0u){break;}}
    let i=offset+firstTrailingBit(remaining);remaining=remaining&(remaining-1u);if(i>=p.holes){continue;}
    let circle = shapes[endpoint * p.holes + i];
    if (circle.reach <= 1e-9) { continue; }
    let offset = pos - vec2<f32>(circle.x, circle.y);
    let radius2 = dot(offset, offset);
    if (radius2 >= circle.support2) { continue; }
    let radius = max(sqrt(radius2), 1e-9);
    let distance = radius - circle.effectiveR;
    if (distance < nearest) {
      nearest = distance;
      fallback = offset / radius;
    }
    if (distance >= circle.reach) { continue; }
    var gate = 1.0;
    var gateDerivative = 0.0;
    if (distance > 0.0) {
      let u = distance / circle.reach;
      let u2 = u * u;
      let u3 = u2 * u;
      let u4 = u3 * u;
      gate = 1.0 - 10.0 * u3 + 15.0 * u4 - 6.0 * u4 * u;
      gateDerivative = (-30.0 * u2 + 60.0 * u3 - 30.0 * u4) / circle.reach;
    }
    let exponential = exp(-distance * circle.invKappa);
    weight = weight + exponential * gate;
    gradient = gradient + exponential * (gateDerivative - gate * circle.invKappa) / radius * offset;
  }
  let magnitude = length(gradient);
  var normal = fallback;
  if (magnitude > 1e-7) { normal = -gradient / magnitude; }
  return Hit(weight - 1.0, clamp((1.0 - weight) / max(magnitude, 0.05), -24.0, 24.0),
    magnitude, normal.x, normal.y);
}

fn sweptValue(pos: vec2<f32>) -> f32 {
  return min(valueAt(pos, 0u), valueAt(pos, 1u));
}

fn fluidValue(pos: vec2<f32>, nextOnly: bool) -> f32 {
  if (nextOnly) { return valueAt(pos, 1u); }
  return sweptValue(pos);
}

fn moveInFluid(start: vec2<f32>, delta: vec2<f32>, nextOnly: bool) -> vec2<f32> {
  let steps = max(1u, u32(ceil(length(delta) / 0.25)));
  let increment = delta / f32(steps);
  var pos = start;
  for (var step = 0u; step < steps; step = step + 1u) {
    if (fluidValue(pos + increment, nextOnly) <= 0.0) {
      pos = pos + increment;
      continue;
    }
    var low = 0.0;
    var high = 1.0;
    for (var j = 0u; j < 10u; j = j + 1u) {
      let middle = (low + high) * 0.5;
      if (fluidValue(pos + increment * middle, nextOnly) > 0.0) { high = middle; }
      else { low = middle; }
    }
    let boundary = pos + increment * low;
    var endpoint = 1u;
    if (!nextOnly && valueAt(boundary, 0u) < valueAt(boundary, 1u)) { endpoint = 0u; }
    let hit = evaluateAt(boundary, endpoint);
    let normal = vec2<f32>(hit.nx, hit.ny);
    let tangent = (increment - min(0.0, dot(increment, normal)) * normal) * (1.0 - low);
    pos = boundary;
    if (fluidValue(boundary + tangent, nextOnly) <= 0.0) {
      pos = boundary + tangent;
    } else {
      var a = 0.0;
      var b = 1.0;
      for (var j = 0u; j < 10u; j = j + 1u) {
        let middle = (a + b) * 0.5;
        if (fluidValue(boundary + tangent * middle, nextOnly) > 0.0) { b = middle; }
        else { a = middle; }
      }
      pos = boundary + tangent * a;
    }
  }
  return pos;
}

fn sweptMove(start: vec2<f32>, delta: vec2<f32>) -> vec2<f32> {
  return moveInFluid(start, delta, false);
}

fn afterMove(start: vec2<f32>, delta: vec2<f32>) -> vec2<f32> {
  return moveInFluid(start, delta, true);
}

fn projectAfter(start: vec2<f32>) -> vec2<f32> {
  var pos = start;
  var hit = evaluateAt(pos, 1u);
  for (var projectionPass = 0u; projectionPass < 24u && hit.gap < 0.0001; projectionPass = projectionPass + 1u) {
    let push = min(max(0.02, 0.0001 - hit.gap), 2.0);
    pos = pos + vec2<f32>(hit.nx, hit.ny) * push;
    hit = evaluateAt(pos, 1u);
  }
  return pos;
}
`;
