// Lena Cruz on foot: WASD to walk (Shift to run), F to throw a punch,
// E to get in or out of a car, mouse to aim the pistol and click to fire.
// The player is a circle that slides along buildings; the camera and the
// HUD read her position, health, cash and wanted level from here.

import { CAR, PISTOL, PLAYER } from './config.js';
import { exitCar, nearestCar, stealCar } from './vehicles.js';

export function createPlayer(x, y) {
  return {
    x, y,
    angle: -Math.PI / 2,
    health: PLAYER.health,
    maxHealth: PLAYER.health,
    cash: 120,
    inCar: null,
    weapon: 'pistol',
    ammo: PISTOL.mag,
    reserve: PISTOL.reserveStart,
    reloading: 0,
    shootCooldown: 0,
    punchCooldown: 0,
    punchAnim: 0,
    hurtFlash: 0,
    wanted: 0,
    moving: false,
    running: false,
  };
}

export function updatePlayer(G, dt, input) {
  const p = G.player;
  if (p.inCar) return; // Driving is handled by vehicles.js.
  if (p.health <= 0) return;

  const move = input.move();
  const len = Math.hypot(move.x, move.y);
  p.moving = len > 0;
  p.running = input.run() && p.moving;
  if (p.moving) {
    const speed = p.running ? PLAYER.run : PLAYER.walk;
    const nx = move.x / len;
    const ny = move.y / len;
    p.angle = Math.atan2(ny, nx);
    const step = speed * dt;
    const fixed = G.city.collide(p.x + nx * step, p.y + ny * step, PLAYER.radius);
    // If the full diagonal is blocked, try sliding along each axis.
    if (fixed.x === p.x + nx * step && fixed.y === p.y + ny * step) {
      p.x = fixed.x;
      p.y = fixed.y;
    } else {
      const slideX = G.city.collide(p.x + nx * step, p.y, PLAYER.radius);
      const slideY = G.city.collide(p.x, p.y + ny * step, PLAYER.radius);
      if (slideX.x !== p.x) {
        p.x = slideX.x;
      } else if (slideY.y !== p.y) {
        p.y = slideY.y;
      }
    }
  }

  // Aim with the mouse while armed: she faces the cursor.
  if (p.weapon === 'pistol') {
    const mouse = input.mouse();
    const world = G.camera.screenToWorld(mouse.x, mouse.y, G.viewW, G.viewH);
    const dx = world.x - p.x;
    const dy = world.y - p.y;
    if (Math.hypot(dx, dy) > 24) p.angle = Math.atan2(dy, dx);
  }

  if (p.shootCooldown > 0) p.shootCooldown -= dt;
  if (p.punchCooldown > 0) p.punchCooldown -= dt;
  if (p.punchAnim > 0) p.punchAnim -= dt;
  if (p.hurtFlash > 0) p.hurtFlash -= dt;
  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0) {
      const need = PISTOL.mag - p.ammo;
      const take = Math.min(need, p.reserve);
      p.ammo += take;
      p.reserve -= take;
    }
  }

  // Slow health recovery when out of trouble.
  if (G.wanted.stars === 0 && p.health > 0 && p.health < p.maxHealth) {
    p.health = Math.min(p.maxHealth, p.health + 1.5 * dt);
  }
}

/** E near a car: get in (stealing it if it has a driver) or get out. */
export function tryEnterExit(G) {
  const p = G.player;
  if (p.inCar) {
    exitCar(G);
    return true;
  }
  const car = nearestCar(G.cars, p.x, p.y, 64);
  if (car) {
    stealCar(G, car);
    return true;
  }
  return false;
}

/** F: a punch in front of her — knocks pedestrians and cops down. */
export function tryPunch(G) {
  const p = G.player;
  if (p.punchCooldown > 0 || p.inCar) return false;
  p.punchCooldown = PLAYER.punchCooldown;
  p.punchAnim = 0.22;
  G.audio.punch();
  const reach = PLAYER.punchRange;
  const fx = Math.cos(p.angle);
  const fy = Math.sin(p.angle);
  let hit = false;
  const px = p.x + fx * reach;
  const py = p.y + fy * reach;
  for (const ped of G.peds) {
    if (ped.down > 0) continue;
    if (Math.hypot(ped.x - px, ped.y - py) < 30) {
      ped.down = 2.5;
      ped.state = 'down';
      G.effects.blood(ped.x, ped.y);
      hit = true;
    }
  }
  for (const cop of G.cops) {
    if (cop.down > 0) continue;
    if (Math.hypot(cop.x - px, cop.y - py) < 30) {
      cop.down = 3;
      G.effects.blood(cop.x, cop.y);
      G.wanted.add(1, 'hit a cop', G.time);
      hit = true;
    }
  }
  return hit;
}

export function hurtPlayer(G, amount) {
  const p = G.player;
  if (p.health <= 0) return;
  p.health -= amount;
  p.hurtFlash = 0.25;
  if (p.health <= 0) {
    p.health = 0;
    G.mode = 'wasted';
    G.audio.music(false);
    G.audio.engine(0, false);
    G.audio.siren(false);
  }
}
