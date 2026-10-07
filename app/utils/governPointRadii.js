/**
 * Fit opaque circular grains to their displayed centers, without culling them.
 * fit() takes interleaved [x, y] CSS coordinates, desired CSS radii and seconds.
 * Every output pair obeys ri + rj <= 0.98 * centerDistance.
 */
export function createGovernPointRadii(count) {
  const next = new Int32Array(count);
  const buckets = new Int32Array(count);
  const occupied = new Int32Array(count);
  const radii = new Float32Array(count);
  let heads = new Int32Array(0);
  let bucketRadii = new Float32Array(0);
  let occupiedCount = 0;
  let initialized = false;
  function fit(xyCSS, desiredRadiiCSS, dt = 1 / 60) {
    if (!count) return radii;
    const follow = 1 - Math.exp(-Math.max(0, dt) / 0.24);
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity,
      maxRadius = 0;
    for (let i = 0; i < count; i++) {
      const x = xyCSS[i * 2],
        y = xyCSS[i * 2 + 1];
      const desired = Math.max(0, desiredRadiiCSS[i]),
        previous = radii[i];
      // Grow before projection; projection only shrinks and keeps earlier bounds valid.
      radii[i] = !initialized || desired < previous ? desired : previous + (desired - previous) * follow;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxRadius = Math.max(maxRadius, radii[i]);
    }
    const cell = Math.max(0.5, Math.min(1.25, maxRadius));
    const originX = Math.floor(minX / cell) * cell,
      originY = Math.floor(minY / cell) * cell;
    const cols = Math.floor((maxX - originX) / cell) + 1,
      rows = Math.floor((maxY - originY) / cell) + 1;
    const bucketCount = cols * rows;
    if (heads.length < bucketCount) {
      const capacity = 2 ** Math.ceil(Math.log2(bucketCount));
      heads = new Int32Array(capacity);
      heads.fill(-1);
      bucketRadii = new Float32Array(capacity);
    } else {
      for (let a = 0; a < occupiedCount; a++) {
        heads[occupied[a]] = -1;
        bucketRadii[occupied[a]] = 0;
      }
    }
    occupiedCount = 0;
    for (let i = 0; i < count; i++) {
      const col = Math.floor((xyCSS[i * 2] - originX) / cell),
        row = Math.floor((xyCSS[i * 2 + 1] - originY) / cell);
      const bucket = row * cols + col;
      if (heads[bucket] === -1) occupied[occupiedCount++] = bucket;
      buckets[i] = bucket;
      next[i] = heads[bucket];
      heads[bucket] = i;
      bucketRadii[bucket] = Math.max(bucketRadii[bucket], radii[i]);
    }
    for (let i = 0; i < count; i++) {
      const x = xyCSS[i * 2],
        y = xyCSS[i * 2 + 1],
        ownBucket = buckets[i];
      // Using current radii avoids shrinking against an already-small neighbor.
      for (let j = heads[ownBucket]; j !== -1; j = next[j]) {
        if (j <= i) continue;
        const sum = radii[i] + radii[j],
          dx = x - xyCSS[j * 2],
          dy = y - xyCSS[j * 2 + 1];
        const allowedSquared = (dx * dx + dy * dy) * 0.9604;
        if (sum * sum <= allowedSquared || sum === 0) continue;
        const factor = Math.sqrt(allowedSquared) / sum;
        radii[i] *= factor;
        radii[j] *= factor;
      }
      const queryRadius = (radii[i] + maxRadius) / 0.98;
      const minCol = Math.max(0, Math.floor((x - queryRadius - originX) / cell));
      const maxCol = Math.min(cols - 1, Math.floor((x + queryRadius - originX) / cell));
      const minRow = Math.max(0, Math.floor((y - queryRadius - originY) / cell));
      const maxRow = Math.min(rows - 1, Math.floor((y + queryRadius - originY) / cell));
      for (let row = minRow; row <= maxRow; row++) {
        const edgeY = row * cell + originY,
          dyBox = Math.max(edgeY - y, 0, y - edgeY - cell);
        for (let col = minCol; col <= maxCol; col++) {
          const bucket = row * cols + col;
          if (bucket === ownBucket || heads[bucket] === -1) continue;
          const edgeX = col * cell + originX,
            dxBox = Math.max(edgeX - x, 0, x - edgeX - cell);
          const reach = (radii[i] + bucketRadii[bucket]) / 0.98;
          if (dxBox * dxBox + dyBox * dyBox >= reach * reach) continue;
          for (let j = heads[bucket]; j !== -1; j = next[j]) {
            if (j <= i) continue;
            const sum = radii[i] + radii[j],
              dx = x - xyCSS[j * 2],
              dy = y - xyCSS[j * 2 + 1];
            const allowedSquared = (dx * dx + dy * dy) * 0.9604;
            if (sum * sum <= allowedSquared || sum === 0) continue;
            // Only decreases follow, preserving every earlier pair/bucket bound.
            const factor = Math.sqrt(allowedSquared) / sum;
            radii[i] *= factor;
            radii[j] *= factor;
          }
        }
      }
    }
    initialized = true;
    return radii;
  }
  return { fit, radii, outputCSSradius: radii };
}
