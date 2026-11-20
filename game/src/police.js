// The wanted system: stars 0-5, earned by crime and shed by lying low.
// The police answer with cars (and, from two stars, officers on foot) who
// chase Lena and try to bust her. Getting busted costs cash and the car;
// getting wasted costs a hospital trip.

import { COP, WANTED } from './config.js';
import { makeCar } from './vehicles.js';
import { chance, pick, range } from './random.js';

export function createWanted() {
  const w = {
    stars: 0,
    lastCrime: -999,
    busted: 0,
    _decay: 0,
    add(n, why, now) {
      if (n <= 0) return;
      w.stars = Math.min(WANTED.max, w.stars + n);
      w.lastCrime = now;
      w._decay = 0;
    },
    /** Called every frame with the game clock. */
    update(G, dt) {
      // Stars fall when the heat is off: no crime for a while, and no police
      // close enough to keep the chase alive.
      if (w.stars > 0 && G.time - w.lastCrime > WANTED.decayDelay) {
        let near = false;
        for (const car of G.cars) {
          if (car.kind === 'police' && !car.dead && Math.hypot(car.x - G.player.x, car.y - G.player.y) < 420) {
            near = true;
            break;
          }
        }
        if (!near) {
          w._decay = (w._decay ?? 0) + dt;
          if (w._decay >= WANTED.decayInterval) {
            w._decay = 0;
            w.stars -= 1;
          }
        } else {
          w._decay = 0;
        }
      }
      maintainPolice(G, dt);
      updateFootCops(G, dt);
    },
  };
  return w;
}

function policeCarCount(stars) {
  return stars <= 0 ? 0 : stars === 1 ? 1 : stars === 2 ? 2 : stars === 3 ? 3 : stars === 4 ? 4 : COP.maxCars;
}

function footCopCount(stars) {
  return stars < 2 ? 0 : stars === 2 ? 1 : stars === 3 ? 2 : stars === 4 ? 4 : COP.maxFoot;
}

function spawnPoint(G) {
  // On a road, 550-750 units from the player, roughly behind the camera edge.
  const angle = range(G.rng, 0, Math.PI * 2);
  const dist = range(G.rng, 550, 750);
  const spot = G.city.nearestRoad(G.player.x + Math.cos(angle) * dist, G.player.y + Math.sin(angle) * dist);
  const fixed = G.city.collide(spot.x, spot.y, 20);
  return { x: fixed.x, y: fixed.y };
}

function maintainPolice(G, dt) {
  const want = policeCarCount(G.wanted.stars);
  let have = 0;
  for (const car of G.cars) if (car.kind === 'police' && !car.dead) have += 1;
  if (have < want) {
    const spot = spawnPoint(G);
    const car = makeCar(G.rng, 'police', spot.x, spot.y, range(G.rng, 0, Math.PI * 2));
    car.driver = 'npc';
    car.siren = true;
    G.cars.push(car);
  }
  // Clear the streets when the heat is off.
  if (G.wanted.stars === 0) {
    for (const car of G.cars) {
      if (car.kind === 'police' && !car.dead) {
        const d = Math.hypot(car.x - G.player.x, car.y - G.player.y);
        if (d > 900) car.dead = true;
      }
    }
    for (const cop of G.cops) {
      const d = Math.hypot(cop.x - G.player.x, cop.y - G.player.y);
      if (d > 700) cop.down = 999;
    }
    G.cops = G.cops.filter((c) => c.down < 900);
  }
}

function updateFootCops(G, dt) {
  const want = footCopCount(G.wanted.stars);
  let have = G.cops.filter((c) => c.down < 900).length;
  if (have < want) {
    const spot = spawnPoint(G);
    G.cops.push({
      x: spot.x, y: spot.y,
      angle: 0, speed: 0,
      down: 0, shootTimer: range(G.rng, 0.5, 1.5),
      walkPhase: 0,
    });
    have += 1;
  }
  const player = G.player;
  const playerSlow = player.inCar ? Math.abs(player.inCar.speed) < 60 : true;
  let busting = false;
  for (const cop of G.cops) {
    if (cop.down >= 900) continue;
    if (cop.down > 0) {
      cop.down -= dt;
      continue;
    }
    const dx = player.x - cop.x;
    const dy = player.y - cop.y;
    const d = Math.hypot(dx, dy);
    // Chase on foot, sliding along buildings.
    const wantAngle = Math.atan2(dy, dx);
    cop.angle = wantAngle;
    const fixed = G.city.collide(cop.x + Math.cos(wantAngle) * COP.footSpeed * dt, cop.y + Math.sin(wantAngle) * COP.footSpeed * dt, 11);
    cop.x = fixed.x;
    cop.y = fixed.y;
    cop.walkPhase += dt * 9;
    // Close and the player is slow: the bust meter fills.
    if (d < COP.bustRadius && playerSlow && player.health > 0) busting = true;
    // Armed from three stars: officers take pot-shots.
    if (G.wanted.stars >= 3 && d < 420 && d > 90) {
      cop.shootTimer -= dt;
      if (cop.shootTimer <= 0) {
        cop.shootTimer = range(G.rng, 1.2, 2.2);
        const spread = range(G.rng, -0.16, 0.16);
        G.bullets.push({
          x: cop.x, y: cop.y,
          vx: Math.cos(wantAngle + spread) * 620,
          vy: Math.sin(wantAngle + spread) * 620,
          life: 0.9, from: 'cop', damage: 8,
        });
        G.audio.shot();
      }
    }
  }
  const w = G.wanted;
  if (busting) {
    w.busted += dt;
    if (w.busted >= COP.bustTime) {
      w.busted = 0;
      G.mode = 'busted';
      G.audio.music(false);
      G.audio.engine(0, false);
      G.audio.siren(false);
    }
  } else {
    w.busted = Math.max(0, w.busted - dt * 1.5);
  }
}
