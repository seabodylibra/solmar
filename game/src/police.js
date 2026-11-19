// The Solmar PD: a wanted level from 0 to 5 stars, police cruisers that chase and ram,
// and foot cops who run the player down and make the bust. Stars rise with crimes and
// fall when the player stays clean and out of sight.
// Spawns use the world's seeded RNG, never Math.random: a seeded world must play
// out the same way every time, or the staged screenshot scenes would not repeat.

import * as THREE from 'three';
import { WANTED, POLICE_MAX_CARS } from './config.js';
import { createCar, steerToward, TRAFFIC_COLORS } from './vehicles.js';

// A foot cop's punch: damage per hit, and the seconds between swings.
const COP_PUNCH_DAMAGE = 9;
const COP_PUNCH_INTERVAL = 0.9;
// Seconds a cop must stay within arm's reach before the bust lands.
const BUST_TIME = 2.5;
// Foot-cop chase speed, and health a cruiser grinds off the player's car per
// second while ramming it.
const COP_RUN_SPEED = 5.6;
const RAM_DAMAGE_PER_SEC = 12;

function buildCopMesh() {
  const group = new THREE.Group();
  const navy = new THREE.MeshLambertMaterial({ color: 0x1a2f4a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe0ac69 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.9, 8), navy);
  body.position.y = 0.95;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
  head.position.y = 1.62;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 10), navy);
  cap.position.y = 1.8;
  group.add(cap);
  const legs = [];
  const legMat = new THREE.MeshLambertMaterial({ color: 0x141c26 });
  for (const x of [-0.11, 0.11]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.18), legMat);
    leg.position.set(x, 0.28, 0);
    group.add(leg);
    legs.push(leg);
  }
  return { group, legs };
}

export function createPolice(scene) {
  return {
    stars: 0,
    lastCrimeAt: -999,
    decayAt: 0,
    cars: [], // police cruisers
    cops: [], // foot cops {group, legs, pos, heading, health, punchAt, walkPhase}
    bustTimer: 0,
    scene,
  };
}

export function addWanted(police, amount, time) {
  const before = police.stars;
  police.stars = Math.min(WANTED.max, police.stars + amount);
  police.lastCrimeAt = time;
  police.decayAt = time + WANTED.decayDelay;
  return police.stars > before;
}

function spawnPoliceCar(police, world, target) {
  const angle = world.rng.next() * Math.PI * 2;
  const x = Math.max(-280, Math.min(280, target.x + Math.sin(angle) * 95));
  const z = Math.max(-280, Math.min(320, target.z + Math.cos(angle) * 95));
  const car = createCar(police.scene, 'police', 0xf2f2f2, x, z, Math.atan2(target.x - x, target.z - z));
  car.targetSpeed = 30;
  police.cars.push(car);
  world.cars.push(car);
  return car;
}

function spawnCop(police, world, target) {
  const angle = world.rng.next() * Math.PI * 2;
  const { group, legs } = buildCopMesh();
  group.position.set(
    Math.max(-280, Math.min(280, target.x + Math.sin(angle) * 45)),
    0,
    Math.max(-280, Math.min(320, target.z + Math.cos(angle) * 45)),
  );
  police.scene.add(group);
  const cop = {
    group, legs, pos: group.position,
    heading: 0, health: 30, punchAt: 0, walkPhase: world.rng.range(0, 6),
  };
  police.cops.push(cop);
  return cop;
}

export function updatePolice(police, dt, world, game) {
  const time = game.time;
  const playerPos = game.player.inCar ? game.player.inCar.pos : game.player.pos;
  const target = playerPos;

  // Clear out cruisers wrecked by ramming (shot ones are removed by explodeCar).
  for (let i = police.cars.length - 1; i >= 0; i -= 1) {
    if (police.cars[i].health > 0) continue;
    const dead = police.cars[i];
    police.cars.splice(i, 1);
    const w = world.cars.indexOf(dead);
    if (w >= 0) world.cars.splice(w, 1);
    police.scene.remove(dead.group);
  }

  // Wanted decays once the player has been clean and unseen for a while.
  if (police.stars > 0 && time > police.decayAt) {
    const nearest = nearestCopDistance(police, target);
    if (nearest > 45) {
      police.decayAt = time + WANTED.decayEvery;
      police.stars -= 1;
      game.onWantedChange?.(police.stars);
    } else {
      police.decayAt = time + 3;
    }
  }

  // Cruisers: one per star, up to the cap.
  const wantCars = police.stars > 0 ? Math.min(police.stars, POLICE_MAX_CARS) : 0;
  while (police.cars.length < wantCars) spawnPoliceCar(police, world, target);
  while (police.cars.length > wantCars) {
    const car = police.cars.pop();
    const i = world.cars.indexOf(car);
    if (i >= 0) world.cars.splice(i, 1);
    police.scene.remove(car.group);
  }
  // Foot cops join the chase at 2+ stars when the player is on foot.
  // (Downed cops stay lying where they fell and don't count toward the cap.)
  const aliveCops = police.cops.filter((c) => c.health > 0).length;
  const wantCops = police.stars >= 2 && !game.player.inCar ? Math.min(3, police.stars - 1) : 0;
  for (let i = aliveCops; i < wantCops; i += 1) spawnCop(police, world, target);
  // Surplus living cops walk off when the heat drops.
  while (police.cops.filter((c) => c.health > 0).length > wantCops) {
    const idx = police.cops.findIndex((c) => c.health > 0);
    if (idx < 0) break;
    const cop = police.cops[idx];
    police.cops.splice(idx, 1);
    police.scene.remove(cop.group);
  }

  // Flash the light bars.
  const phase = Math.floor(time * 4) % 2 === 0;
  for (const car of police.cars) {
    if (car.lightL) car.lightL.emissiveIntensity = phase ? 2.2 : 0.25;
    if (car.lightR) car.lightR.emissiveIntensity = phase ? 0.25 : 2.2;
  }

  // Cruisers chase and ram.
  for (const car of police.cars) {
    const dist = steerToward(car, target, dt, 26 + police.stars * 2.5, world);
    if (dist < 4.5 && game.player.inCar) {
      const pc = game.player.inCar;
      pc.health -= RAM_DAMAGE_PER_SEC * dt;
      pc.speed *= 0.985;
      if (Math.random() < dt * 2) game.audio.crash();
    }
  }

  // Foot cops run the player down; staying close builds the bust.
  let copNear = false;
  for (const cop of police.cops) {
    if (cop.health <= 0) continue;
    const dx = target.x - cop.pos.x;
    const dz = target.z - cop.pos.z;
    const dist = Math.hypot(dx, dz);
    cop.heading = Math.atan2(dx, dz);
    const speed = dist > 2 ? COP_RUN_SPEED : 0;
    cop.pos.x += Math.sin(cop.heading) * speed * dt;
    cop.pos.z += Math.cos(cop.heading) * speed * dt;
    cop.group.rotation.y = cop.heading;
    cop.walkPhase += speed * dt * 2.4;
    const swing = Math.sin(cop.walkPhase) * 0.5;
    cop.legs[0].rotation.x = swing;
    cop.legs[1].rotation.x = -swing;
    if (dist < 2.2) {
      copNear = true;
      if (time > cop.punchAt) {
        cop.punchAt = time + COP_PUNCH_INTERVAL;
        game.player.health -= COP_PUNCH_DAMAGE;
        game.audio.punch();
        game.onPlayerHurt?.();
      }
    }
  }
  police.bustTimer = copNear ? police.bustTimer + dt : Math.max(0, police.bustTimer - dt * 2);
  if (police.bustTimer > BUST_TIME) game.onBusted?.('The Solmar PD caught up with Lena on foot.');
}

function nearestCopDistance(police, target) {
  let best = Infinity;
  for (const car of police.cars) best = Math.min(best, Math.hypot(car.pos.x - target.x, car.pos.z - target.z));
  for (const cop of police.cops) {
    if (cop.health > 0) best = Math.min(best, Math.hypot(cop.pos.x - target.x, cop.pos.z - target.z));
  }
  return best;
}

export { TRAFFIC_COLORS };
