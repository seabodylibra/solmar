// Cars: arcade driving, traffic that follows the road grid, parked cars to
// steal, and the police chase. A car is a heading plus a velocity vector;
// the engine pushes it forward, the tyres kill sideways slide (unless the
// handbrake is down, which is how you drift), and the body collides as a
// circle. Traffic drives from intersection to intersection on the grid.

import { CAR, PALETTE, ROAD, TRAFFIC, WANTED } from './config.js';
import { chance, int, pick, range } from './random.js';

const KINDS = {
  sedan: { max: CAR.maxSpeed, color: PALETTE.sedan, accel: 1 },
  taxi: { max: CAR.maxSpeed * 0.95, color: PALETTE.taxi, accel: 1 },
  sports: { max: CAR.sportsMax, color: PALETTE.sports, accel: 1.35 },
  van: { max: CAR.maxSpeed * 0.85, color: PALETTE.van, accel: 0.9 },
  truck: { max: CAR.truckMax, color: PALETTE.truck, accel: 0.8 },
  police: { max: CAR.maxSpeed * 1.08, color: PALETTE.police, accel: 1.15 },
};

let nextId = 1;

export function makeCar(rng, kind, x, y, angle) {
  const spec = KINDS[kind];
  return {
    id: nextId,
    kind,
    x, y,
    angle,
    vx: 0,
    vy: 0,
    speed: 0,
    steer: 0,
    color: kind === 'sedan' || kind === 'taxi' ? pick(rng, ['#5a7a9a', '#7a9a5a', '#9a5a5a', '#c8b060']) : spec.color,
    maxSpeed: spec.max * range(rng, 0.92, 1.05),
    accel: spec.accel,
    health: CAR.health,
    driver: null, // 'player' | 'npc' | null (parked)
    cruise: TRAFFIC.speed + range(rng, -TRAFFIC.speedJitter, TRAFFIC.speedJitter),
    target: null, // traffic waypoint {x, y}
    lane: chance(rng, 0.5) ? 13 : -13,
    vi: 0,
    hi: 0,
    smokeTimer: 0,
    dead: false,
    siren: false,
    scrapeCooldown: 0,
  };
}

/** The grid intersections, as {x, y} points. */
function intersections() {
  const out = [];
  for (let hi = 0; hi < ROAD.horizontal.length; hi += 1) {
    for (let vi = 0; vi < ROAD.vertical.length; vi += 1) {
      out.push({ x: ROAD.vertical[vi], y: ROAD.horizontal[hi], vi, hi });
    }
  }
  return out;
}

function nearestIntersection(x, y) {
  let best = null;
  let bestD = Infinity;
  for (let hi = 0; hi < ROAD.horizontal.length; hi += 1) {
    for (let vi = 0; vi < ROAD.vertical.length; vi += 1) {
      const dx = x - ROAD.vertical[vi];
      const dy = y - ROAD.horizontal[hi];
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = { x: ROAD.vertical[vi], y: ROAD.horizontal[hi], vi, hi };
      }
    }
  }
  return best;
}

function nextIntersection(rng, car) {
  const options = [];
  if (car.vi > 0) options.push({ vi: car.vi - 1, hi: car.hi });
  if (car.vi < ROAD.vertical.length - 1) options.push({ vi: car.vi + 1, hi: car.hi });
  if (car.hi > 0) options.push({ vi: car.vi, hi: car.hi - 1 });
  if (car.hi < ROAD.horizontal.length - 1) options.push({ vi: car.vi, hi: car.hi + 1 });
  const next = pick(rng, options);
  car.vi = next.vi;
  car.hi = next.hi;
  // Right-hand traffic: offset the target point to the car's lane.
  const from = { x: car.x, y: car.y };
  const to = { x: ROAD.vertical[next.vi], y: ROAD.horizontal[next.hi] };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  // Perpendicular (right side of travel).
  const px = -dy / len;
  const py = dx / len;
  car.target = { x: to.x + px * car.lane, y: to.y + py * car.lane };
}

export function spawnTraffic(city, rng, count) {
  const cars = [];
  const spots = intersections();
  for (let i = 0; i < count; i += 1) {
    const kind = pick(rng, ['sedan', 'sedan', 'taxi', 'van', 'truck', 'sports']);
    const spot = pick(rng, spots);
    const car = makeCar(rng, kind, spot.x + range(rng, -30, 30), spot.y + range(rng, -30, 30), range(rng, 0, Math.PI * 2));
    car.driver = 'npc';
    const near = nearestIntersection(car.x, car.y);
    car.vi = near.vi;
    car.hi = near.hi;
    nextIntersection(rng, car);
    cars.push(car);
  }
  return cars;
}

export function spawnParked(city, rng, count) {
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const kind = pick(rng, ['sedan', 'sports', 'van', 'taxi']);
    const vertical = chance(rng, 0.5);
    let x;
    let y;
    let angle;
    if (vertical) {
      const vx = pick(rng, ROAD.vertical);
      const side = chance(rng, 0.5) ? -1 : 1;
      x = vx + side * (ROAD.width / 2 - 16);
      y = range(rng, 200, 1700);
      angle = chance(rng, 0.5) ? Math.PI / 2 : -Math.PI / 2;
    } else {
      const hy = pick(rng, ROAD.horizontal);
      const side = chance(rng, 0.5) ? -1 : 1;
      x = range(rng, 200, 2400);
      y = hy + side * (ROAD.width / 2 - 16);
      angle = chance(rng, 0.5) ? 0 : Math.PI;
    }
    const car = makeCar(rng, kind, x, y, angle);
    car.driver = null;
    cars.push(car);
  }
  return cars;
}

export function nearestCar(cars, x, y, maxDist) {
  let best = null;
  let bestD = maxDist * maxDist;
  for (const car of cars) {
    if (car.dead) continue;
    const dx = car.x - x;
    const dy = car.y - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function turnToward(angle, target, maxStep) {
  let diff = target - angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return angle + Math.max(-maxStep, Math.min(maxStep, diff));
}

/** Shared step: apply a car's velocity, collide with buildings and the map. */
function integrate(G, car, dt) {
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.scrapeCooldown = Math.max(0, (car.scrapeCooldown || 0) - dt);
  const fixed = G.city.collide(car.x, car.y, CAR.radius);
  if (fixed.x !== car.x || fixed.y !== car.y) {
    // Scraped a wall: lose some speed. The dent only counts once per
    // half-second, so holding the gas against a wall does not shred the
    // car frame by frame.
    const impact = Math.hypot(car.vx, car.vy);
    car.x = fixed.x;
    car.y = fixed.y;
    car.vx *= 0.55;
    car.vy *= 0.55;
    if (impact > 220 && car.scrapeCooldown <= 0) {
      damageCar(G, car, (impact - 220) * 0.03, false);
      car.scrapeCooldown = 0.5;
    }
  }
  car.speed = Math.hypot(car.vx, car.vy);
}

/** Player driving: W/S accelerate and brake, A/D steer, Space handbrakes. */
export function updatePlayerCar(G, dt, input) {
  const car = G.player.inCar;
  if (!car || car.dead) return;
  const move = input.move();
  const forward = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
  const right = { x: -Math.sin(car.angle), y: Math.cos(car.angle) };
  let vF = car.vx * forward.x + car.vy * forward.y;
  let vS = car.vx * right.x + car.vy * right.y;

  if (move.y < 0) vF += CAR.accel * car.accel * dt;
  if (move.y > 0) {
    if (vF > 10) vF -= CAR.brake * dt;
    else vF -= CAR.accel * 0.55 * dt;
  }
  // Rolling drag.
  vF -= vF * CAR.drag * dt * 0.6;
  // Top speed and reverse cap.
  if (vF > car.maxSpeed) vF = car.maxSpeed;
  if (vF < -CAR.reverseMax) vF = -CAR.reverseMax;

  const handbrake = input.brake();
  const steerInput = move.x;
  const steerTarget = steerInput * 0.55;
  car.steer += (steerTarget - car.steer) * Math.min(1, 10 * dt);
  const grip = handbrake ? CAR.handbrakeGrip : CAR.grip;
  // Steering bites harder the faster you go, up to a point.
  const turn = car.steer * (vF / 95) * (handbrake ? 1.5 : 1);
  car.angle += turn * dt;
  // Recompute the basis after the turn, then kill sideways slide by grip.
  const f2 = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
  const r2 = { x: -Math.sin(car.angle), y: Math.cos(car.angle) };
  vS *= Math.exp(-grip * dt);
  car.vx = f2.x * vF + r2.x * vS;
  car.vy = f2.y * vF + r2.y * vS;

  integrate(G, car, dt);

  // Skid marks and tyre smoke when sliding hard.
  const slide = Math.abs(vS);
  if ((slide > 90 || handbrake) && Math.abs(vF) > 60) {
    G.effects.skid(car.x - f2.x * 14, car.y - f2.y * 14, car.angle);
    if (Math.random() < 0.35) {
      G.effects.burst(car.x - f2.x * 18, car.y - f2.y * 18, { count: 1, color: '#c8c8c8', speed: 20, size: 5, life: 0.7 });
    }
  }
  if (car.health < 35) {
    car.smokeTimer -= dt;
    if (car.smokeTimer <= 0) {
      car.smokeTimer = 0.09;
      G.effects.smoke(car.x, car.y - 6);
    }
  }
  G.player.x = car.x;
  G.player.y = car.y;
  G.player.angle = car.angle;
}

/** Traffic: drive to the next intersection, turn there, slow for the car ahead. */
export function updateTraffic(G, dt) {
  for (const car of G.cars) {
    if (car.dead || car.driver !== 'npc' || car.kind === 'police') continue;
    if (!car.target) {
      const near = nearestIntersection(car.x, car.y);
      car.vi = near.vi;
      car.hi = near.hi;
      nextIntersection(G.rng, car);
    }
    const dx = car.target.x - car.x;
    const dy = car.target.y - car.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 30) {
      nextIntersection(G.rng, car);
      continue;
    }
    const wantAngle = Math.atan2(dy, dx);
    car.angle = turnToward(car.angle, wantAngle, 2.4 * dt);
    // Slow down for a car directly ahead.
    let ahead = false;
    for (const other of G.cars) {
      if (other === car || other.dead) continue;
      const ox = other.x - car.x;
      const oy = other.y - car.y;
      const forward = ox * Math.cos(car.angle) + oy * Math.sin(car.angle);
      const side = Math.abs(-ox * Math.sin(car.angle) + oy * Math.cos(car.angle));
      if (forward > 0 && forward < 64 && side < 26) {
        ahead = true;
        break;
      }
    }
    const targetSpeed = ahead ? 26 : car.cruise;
    car.speed += Math.max(-260 * dt, Math.min(140 * dt, targetSpeed - car.speed));
    car.vx = Math.cos(car.angle) * car.speed;
    car.vy = Math.sin(car.angle) * car.speed;
    integrate(G, car, dt);
  }
}

/** Police cars: chase the player directly, ramming to stop them. */
export function updatePoliceCars(G, dt) {
  for (const car of G.cars) {
    if (car.dead || car.kind !== 'police') continue;
    const dx = G.player.x - car.x;
    const dy = G.player.y - car.y;
    const dist = Math.hypot(dx, dy);
    const wantAngle = Math.atan2(dy, dx);
    car.angle = turnToward(car.angle, wantAngle, 3.1 * dt);
    const targetSpeed = dist > 320 ? car.maxSpeed : car.maxSpeed * 0.82;
    car.speed += Math.max(-320 * dt, Math.min(300 * dt, targetSpeed - car.speed));
    car.vx = Math.cos(car.angle) * car.speed;
    car.vy = Math.sin(car.angle) * car.speed;
    integrate(G, car, dt);
    if (car.health < 35) {
      car.smokeTimer -= dt;
      if (car.smokeTimer <= 0) {
        car.smokeTimer = 0.09;
        G.effects.smoke(car.x, car.y - 6);
      }
    }
  }
}

/** Push overlapping cars apart and damage them on a hard hit. */
export function collideCars(G) {
  const cars = G.cars;
  for (let i = 0; i < cars.length; i += 1) {
    const a = cars[i];
    if (a.dead) continue;
    for (let j = i + 1; j < cars.length; j += 1) {
      const b = cars[j];
      if (b.dead) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = CAR.radius * 2 - 4;
      if (d >= min || d < 0.01) continue;
      const push = (min - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const rel = Math.abs((a.vx - b.vx) * nx + (a.vy - b.vy) * ny);
      if (rel > 140) {
        damageCar(G, a, rel * 0.02, false);
        damageCar(G, b, rel * 0.02, false);
        if (rel > 260) {
          G.audio.crash();
          G.effects.burst((a.x + b.x) / 2, (a.y + b.y) / 2, { count: 8, color: ['#ffd94a', '#c8c8c8'], speed: 120, size: 3, life: 0.4 });
        }
      }
      // Swap a little velocity so they don't stick.
      const avx = a.vx;
      const avy = a.vy;
      a.vx = a.vx * 0.7 + b.vx * 0.3;
      a.vy = a.vy * 0.7 + b.vy * 0.3;
      b.vx = b.vx * 0.7 + avx * 0.3;
      b.vy = b.vy * 0.7 + avy * 0.3;
    }
  }
}

export function damageCar(G, car, amount, byPlayer) {
  if (car.dead) return;
  car.health -= amount;
  if (car.health <= 0) explodeCar(G, car, byPlayer);
}

export function explodeCar(G, car, byPlayer) {
  if (car.dead) return;
  car.dead = true;
  car.health = 0;
  G.effects.flame(car.x, car.y);
  G.effects.burst(car.x, car.y, { count: 26, color: ['#ff9a3c', '#ff5a2a', '#3a3a3a'], speed: 260, size: 6, life: 0.9 });
  G.audio.crash();
  if (G.player.inCar === car) {
    G.player.inCar = null;
    G.player.health -= 25;
    G.player.x = car.x + 30;
    G.player.y = car.y;
  }
  if (byPlayer) G.stats.explosions += 1;
  // Chain: nearby cars take damage.
  for (const other of G.cars) {
    if (other === car || other.dead) continue;
    const d = Math.hypot(other.x - car.x, other.y - car.y);
    if (d < 120) damageCar(G, other, 45, false);
  }
  // Remove the wreck after a moment (handled by world cleanup).
  car.removeAt = G.time + 1.2;
}

export function stealCar(G, car) {
  const player = G.player;
  if (car.driver === 'npc') {
    // Yank the driver out: they become a fleeing pedestrian.
    G.peds.push({
      x: car.x - Math.cos(car.angle) * 26,
      y: car.y - Math.sin(car.angle) * 26,
      angle: car.angle + Math.PI / 2,
      speed: 0,
      state: 'flee',
      fleeX: car.x,
      fleeY: car.y,
      color: '#e8d44d',
      down: 0,
      walkPhase: Math.random() * 6,
    });
    G.wanted.add(WANTED.steal, 'stole a car', G.time);
  }
  car.driver = 'player';
  player.inCar = car;
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  G.stats.carsStolen += 1;
}

export function exitCar(G) {
  const player = G.player;
  const car = player.inCar;
  if (!car) return;
  car.driver = null;
  player.inCar = null;
  // Step out on the driver's side.
  const px = car.x + -Math.sin(car.angle) * 26;
  const py = car.y + Math.cos(car.angle) * 26;
  const fixed = G.city.collide(px, py, 13);
  player.x = fixed.x;
  player.y = fixed.y;
  player.angle = car.angle;
  car.vx *= 0.2;
  car.vy *= 0.2;
  car.speed *= 0.2;
}
