// Solmar's city: a road grid, the blocks between the roads, the buildings in
// them, the beach and the ocean along the south edge. Everything is generated
// from the seed, so the same seed always builds the same city. This module
// owns the layout and the collision queries; render.js owns how it looks.

import { BEACH_Y, OCEAN_Y, PALETTE, ROAD, WORLD } from './config.js';
import { chance, int, pick, range } from './random.js';

const HALF_ROAD = ROAD.width / 2;
const SIDEWALK = 14;

/** The gaps between the road bands, as [start, end] intervals, on one axis. */
function gaps(centres, limit) {
  const out = [];
  let start = 0;
  for (const c of centres) {
    out.push([start, c - HALF_ROAD]);
    start = c + HALF_ROAD;
  }
  out.push([start, limit]);
  return out;
}

function makeBuildings(rng) {
  const buildings = [];
  const xs = gaps(ROAD.vertical, WORLD.w);
  const ys = gaps(ROAD.horizontal, WORLD.h);
  for (const [bx0, bx1] of xs) {
    for (const [by0, by1] of ys) {
      // The strip south of the boulevard is beach, not buildings.
      if (by0 >= BEACH_Y) continue;
      const bw = bx1 - bx0;
      const bh = by1 - by0;
      if (bw < 60 || bh < 60) continue;
      const split = bw > 170 && bh > 150 && chance(rng, 0.55);
      if (split) {
        // Two buildings side by side with an alley between them.
        const cut = bx0 + bw * range(rng, 0.42, 0.58);
        buildings.push(makeOne(rng, bx0 + SIDEWALK, by0 + SIDEWALK, cut - 8 - (bx0 + SIDEWALK), bh - SIDEWALK * 2));
        buildings.push(makeOne(rng, cut + 8, by0 + SIDEWALK, bx1 - SIDEWALK - (cut + 8), bh - SIDEWALK * 2));
      } else {
        buildings.push(makeOne(rng, bx0 + SIDEWALK, by0 + SIDEWALK, bw - SIDEWALK * 2, bh - SIDEWALK * 2));
      }
    }
  }
  return buildings;
}

function makeOne(rng, x, y, w, h) {
  return {
    x, y, w, h,
    color: pick(rng, PALETTE.building),
    roof: pick(rng, PALETTE.roof),
    height: int(rng, 6, 26),
    units: int(rng, 1, 4),
    shade: range(rng, 0.86, 1),
  };
}

function makePalms(rng) {
  const palms = [];
  // A row of palms along the beachfront boulevard, both sides of the road.
  for (let x = 220; x < WORLD.w - 100; x += range(rng, 90, 150)) {
    palms.push({ x, y: ROAD.horizontal[5] - HALF_ROAD - 16, s: range(rng, 0.9, 1.25), lean: range(rng, -0.14, 0.14) });
    if (chance(rng, 0.7)) palms.push({ x: x + 40, y: BEACH_Y + 34, s: range(rng, 0.9, 1.3), lean: range(rng, -0.2, 0.2) });
  }
  // A few palms scattered on downtown sidewalks.
  for (let i = 0; i < 26; i += 1) {
    const vx = pick(rng, ROAD.vertical);
    const hy = pick(rng, ROAD.horizontal.slice(0, 5));
    palms.push({
      x: vx + (chance(rng, 0.5) ? -1 : 1) * (HALF_ROAD + 12),
      y: hy + range(rng, -90, 90),
      s: range(rng, 0.8, 1.15),
      lean: range(rng, -0.12, 0.12),
    });
  }
  return palms;
}

function makeLamps(rng) {
  const lamps = [];
  for (const vx of ROAD.vertical) {
    for (const hy of ROAD.horizontal) {
      if (chance(rng, 0.6)) lamps.push({ x: vx - HALF_ROAD - 6, y: hy - HALF_ROAD - 6 });
      if (chance(rng, 0.4)) lamps.push({ x: vx + HALF_ROAD + 6, y: hy + HALF_ROAD + 6 });
    }
  }
  return lamps;
}

export function createCity(seed) {
  const rng = seed;
  const buildings = makeBuildings(rng);
  const palms = makePalms(rng);
  const lamps = makeLamps(rng);

  function onRoad(x, y) {
    for (const vx of ROAD.vertical) if (Math.abs(x - vx) <= HALF_ROAD) return true;
    for (const hy of ROAD.horizontal) if (Math.abs(y - hy) <= HALF_ROAD) return true;
    return false;
  }

  function onSand(x, y) {
    return y >= BEACH_Y && y < OCEAN_Y;
  }

  function inOcean(x, y) {
    return y >= OCEAN_Y;
  }

  function inBounds(x, y) {
    return x >= 8 && x <= WORLD.w - 8 && y >= 8 && y <= WORLD.h - 8;
  }

  /** True when a circle of radius r at (x, y) overlaps a building, the ocean, or the map edge. */
  function blocked(x, y, r) {
    if (!inBounds(x, y) || inOcean(x, y)) return true;
    for (let i = 0; i < buildings.length; i += 1) {
      const b = buildings[i];
      if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
    }
    return false;
  }

  /**
   * Push a circle out of whatever it overlaps, one axis at a time so it
   * slides along walls instead of sticking. Returns the corrected position.
   */
  function collide(x, y, r) {
    let nx = x;
    let ny = y;
    // Ocean and map edge: clamp.
    if (ny + r > OCEAN_Y) ny = OCEAN_Y - r;
    if (ny - r < 8) ny = 8 + r;
    if (nx - r < 8) nx = 8 + r;
    if (nx + r > WORLD.w - 8) nx = WORLD.w - 8 - r;
    for (let i = 0; i < buildings.length; i += 1) {
      const b = buildings[i];
      const cx = Math.max(b.x, Math.min(nx, b.x + b.w));
      const cy = Math.max(b.y, Math.min(ny, b.y + b.h));
      const dx = nx - cx;
      const dy = ny - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      if (d2 < 0.0001) {
        // Centre inside the building: push out along the shortest side.
        const pushLeft = nx - b.x + r;
        const pushRight = b.x + b.w - nx + r;
        const pushUp = ny - b.y + r;
        const pushDown = b.y + b.h - ny + r;
        const m = Math.min(pushLeft, pushRight, pushUp, pushDown);
        if (m === pushLeft) nx = b.x - r;
        else if (m === pushRight) nx = b.x + b.w + r;
        else if (m === pushUp) ny = b.y - r;
        else ny = b.y + b.h + r;
        continue;
      }
      const d = Math.sqrt(d2);
      const push = (r - d) / d;
      nx += dx * push;
      ny += dy * push;
    }
    return { x: nx, y: ny };
  }

  /** A random point on a road centreline, with the road's direction. */
  function randomRoadPoint() {
    if (chance(rng, 0.5)) {
      const vx = pick(rng, ROAD.vertical);
      const y = range(rng, 60, WORLD.h - 60);
      return { x: vx, y, angle: chance(rng, 0.5) ? Math.PI / 2 : -Math.PI / 2 };
    }
    const hy = pick(rng, ROAD.horizontal);
    const x = range(rng, 60, WORLD.w - 60);
    return { x, y: hy, angle: chance(rng, 0.5) ? 0 : Math.PI };
  }

  /** A random point on a sidewalk (just off a road). */
  function randomSidewalkPoint() {
    const vx = pick(rng, ROAD.vertical);
    const hy = pick(rng, ROAD.horizontal);
    const side = chance(rng, 0.5) ? -1 : 1;
    return {
      x: Math.max(30, Math.min(WORLD.w - 30, vx + side * (HALF_ROAD + 14))),
      y: Math.max(30, Math.min(BEACH_Y - 30, hy + range(rng, -110, 110))),
    };
  }

  /** The nearest road centreline point to (x, y). */
  function nearestRoad(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const vx of ROAD.vertical) {
      const d = Math.abs(x - vx);
      if (d < bestD) {
        bestD = d;
        best = { x: vx, y, vertical: true };
      }
    }
    for (const hy of ROAD.horizontal) {
      const d = Math.abs(y - hy);
      if (d < bestD) {
        bestD = d;
        best = { x, y: hy, vertical: false };
      }
    }
    return best;
  }

  return {
    w: WORLD.w,
    h: WORLD.h,
    buildings,
    palms,
    lamps,
    onRoad,
    onSand,
    inOcean,
    blocked,
    collide,
    randomRoadPoint,
    randomSidewalkPoint,
    nearestRoad,
  };
}
