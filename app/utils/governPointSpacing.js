// Ported from Pontilhismo/app.js: createPointSpacing / relaxPointSpacing.
// Order controls neighbour clearance and its variation, never target rows.
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const lerp = (a, b, t) => a + (b - a) * t;
const hash01 = (a, b, seed = 0) => {
  const n = Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
};
export function createPointSpacing(count, baseCount = count) {
  const grain = Float32Array.from({ length: count }, (_, i) => hash01(i, 0, 487));
  return {
    base: new Float32Array(count * 2),
    work: new Float32Array(count * 2),
    offset: new Float32Array(count * 2),
    push: new Float32Array(count * 2),
    limit: new Float32Array(count),
    speed: new Float32Array(count),
    radius: new Float32Array(count),
    selectionRadius: new Float32Array(count),
    reservedSize: new Float32Array(count),
    order: new Float32Array(count),
    grain,
    priority: Uint32Array.from({ length: count }, (_, i) => i).sort(
      (a, b) => Number(a >= baseCount) - Number(b >= baseCount) || grain[a] - grain[b]
    ),
    edgeVisibility: new Float32Array(count),
    // 0 = not yet in the field, 1 = retained, 2 = spare. Membership lasts
    // the whole visible journey, so passing neighbours never toggle a dot.
    membership: new Uint8Array(count),
    visibility: new Float32Array(count),
    eligible: new Uint8Array(count),
    active: new Uint32Array(count),
    next: new Int32Array(count),
    heads: new Int32Array(0),
    width: 0,
    height: 0,
  };
}

export function relaxPointSpacing(
  spacing,
  positions,
  sizes,
  alphas,
  data,
  viewport,
  delta,
  spacingAmount = 2.4,
  orderAmount = 1
) {
  if (viewport.width <= 0 || viewport.height <= 0) return;
  const {
    base,
    work,
    offset,
    push,
    limit,
    speed,
    radius,
    selectionRadius,
    reservedSize,
    order,
    grain,
    active,
    next,
    priority,
    membership,
    visibility,
    eligible,
  } = spacing;
  const scaleX = viewport.width / data.width;
  const scaleY = viewport.height / data.height;
  const minScale = Math.min(scaleX, scaleY);

  const fresh = spacing.width !== viewport.width || spacing.height !== viewport.height;
  if (fresh) offset.fill(0);
  spacing.width = viewport.width;
  spacing.height = viewport.height;
  const viewportRoom = Math.min(1, viewport.width / 800);
  const preservePopulation = Boolean(spacing.preservePopulation && spacing.centerRadiiCSS);
  const boundaryNormals = preservePopulation ? spacing.normalsCSS : null;
  const boundaryDistances = boundaryNormals ? spacing.boundaryDistancesCSS : null;
  const mobility = preservePopulation ? (spacing.mobility ??= new Float64Array(sizes.length)) : null;
  const wantedAmount = clamp(spacingAmount, 0, 8);
  const wantedOrder = clamp(orderAmount, 0, 1);
  const retune = fresh || spacing.requestedAmount !== wantedAmount || spacing.populationMode !== preservePopulation;
  spacing.requestedAmount = wantedAmount;
  spacing.populationMode = preservePopulation;
  if (retune) membership.fill(0);
  spacing.amount ??= wantedAmount;
  spacing.regularity ??= wantedOrder;
  spacing.amount += (wantedAmount - spacing.amount) * (1 - Math.exp(-delta * 10));
  spacing.regularity += (wantedOrder - spacing.regularity) * (1 - Math.exp(-delta * 10));
  if (Math.abs(wantedOrder - spacing.regularity) < 0.001) spacing.regularity = wantedOrder;
  const amount = spacing.amount;
  const speedFollow = 1 - Math.exp(-delta * 12);
  // Keep solved spacing while the grains travel. A strong spring back to each
  // source position recreates its original clusters between staggered solves.
  const recovery = Math.exp(-delta * (preservePopulation ? 0.035 : 0.6));
  const releaseFollow = Math.exp(-delta * 8);
  let maxRadius = 0;
  let maxSelectionRadius = 0;
  let activeCount = 0;

  for (let i = 0; i < sizes.length; i += 1) {
    const k = i * 2;
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    // Measure the underlying trajectory, excluding the spacing correction.
    // Resizes, seed restores and offscreen recycling are not fast crossings.
    const stepX = base[k] - x * scaleX;
    const stepY = base[k + 1] - y * scaleY;
    const step = preservePopulation ? Math.sqrt(stepX * stepX + stepY * stepY) : Math.hypot(stepX, stepY);
    speed[i] =
      fresh || spacing.resuming || step > 80
        ? 0
        : lerp(speed[i], Math.min(160, step / Math.max(0.001, delta)), speedFollow);
    if (mobility) mobility[i] = (6 + speed[i]) ** 3;
    if (step > 80) {
      membership[i] = 0;
      offset[k] = 0;
      offset[k + 1] = 0;
    }
    base[k] = x * scaleX;
    base[k + 1] = y * scaleY;
    // Govern's grains are mostly subpixel. The homepage's 0.6–2.8px
    // size gate made Order almost inert here, especially in smaller previews.
    const neatness = 1;
    order[i] = spacing.regularity;
    limit[i] = 0;
    eligible[i] = 0;
    if (
      alphas[i] > 0.001 &&
      sizes[i] > 0.05 &&
      Math.abs(base[k]) < viewport.width / 2 + 10 &&
      Math.abs(base[k + 1]) < viewport.height / 2 + 10
    ) {
      const clearance = spacing.clearances[i];
      const room = lerp(8, 56, neatness) * viewportRoom;
      // Near a vacancy there is still room along its edge. Freezing these dots
      // leaves a crowded necklace which the rest of the solver cannot untangle.
      // Two local pitches keep the surface's tangent approximation local.
      const tangentRoom = boundaryDistances ? spacing.centerRadiiCSS[i] * 4 : 0;
      limit[i] = Math.min(room, Math.max(tangentRoom, clearance * 0.45, 0));
      eligible[i] = 1;
    } else {
      visibility[i] = 0;
    }
    // Order removes stable variation from neighbor distances.
    const variation = lerp(0.4 + grain[i] * 1.2, 1, order[i]);
    const gapScale = variation;
    // A shared distance rule spreads crowded patches into the available space.
    // Measuring each dot's old neighbours preserved the source's density valleys.
    // Density only changes the air between grains. Their drawn radii always
    // participate in exclusion, even in the darkest part of the artwork.
    if (preservePopulation) {
      // The local number density supplies center pitch independently of ink
      // radius. Keep every grain: dense ink may merge while centers stay even.
      radius[i] = Math.max(0, spacing.centerRadiiCSS[i]) * variation;
      membership[i] = 1;
      visibility[i] = 1;
      if (limit[i]) maxRadius = Math.max(maxRadius, radius[i]);
    } else {
      const packing = spacing.packing?.[i] ?? 1;
      const air = 0.06 + (0.35 + amount * 0.5) * packing;
      radius[i] = sizes[i] * 0.5 + air * gapScale * lerp(1, 1.45, order[i]);
      // Reserve entrants' intended size while their rendered size eases in.
      const admissionSize = Math.max(sizes[i], reservedSize[i]);
      selectionRadius[i] = admissionSize * 0.5 + 0.06 + (0.35 + wantedAmount * 0.5) * packing;
      maxRadius = Math.max(maxRadius, radius[i]);
      maxSelectionRadius = Math.max(maxSelectionRadius, selectionRadius[i]);
    }
    // Decay the stored correction itself: filtering this again through follow
    // made full Order retain a passing dot's wake for more than 20 seconds.
    // Keep recovery gentle enough to retain the field's even packing.
    offset[k] *= recovery;
    offset[k + 1] *= recovery;
    if (boundaryDistances) {
      const nx = boundaryNormals[k],
        ny = boundaryNormals[k + 1];
      const inward = offset[k] * nx + offset[k + 1] * ny + boundaryDistances[i];
      if (inward < 0) {
        offset[k] -= nx * inward;
        offset[k + 1] -= ny * inward;
      }
    }
    work[k] = base[k] + offset[k];
    work[k + 1] = base[k + 1] + offset[k + 1];
  }

  // Whole-pixel cells keep the grid stable and the neighbour search tight.
  // Sparse-edge radii must not force hundreds of dense-core candidates into
  // every query. Smaller cells use each bucket's actual radius to prune safely.
  const cell = preservePopulation ? 2 : Math.max(2, Math.ceil(maxRadius * 2));
  const padding = 80; // Includes the 56px correction cap and offstage entrants.
  const cols = Math.ceil((viewport.width + padding * 2) / cell);
  const rows = Math.ceil((viewport.height + padding * 2) / cell);
  if (spacing.heads.length !== cols * rows) spacing.heads = new Int32Array(cols * rows);
  const heads = spacing.heads;
  if (preservePopulation && spacing.headRadii?.length !== heads.length)
    spacing.headRadii = new Float32Array(heads.length);
  const headRadii = preservePopulation ? spacing.headRadii : null;
  const originX = viewport.width / 2 + padding;
  const originY = viewport.height / 2 + padding;

  // Make room by sampling the existing trajectories at the requested distance.
  // A deterministic priority avoids scan-direction bias. Reconsider survivors
  // only when the user retunes; new dots are admitted at their next entry.
  if (!preservePopulation && (retune || !spacing.selected)) {
    heads.fill(-1);
    for (let a = 0; a < priority.length; a += 1) {
      const i = priority[a];
      if (!eligible[i] || membership[i] !== 1) continue;
      const bucket = Math.floor((base[i * 2 + 1] + originY) / cell) * cols + Math.floor((base[i * 2] + originX) / cell);
      next[i] = heads[bucket];
      heads[bucket] = i;
    }
    for (let a = 0; a < priority.length; a += 1) {
      const i = priority[a];
      if (!eligible[i] || membership[i]) continue;
      const k = i * 2;
      const cx = Math.floor((base[k] + originX) / cell);
      const cy = Math.floor((base[k + 1] + originY) / cell);
      // Use the requested radius immediately for membership, while positions ease.
      const targetRadius = selectionRadius[i];
      let fits = true;
      const search = Math.ceil((targetRadius + maxSelectionRadius) / cell);
      for (let gy = Math.max(0, cy - search); fits && gy <= Math.min(rows - 1, cy + search); gy += 1) {
        for (let gx = Math.max(0, cx - search); fits && gx <= Math.min(cols - 1, cx + search); gx += 1) {
          for (let j = heads[gy * cols + gx]; j !== -1; j = next[j]) {
            const gap = targetRadius + selectionRadius[j];
            const dx = base[k] - base[j * 2];
            const dy = base[k + 1] - base[j * 2 + 1];
            if (dx * dx + dy * dy < gap * gap) {
              fits = false;
              break;
            }
          }
        }
      }
      membership[i] = fits ? 1 : 2;
      if (fits) {
        const bucket = cy * cols + cx;
        next[i] = heads[bucket];
        heads[bucket] = i;
      }
    }
    spacing.selected = true;
  }
  for (let i = 0; i < sizes.length; i += 1) {
    if (!preservePopulation) {
      const target = membership[i] === 2 ? 0 : 1;
      visibility[i] = fresh ? target : lerp(visibility[i], target, 1 - Math.exp(-delta * 8));
      alphas[i] *= visibility[i];
    }
    if (limit[i] && membership[i] === 1) active[activeCount++] = i;
    else if (preservePopulation && !limit[i]) {
      offset[i * 2] = 0;
      offset[i * 2 + 1] = 0;
    } else {
      // A user changing distance may release a dot with a non-zero correction.
      // Let that correction ease away with the fade, rather than snapping home.
      const k = i * 2;
      const release = releaseFollow * Math.min(1, limit[i] / Math.max(0.0001, Math.hypot(offset[k], offset[k + 1])));
      offset[k] *= release;
      offset[k + 1] *= release;
      positions[i * 3] += offset[k] / scaleX;
      positions[i * 3 + 1] += offset[k + 1] / scaleY;
    }
  }

  const neighbourReach = Math.ceil((maxRadius * 2) / cell);
  const passes = fresh || spacing.resuming ? (preservePopulation ? 8 : 24) : 1;
  // Solve interleaved point groups on live frames. Every grain still moves and
  // renders each frame; only the expensive neighbor queries rotate. Pair pushes
  // remain symmetric and the existing offset easing absorbs the stagger.
  const solveGroups = preservePopulation && !fresh && !spacing.resuming ? 4 : 1;
  const fuseLivePass = preservePopulation && passes === 1;
  const solvePhase = solveGroups === 1 ? 0 : (spacing.solvePhase ?? 0) % solveGroups;
  if (solveGroups > 1) spacing.solvePhase = (solvePhase + 1) % solveGroups;
  for (let pass = 0; pass < passes; pass += 1) {
    heads.fill(-1);
    if (headRadii) headRadii.fill(0);
    push.fill(0);
    for (let a = 0; a < activeCount; a += 1) {
      const i = active[a];
      const cx = Math.floor((work[i * 2] + originX) / cell);
      const cy = Math.floor((work[i * 2 + 1] + originY) / cell);
      const bucket = cy * cols + cx;
      next[i] = heads[bucket];
      heads[bucket] = i;
      if (headRadii) headRadii[bucket] = Math.max(headRadii[bucket], radius[i]);
    }
    for (let a = 0; a < activeCount; a += 1) {
      const i = active[a];
      if (solveGroups > 1 && i % solveGroups !== solvePhase) continue;
      const k = i * 2;
      const cx = Math.floor((work[k] + originX) / cell);
      const cy = Math.floor((work[k + 1] + originY) / cell);
      const queryRadius = radius[i] + maxRadius;
      const minRow = Math.max(
        0,
        preservePopulation ? Math.floor((work[k + 1] - queryRadius + originY) / cell) : cy - neighbourReach
      );
      const maxRow = Math.min(
        rows - 1,
        preservePopulation ? Math.floor((work[k + 1] + queryRadius + originY) / cell) : cy + neighbourReach
      );
      const minCol = Math.max(
        0,
        preservePopulation ? Math.floor((work[k] - queryRadius + originX) / cell) : cx - neighbourReach
      );
      const maxCol = Math.min(
        cols - 1,
        preservePopulation ? Math.floor((work[k] + queryRadius + originX) / cell) : cx + neighbourReach
      );
      for (let gy = minRow; gy <= maxRow; gy += 1) {
        const edgeY = gy * cell - originY;
        const bucketDY = Math.max(edgeY - work[k + 1], 0, work[k + 1] - edgeY - cell);
        for (let gx = minCol; gx <= maxCol; gx += 1) {
          const bucket = gy * cols + gx;
          if (heads[bucket] === -1) continue;
          if (headRadii) {
            const edgeX = gx * cell - originX;
            const bucketDX = Math.max(edgeX - work[k], 0, work[k] - edgeX - cell);
            const reach = radius[i] + headRadii[bucket];
            if (bucketDX * bucketDX + bucketDY * bucketDY >= reach * reach) continue;
          }
          for (let j = heads[bucket]; j !== -1; j = next[j]) {
            if (j <= i) continue;
            const q = j * 2;
            let dx = work[k] - work[q];
            let dy = work[k + 1] - work[q + 1];
            const gap = radius[i] + radius[j];
            const distance2 = dx * dx + dy * dy;
            if (distance2 >= gap * gap) continue;
            let distance = Math.sqrt(distance2);
            const overlap = gap - distance;
            if (distance < 0.0001) {
              const angle = hash01(i, j, 467) * Math.PI * 2;
              dx = Math.cos(angle);
              dy = Math.sin(angle);
              distance = 1;
            }
            const firmness = lerp(0.2, 0.48, (order[i] + order[j]) * 0.5);
            const amount = (overlap * firmness) / distance;
            // The faster dot yields most of the clearance instead of ploughing
            // a channel through slower neighbours. Equal speeds still share it.
            const mobilityI = mobility ? mobility[i] : (6 + speed[i]) ** 3;
            const mobilityJ = mobility ? mobility[j] : (6 + speed[j]) ** 3;
            const shareI = (2 * mobilityI) / (mobilityI + mobilityJ);
            const shareJ = 2 - shareI;
            push[k] += dx * amount * shareI;
            push[k + 1] += dy * amount * shareI;
            push[q] -= dx * amount * shareJ;
            push[q + 1] -= dy * amount * shareJ;
          }
        }
      }
    }
    if (!fuseLivePass)
      for (let a = 0; a < activeCount; a += 1) {
        const i = active[a];
        const k = i * 2;
        let dx = work[k] + push[k] - base[k];
        let dy = work[k + 1] + push[k + 1] - base[k + 1];
        if (boundaryDistances) {
          const nx = boundaryNormals[k],
            ny = boundaryNormals[k + 1];
          const inward = dx * nx + dy * ny + boundaryDistances[i];
          if (inward < 0) {
            dx -= nx * inward;
            dy -= ny * inward;
          }
        }
        const lengthSquared = dx * dx + dy * dy;
        const cap = preservePopulation
          ? lengthSquared > limit[i] * limit[i]
            ? limit[i] / Math.sqrt(lengthSquared)
            : 1
          : Math.min(1, limit[i] / Math.max(0.0001, Math.hypot(dx, dy)));
        work[k] = base[k] + dx * cap;
        work[k + 1] = base[k + 1] + dy * cap;
      }
  }

  const follow = fresh || spacing.resuming ? 1 : 1 - Math.exp(-delta * (preservePopulation ? 70 : 18));
  spacing.resuming = false;
  for (let a = 0; a < activeCount; a += 1) {
    const i = active[a];
    const k = i * 2;
    let targetX = work[k] - base[k];
    let targetY = work[k + 1] - base[k + 1];
    if (fuseLivePass) {
      targetX += push[k];
      targetY += push[k + 1];
      if (boundaryDistances) {
        const nx = boundaryNormals[k],
          ny = boundaryNormals[k + 1];
        const inward = targetX * nx + targetY * ny + boundaryDistances[i];
        if (inward < 0) {
          targetX -= nx * inward;
          targetY -= ny * inward;
        }
      }
      const squared = targetX * targetX + targetY * targetY;
      if (squared > limit[i] * limit[i]) {
        const cap = limit[i] / Math.sqrt(squared);
        targetX *= cap;
        targetY *= cap;
      }
    }
    const shiftX = (targetX - offset[k]) * follow;
    const shiftY = (targetY - offset[k + 1]) * follow;
    let stepCap = 1;
    if (!fresh) {
      const stepLimit = 12 * delta;
      if (preservePopulation) {
        const squared = shiftX * shiftX + shiftY * shiftY;
        if (squared > stepLimit * stepLimit) stepCap = stepLimit / Math.sqrt(squared);
      } else stepCap = Math.min(1, stepLimit / Math.max(0.0001, Math.hypot(shiftX, shiftY)));
    }
    offset[k] += shiftX * stepCap;
    offset[k + 1] += shiftY * stepCap;
    const offsetSquared = offset[k] * offset[k] + offset[k + 1] * offset[k + 1];
    const cap = preservePopulation
      ? offsetSquared > limit[i] * limit[i]
        ? limit[i] / Math.sqrt(offsetSquared)
        : 1
      : Math.min(1, limit[i] / Math.max(0.0001, Math.hypot(offset[k], offset[k + 1])));
    offset[k] *= cap;
    offset[k + 1] *= cap;
    positions[i * 3] += offset[k] / scaleX;
    positions[i * 3 + 1] += offset[k + 1] / scaleY;
  }
}
