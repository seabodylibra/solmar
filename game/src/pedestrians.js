// Solmar's pedestrians: office workers, tourists and beachgoers who stroll
// the sidewalks, cross at the corners, and run when things get loud. A
// pedestrian is a small walker with a heading and a mood; gunfire, an
// explosion or a speeding car nearby flips them to flee, and getting hit
// puts them down for a while.

import { PEDS } from './config.js';
import { chance, pick, range } from './random.js';

const SHIRTS = ['#e8e8e8', '#f2a541', '#5aa2e8', '#e85a7a', '#7ac25a', '#c98ae8', '#e8d44d', '#4ac2c2'];

export function spawnPeds(city, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const spot = city.randomSidewalkPoint();
    peds.push({
      x: spot.x,
      y: spot.y,
      angle: range(rng, 0, Math.PI * 2),
      speed: 0,
      state: 'walk',
      target: null,
      color: pick(rng, SHIRTS),
      down: 0,
      walkPhase: range(rng, 0, 6),
      fleeX: 0,
      fleeY: 0,
    });
  }
  return peds;
}

function pickTarget(G, ped) {
  const spot = G.city.randomSidewalkPoint();
  ped.target = { x: spot.x, y: spot.y };
}

export function updatePeds(G, dt) {
  const danger = G.danger;
  for (const ped of G.peds) {
    if (ped.down > 0) {
      ped.down -= dt;
      if (ped.down <= 0) ped.state = 'walk';
      continue;
    }
    // Danger nearby: run away from it.
    if (danger && G.time < danger.until) {
      const dx = ped.x - danger.x;
      const dy = ped.y - danger.y;
      const d = Math.hypot(dx, dy);
      if (d < danger.radius) {
        ped.state = 'flee';
        ped.fleeX = danger.x;
        ped.fleeY = danger.y;
      }
    }
    if (ped.state === 'flee') {
      const dx = ped.x - ped.fleeX;
      const dy = ped.y - ped.fleeY;
      const d = Math.hypot(dx, dy) || 1;
      const want = Math.atan2(dy, dx);
      ped.angle = want;
      const fixed = G.city.collide(ped.x + Math.cos(want) * PEDS.run * dt, ped.y + Math.sin(want) * PEDS.run * dt, 10);
      ped.x = fixed.x;
      ped.y = fixed.y;
      ped.walkPhase += dt * 11;
      if (d > 320) ped.state = 'walk';
      continue;
    }
    // Stroll: walk to a sidewalk target, then pick another.
    if (!ped.target) pickTarget(G, ped);
    const dx = ped.target.x - ped.x;
    const dy = ped.target.y - ped.y;
    const d = Math.hypot(dx, dy);
    if (d < 18) {
      pickTarget(G, ped);
      continue;
    }
    const want = Math.atan2(dy, dx);
    // Ease the turn so they don't snap.
    let diff = want - ped.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    ped.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
    ped.speed = PEDS.walk;
    const fixed = G.city.collide(ped.x + Math.cos(ped.angle) * ped.speed * dt, ped.y + Math.sin(ped.angle) * ped.speed * dt, 10);
    if (fixed.x === ped.x && fixed.y === ped.y) {
      // Stuck on a wall: pick a fresh target.
      pickTarget(G, ped);
    }
    ped.x = fixed.x;
    ped.y = fixed.y;
    ped.walkPhase += dt * 7;
  }
  // Keep the streets populated: respawn the long-gone far away.
  if (G.peds.length < PEDS.count) {
    const spot = G.city.randomSidewalkPoint();
    G.peds.push({
      x: spot.x, y: spot.y,
      angle: range(G.rng, 0, Math.PI * 2),
      speed: 0, state: 'walk', target: null,
      color: pick(G.rng, SHIRTS), down: 0,
      walkPhase: range(G.rng, 0, 6), fleeX: 0, fleeY: 0,
    });
  }
}

/** A car running a pedestrian down: they go down, and the law notices. */
export function hitPedestrian(G, ped, byCar) {
  if (ped.down > 0) return;
  ped.down = 3.5;
  ped.state = 'down';
  G.effects.blood(ped.x, ped.y);
  if (byCar) {
    G.wanted.add(1, 'ran over a pedestrian', G.time);
    G.stats.pedsHit += 1;
  }
}
