// Combat: the pistol (hitscan with a short range and a little spread), fists, health
// and ammo pickups scattered around Solmar, and the damage numbers the rest of the
// game listens to. Shooting or punching a civilian or a cop raises the wanted level.

import * as THREE from 'three';
import { PLAYER, WANTED } from './config.js';
import { knockDown } from './pedestrians.js';

const GUN_RANGE = 38;
const GUN_DAMAGE = 34;
// Aim cone: a target counts as "in the line of fire" when its direction from the
// player is within ~20 degrees of the facing (cos 20° ≈ 0.94).
const AIM_CONE_COS = 0.94;
// A punch only lands on someone roughly in front: within ~60 degrees (cos 60° = 0.5).
const PUNCH_CONE_COS = 0.5;
// Pickup values and how long a taken pickup stays gone before it respawns.
const AMMO_PICKUP = 24;
const HEALTH_PICKUP = 40;
const PICKUP_RESPAWN_SECS = 45;

export function createPickups(scene, rng) {
  const pickups = [];
  const spots = [
    [60, -60], [-120, 120], [180, -180], [-60, 240], [240, 60],
    [-240, -120], [120, 180], [0, -240], [-180, 0], [200, 240],
  ];
  for (let i = 0; i < spots.length; i += 1) {
    const kind = i % 2 === 0 ? 'ammo' : 'health';
    const color = kind === 'ammo' ? 0xffd23e : 0x2ecc71;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.9, 0.9),
      new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.35 }),
    );
    mesh.position.set(spots[i][0], 0.7, spots[i][1]);
    mesh.castShadow = true;
    scene.add(mesh);
    pickups.push({ kind, mesh, pos: mesh.position, taken: false, respawnAt: 0 });
  }
  return pickups;
}

export function updatePickups(pickups, dt, game, time) {
  const playerPos = game.player.inCar ? game.player.inCar.pos : game.player.pos;
  for (const p of pickups) {
    if (p.taken) {
      if (time > p.respawnAt) {
        p.taken = false;
        p.mesh.visible = true;
      }
      continue;
    }
    p.mesh.rotation.y += dt * 1.5;
    p.mesh.position.y = 0.7 + Math.sin(time * 2 + p.pos.x) * 0.12;
    const d = Math.hypot(p.pos.x - playerPos.x, p.pos.z - playerPos.z);
    if (d < 2.2 && !game.player.inCar) {
      p.taken = true;
      p.mesh.visible = false;
      p.respawnAt = time + PICKUP_RESPAWN_SECS;
      if (p.kind === 'ammo') {
        game.ammo += AMMO_PICKUP;
        game.toast(`AMMO +${AMMO_PICKUP}`, 2);
      } else {
        game.player.health = Math.min(PLAYER.maxHealth, game.player.health + HEALTH_PICKUP);
        game.toast(`HEALTH +${HEALTH_PICKUP}`, 2);
      }
      game.audio.pickup();
    }
  }
}

/** Fire the pistol from the player's facing. Returns 'hit' | 'miss' | 'noammo'. */
export function shoot(game, world) {
  if (game.ammo <= 0) {
    game.audio.denied();
    return 'noammo';
  }
  game.ammo -= 1;
  game.audio.gunshot();
  const player = game.player;
  const ox = player.pos.x;
  const oz = player.pos.z;
  const dirX = Math.sin(player.heading);
  const dirZ = Math.cos(player.heading);
  const muzzle = new THREE.Vector3(ox + dirX * 1.2, 1.4, oz + dirZ * 1.2);
  world.effects.burst(muzzle, 0xffd23e, 6, 4, 0.15, 0);
  world.effects.flash(muzzle, 0xffc861, 0.08);
  // Nearest living thing roughly in the line of fire.
  let best = null;
  let bestD = GUN_RANGE;
  const consider = (x, z, obj, kind) => {
    const dx = x - ox;
    const dz = z - oz;
    const d = Math.hypot(dx, dz);
    if (d > bestD || d < 0.5) return;
    const along = (dx * dirX + dz * dirZ) / d;
    if (along < AIM_CONE_COS) return; // outside the ~20 degree aim cone
    bestD = d;
    best = { obj, kind };
  };
  for (const ped of world.peds) if (ped.state !== 'down') consider(ped.pos.x, ped.pos.z, ped, 'ped');
  for (const cop of world.police.cops) if (cop.health > 0) consider(cop.pos.x, cop.pos.z, cop, 'cop');
  for (const car of world.cars) {
    if (car === player.inCar || car.health <= 0) continue;
    consider(car.pos.x, car.pos.z, car, 'car');
  }
  if (!best) return 'miss';
  const hitPos = new THREE.Vector3(ox + dirX * bestD, 1.1, oz + dirZ * bestD);
  world.effects.burst(hitPos, 0xff5533, 10, 5, 0.3, 2);
  if (best.kind === 'ped') {
    knockDown(best.obj);
    game.addCrime(WANTED.hitPed, 'pedestrian down');
    game.toast('You hit a pedestrian!', 2);
  } else if (best.kind === 'cop') {
    best.obj.health -= GUN_DAMAGE;
    if (best.obj.health <= 0) {
      best.obj.group.rotation.x = -Math.PI / 2;
      best.obj.group.position.y = 0.25;
      game.addCrime(WANTED.killCop, 'cop down');
      game.toast('You took down a cop!', 2);
    }
  } else if (best.kind === 'car') {
    best.obj.health -= GUN_DAMAGE;
    if (best.obj.health <= 0) world.explodeCar?.(best.obj);
  }
  return 'hit';
}

/** Punch the nearest person in front of the player. Returns true if it connected. */
export function punch(game, world) {
  const player = game.player;
  if (player.punchCooldown > 0) return false;
  player.punchCooldown = 0.45;
  game.audio.punch();
  const dirX = Math.sin(player.heading);
  const dirZ = Math.cos(player.heading);
  let best = null;
  let bestD = PLAYER.punchRange;
  const consider = (x, z, obj, kind) => {
    const dx = x - player.pos.x;
    const dz = z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > bestD) return;
    if ((dx * dirX + dz * dirZ) / Math.max(d, 0.01) < PUNCH_CONE_COS) return;
    bestD = d;
    best = { obj, kind };
  };
  for (const ped of world.peds) if (ped.state !== 'down') consider(ped.pos.x, ped.pos.z, ped, 'ped');
  for (const cop of world.police.cops) if (cop.health > 0) consider(cop.pos.x, cop.pos.z, cop, 'cop');
  if (!best) return false;
  const hitPos = new THREE.Vector3(best.obj.pos.x, 1.2, best.obj.pos.z);
  world.effects.burst(hitPos, 0xffffff, 8, 4, 0.25, 2);
  if (best.kind === 'ped') {
    knockDown(best.obj);
    game.addCrime(WANTED.hitPed, 'assault');
  } else {
    best.obj.health -= PLAYER.punchDamage;
    if (best.obj.health <= 0) {
      best.obj.group.rotation.x = -Math.PI / 2;
      best.obj.group.position.y = 0.25;
      game.addCrime(WANTED.killCop, 'cop down');
    }
  }
  return true;
}
