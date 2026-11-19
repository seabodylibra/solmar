// Lena Cruz on foot: third-person movement relative to the camera, a walk-cycle
// humanoid, punching, and getting in and out of cars — any car, parked or driven,
// is hers if she can reach the door.
// Movement is camera-relative: W always walks away from the camera, so the player
// never has to relearn the keys when the camera orbits.

import * as THREE from 'three';
import { PLAYER, SEA_Z } from './config.js';
import { collideBuildings } from './vehicles.js';

// How fast Lena turns toward the direction she is walking (radians per second).
const TURN_RATE = 10;

// The walkable world: a little past the city edge in every direction, but never
// into the sea — the south fence sits just short of the waterline.
const WORLD_X = 320;
const WORLD_Z_MIN = -320;
const WORLD_Z_MAX = SEA_Z - 8;

function buildPlayerMesh() {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: 0x0e7c7b });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe0ac69 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x22303c });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.68, 0.36), shirt);
  torso.position.y = 1.08;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), skin);
  head.position.y = 1.66;
  head.castShadow = true;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark);
  hair.position.y = 1.7;
  group.add(hair);
  const legs = [];
  for (const x of [-0.15, 0.15]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.22), dark);
    leg.position.set(x, 0.35, 0);
    leg.castShadow = true;
    group.add(leg);
    legs.push(leg);
  }
  const arms = [];
  for (const x of [-0.4, 0.4]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.18), shirt);
    arm.position.set(x, 1.08, 0);
    group.add(arm);
    arms.push(arm);
  }
  return { group, legs, arms };
}

export function createPlayer(scene, x, z) {
  const { group, legs, arms } = buildPlayerMesh();
  group.position.set(x, 0, z);
  scene.add(group);
  return {
    group, legs, arms,
    pos: group.position,
    heading: Math.PI,
    speed: 0,
    walkPhase: 0,
    health: PLAYER.maxHealth,
    inCar: null,
    punchCooldown: 0,
  };
}

/** Restore health, clamped to the max (pickups and slow regen share this). */
export function healPlayer(player, amount) {
  player.health = Math.min(PLAYER.maxHealth, player.health + amount);
}

/** Move on foot. moveX/moveZ are camera-relative (-1..1); returns distance moved. */
export function updatePlayerOnFoot(player, moveX, moveZ, running, dt, world) {
  player.punchCooldown = Math.max(0, player.punchCooldown - dt);
  const mag = Math.hypot(moveX, moveZ);
  const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
  if (mag > 0.01) {
    const nx = moveX / Math.max(1, mag);
    const nz = moveZ / Math.max(1, mag);
    const desired = Math.atan2(nx, nz);
    let diff = desired - player.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    player.heading += Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, diff * 12 * dt));
    player.speed = speed * Math.min(1, mag);
    player.pos.x += Math.sin(player.heading) * player.speed * dt;
    player.pos.z += Math.cos(player.heading) * player.speed * dt;
    player.walkPhase += player.speed * dt * 2.2;
  } else {
    player.speed = 0;
  }
  collideBuildings(player.pos, PLAYER.radius, world.colliders);
  player.pos.x = Math.max(-WORLD_X, Math.min(WORLD_X, player.pos.x));
  player.pos.z = Math.max(WORLD_Z_MIN, Math.min(WORLD_Z_MAX, player.pos.z));
  player.group.rotation.y = player.heading;
  const swing = Math.sin(player.walkPhase) * (player.speed > 0.1 ? 0.55 : 0);
  player.legs[0].rotation.x = swing;
  player.legs[1].rotation.x = -swing;
  player.arms[0].rotation.x = -swing * 0.8;
  player.arms[1].rotation.x = swing * 0.8;
  return player.speed;
}

export function nearestCar(player, cars, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of cars) {
    if (car.health <= 0) continue;
    const d = Math.hypot(car.pos.x - player.pos.x, car.pos.z - player.pos.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}
