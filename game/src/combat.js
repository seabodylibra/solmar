// Combat: the pistol, bullets, and pickups. The player aims with the mouse
// and fires with click or Space; officers shoot back from three stars. A
// bullet is a fast tracer that stops at the first thing it meets — a wall,
// a car, a pedestrian, a cop, or Lena herself. Pickups (health, ammo, cash)
// dot the city and respawn.

import { PISTOL } from './config.js';
import { hitPedestrian } from './pedestrians.js';
import { damageCar } from './vehicles.js';
import { hurtPlayer } from './player.js';
import { chance, pick, range } from './random.js';

const PICKUP_KINDS = ['health', 'ammo', 'cash', 'cash'];

export function spawnPickups(city, rng, count) {
  const pickups = [];
  for (let i = 0; i < count; i += 1) {
    const spot = city.randomSidewalkPoint();
    pickups.push({
      x: spot.x, y: spot.y,
      kind: pick(rng, PICKUP_KINDS),
      amount: 0,
      bob: range(rng, 0, 6),
    });
  }
  for (const p of pickups) {
    p.amount = p.kind === 'health' ? 30 : p.kind === 'ammo' ? 24 : 40;
  }
  return pickups;
}

function respawnPickup(G) {
  const spot = G.city.randomSidewalkPoint();
  const kind = pick(G.rng, PICKUP_KINDS);
  G.pickups.push({
    x: spot.x, y: spot.y, kind,
    amount: kind === 'health' ? 30 : kind === 'ammo' ? 24 : 40,
    bob: range(G.rng, 0, 6),
  });
}

function fireBullet(G, from, x, y, angle, damage) {
  G.bullets.push({
    x: x + Math.cos(angle) * 22,
    y: y + Math.sin(angle) * 22,
    vx: Math.cos(angle) * PISTOL.bulletSpeed,
    vy: Math.sin(angle) * PISTOL.bulletSpeed,
    life: PISTOL.range / PISTOL.bulletSpeed,
    from,
    damage,
  });
  G.effects.burst(x + Math.cos(angle) * 24, y + Math.sin(angle) * 24, {
    count: 3, color: ['#ffd94a', '#fff2b0'], speed: 60, size: 3, life: 0.12,
  });
  G.danger = { x, y, radius: 260, until: G.time + 1.2 };
}

export function tryShoot(G, input) {
  const p = G.player;
  if (p.inCar || p.health <= 0 || p.reloading > 0 || p.shootCooldown > 0) return false;
  const mouse = input.mouse();
  const wantFire = mouse.down || input.takeClick();
  if (!wantFire) return false;
  if (p.ammo <= 0) {
    // Dry click: reload if there is reserve.
    if (p.reserve > 0) p.reloading = PISTOL.reloadTime;
    else G.audio.denied();
    return false;
  }
  p.ammo -= 1;
  p.shootCooldown = PISTOL.cooldown;
  const world = G.camera.screenToWorld(mouse.x, mouse.y, G.viewW, G.viewH);
  const angle = Math.atan2(world.y - p.y, world.x - p.x);
  fireBullet(G, 'player', p.x, p.y, angle, PISTOL.damage);
  G.audio.shot();
  G.stats.shotsFired += 1;
  // Firing where the law can see it draws heat.
  let seen = false;
  for (const cop of G.cops) {
    if (cop.down < 900 && Math.hypot(cop.x - p.x, cop.y - p.y) < 460) {
      seen = true;
      break;
    }
  }
  if (!seen) {
    for (const car of G.cars) {
      if (car.kind === 'police' && !car.dead && Math.hypot(car.x - p.x, car.y - p.y) < 460) {
        seen = true;
        break;
      }
    }
  }
  if (seen) G.wanted.add(1, 'fired a gun in public', G.time);
  return true;
}

export function tryReload(G) {
  const p = G.player;
  if (p.inCar || p.reloading > 0 || p.ammo >= PISTOL.mag || p.reserve <= 0) return false;
  p.reloading = PISTOL.reloadTime;
  return true;
}

export function updateCombat(G, dt) {
  // Bullets.
  for (let i = G.bullets.length - 1; i >= 0; i -= 1) {
    const b = G.bullets[i];
    b.life -= dt;
    const nx = b.x + b.vx * dt;
    const ny = b.y + b.vy * dt;
    let dead = b.life <= 0;
    if (!dead && G.city.blocked(nx, ny, 2)) {
      G.effects.burst(nx, ny, { count: 4, color: ['#ffd94a', '#c8c8c8'], speed: 90, size: 2, life: 0.25 });
      dead = true;
    }
    if (!dead) {
      b.x = nx;
      b.y = ny;
      if (b.from === 'player') {
        // Pedestrians and cops.
        for (const ped of G.peds) {
          if (ped.down > 0) continue;
          if (Math.hypot(ped.x - b.x, ped.y - b.y) < 14) {
            hitPedestrian(G, ped, false);
            G.wanted.add(1, 'shot a pedestrian', G.time);
            dead = true;
            break;
          }
        }
        if (!dead) {
          for (const cop of G.cops) {
            if (cop.down > 0 || cop.down >= 900) continue;
            if (Math.hypot(cop.x - b.x, cop.y - b.y) < 14) {
              cop.down = 3;
              G.effects.blood(cop.x, cop.y);
              G.wanted.add(2, 'shot a cop', G.time);
              dead = true;
              break;
            }
          }
        }
        if (!dead) {
          for (const car of G.cars) {
            if (car.dead) continue;
            if (Math.hypot(car.x - b.x, car.y - b.y) < 20) {
              damageCar(G, car, b.damage, true);
              dead = true;
              break;
            }
          }
        }
      } else if (b.from === 'cop') {
        const p = G.player;
        if (!p.inCar && p.health > 0 && Math.hypot(p.x - b.x, p.y - b.y) < 14) {
          hurtPlayer(G, b.damage);
          dead = true;
        } else if (p.inCar && Math.hypot(p.inCar.x - b.x, p.inCar.y - b.y) < 20) {
          damageCar(G, p.inCar, b.damage * 0.4, false);
          dead = true;
        }
      }
    }
    if (dead) G.bullets.splice(i, 1);
  }

  // Pickups: bob, and get collected by the player (on foot or driving over).
  for (let i = G.pickups.length - 1; i >= 0; i -= 1) {
    const pk = G.pickups[i];
    pk.bob += dt * 3;
    const d = Math.hypot(G.player.x - pk.x, G.player.y - pk.y);
    if (d < 30) {
      const p = G.player;
      if (pk.kind === 'health' && p.health < p.maxHealth) {
        p.health = Math.min(p.maxHealth, p.health + pk.amount);
      } else if (pk.kind === 'ammo') {
        p.reserve += pk.amount;
      } else if (pk.kind === 'cash') {
        p.cash += pk.amount;
      } else {
        continue;
      }
      G.audio.pickup();
      G.effects.burst(pk.x, pk.y, { count: 8, color: ['#7be07b', '#ffd94a'], speed: 80, size: 3, life: 0.4 });
      G.pickups.splice(i, 1);
      respawnPickup(G);
    }
  }
}
