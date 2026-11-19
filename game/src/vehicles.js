// Cars: a box-built car model (body, cabin, wheels, lights; a light bar for police),
// arcade driving physics for the player's car, traffic that follows the road grid,
// and a steering helper the police chase uses. All cars are circles for collision:
// a 1.7 m radius is the compromise between the 2.0 m width and the 4.4 m length,
// so cars can pass close on a road without clipping each other.

import * as THREE from 'three';
import { PITCH, CITY_EDGE, BEACH_Z, CAR } from './config.js';

const TRAFFIC_COLORS = [0xc0392b, 0x2e86c1, 0xf1c40f, 0x7d3c98, 0x16a085, 0xe67e22, 0x95a5a6, 0x2c3e50, 0xd5dbdb, 0x1abc9c];
const CAR_RADIUS = 1.7;
// Hitting a building above this speed damages the car (and the driver hears it).
const CRASH_SPEED = 14;
// How fast a steered car may swing its heading (radians per second).
const STEER_RATE = 2.4;
// Wheel radius in metres: wheel spin is speed / radius, shared by every driver.
const WHEEL_RADIUS = 0.36;
// Traffic brakes when something is this close ahead in its own lane.
const BRAKE_LOOKAHEAD = 11;

export function buildCarMesh(color, kind) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.62;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.1), kind === 'police' ? bodyMat : darkMat);
  cabin.position.set(0, 1.18, -0.25);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.28, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, WHEEL_RADIUS, z);
    group.add(wheel);
    wheels.push(wheel);
  }
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff6c0, emissive: 0x555533 });
  for (const x of [-0.7, 0.7]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), headMat);
    head.position.set(x, 0.72, 2.21);
    group.add(head);
  }
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xaa2222, emissive: 0x330000 });
  for (const x of [-0.7, 0.7]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), tailMat);
    tail.position.set(x, 0.72, -2.21);
    group.add(tail);
  }
  let lightL = null;
  let lightR = null;
  if (kind === 'police') {
    lightL = new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff0000 });
    lightR = new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x0000ff });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 0.4), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    bar.position.set(0, 1.52, -0.25);
    group.add(bar);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.42), lightL);
    l.position.set(-0.3, 1.62, -0.25);
    group.add(l);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.42), lightR);
    r.position.set(0.3, 1.62, -0.25);
    group.add(r);
  }
  return { group, wheels, lightL, lightR };
}

export function createCar(scene, kind, color, x, z, heading) {
  const { group, wheels, lightL, lightR } = buildCarMesh(color, kind);
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  scene.add(group);
  return {
    kind, group, wheels, lightL, lightR,
    pos: group.position,
    heading,
    speed: 0,
    steer: 0,
    health: CAR.maxHealth,
    color,
    // Traffic AI state.
    targetHeading: heading,
    targetSpeed: 0,
    turnAt: 0,
    stuck: 0,
  };
}

export function carForward(car) {
  return { x: Math.sin(car.heading), z: Math.cos(car.heading) };
}

/** Push a circle out of building footprints; returns true if a hit happened. */
export function collideBuildings(pos, radius, colliders) {
  let hit = false;
  for (const b of colliders) {
    const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        pos.x = b.maxX + radius;
      }
    }
  }
  return hit;
}

function clampBounds(pos) {
  pos.x = Math.max(-CITY_EDGE - 20, Math.min(CITY_EDGE + 20, pos.x));
  pos.z = Math.max(-CITY_EDGE - 20, Math.min(BEACH_Z + 55, pos.z));
}

/** Arcade driving: throttle/brake, speed-sensitive steering, handbrake slides. */
export function updatePlayerCar(car, input, dt, world) {
  const prevSpeed = car.speed;
  if (input.throttle > 0) car.speed += CAR.accel * input.throttle * dt;
  else if (input.throttle < 0) {
    if (car.speed > 0.5) car.speed -= CAR.brake * dt;
    else car.speed -= CAR.accel * 0.6 * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  }
  car.speed = Math.max(-CAR.reverseMax, Math.min(CAR.maxSpeed, car.speed));
  const speedFactor = Math.min(1, Math.abs(car.speed) / 12);
  const steerTarget = input.steer * CAR.steerMax * (1 - speedFactor * 0.45);
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
  const turnRate = car.steer * (car.speed / 2.4) * (input.handbrake ? 1.7 : 1);
  // Facing +z (south), +x (east) is to the left, so turning right decreases heading.
  car.heading -= turnRate * dt * (car.speed >= 0 ? 1 : -1);
  if (input.handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 14 * dt);
  const f = carForward(car);
  car.pos.x += f.x * car.speed * dt;
  car.pos.z += f.z * car.speed * dt;
  clampBounds(car.pos);
  if (collideBuildings(car.pos, CAR_RADIUS, world.colliders)) {
    if (Math.abs(prevSpeed) > CRASH_SPEED) {
      car.health -= Math.abs(prevSpeed) * 0.9;
      world.onCrash?.(Math.abs(prevSpeed));
    }
    car.speed *= 0.45;
  }
  // Bump other cars apart.
  for (const other of world.cars) {
    if (other === car || other.health <= 0) continue;
    const dx = other.pos.x - car.pos.x;
    const dz = other.pos.z - car.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < CAR_RADIUS * 2 && d > 0.01) {
      const push = (CAR_RADIUS * 2 - d) / 2;
      const nx = dx / d;
      const nz = dz / d;
      car.pos.x -= nx * push;
      car.pos.z -= nz * push;
      other.pos.x += nx * push;
      other.pos.z += nz * push;
      if (Math.abs(car.speed) > 8) {
        other.health -= 4;
        world.onBump?.(other);
      }
      car.speed *= 0.92;
    }
  }
  car.group.rotation.y = car.heading;
  for (const wheel of car.wheels) wheel.rotation.x += (car.speed * dt) / WHEEL_RADIUS;
}

/** Steer any car toward a point at up to maxSpeed; returns arrival distance. */
export function steerToward(car, target, dt, maxSpeed, world) {
  const dx = target.x - car.pos.x;
  const dz = target.z - car.pos.z;
  const dist = Math.hypot(dx, dz);
  const desired = Math.atan2(dx, dz);
  let diff = desired - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.heading += Math.max(-STEER_RATE * dt, Math.min(STEER_RATE * dt, diff * 3 * dt * 2));
  const targetSpeed = dist < 12 ? Math.max(6, maxSpeed * (dist / 12)) : maxSpeed;
  car.speed += Math.sign(targetSpeed - car.speed) * Math.min(Math.abs(targetSpeed - car.speed), 14 * dt);
  const f = carForward(car);
  car.pos.x += f.x * car.speed * dt;
  car.pos.z += f.z * car.speed * dt;
  clampBounds(car.pos);
  if (collideBuildings(car.pos, CAR_RADIUS, world.colliders)) car.speed *= 0.5;
  car.group.rotation.y = car.heading;
  for (const wheel of car.wheels) wheel.rotation.x += (car.speed * dt) / WHEEL_RADIUS;
  return dist;
}

function nearestRoad(v) {
  return Math.round(v / PITCH) * PITCH;
}

/** Traffic: cruise the grid, turn at intersections, brake for the car ahead. */
export function updateTrafficCar(car, dt, world, rng, time) {
  const f = carForward(car);
  // Brake if something is right ahead: within BRAKE_LOOKAHEAD metres, and inside
  // the car's own lane, so oncoming traffic on the other side never makes it stop.
  let blocked = false;
  for (const other of world.cars) {
    if (other === car || other.health <= 0) continue;
    const dx = other.pos.x - car.pos.x;
    const dz = other.pos.z - car.pos.z;
    const ahead = dx * f.x + dz * f.z;
    const side = Math.abs(dx * f.z - dz * f.x);
    if (ahead > 0 && ahead < BRAKE_LOOKAHEAD && side < 3) { blocked = true; break; }
  }
  const wantSpeed = blocked ? 0 : car.targetSpeed;
  car.speed += Math.sign(wantSpeed - car.speed) * Math.min(Math.abs(wantSpeed - car.speed), 10 * dt);
  // At an intersection, sometimes turn.
  const nearX = Math.abs(car.pos.x - nearestRoad(car.pos.x)) < 7;
  const nearZ = Math.abs(car.pos.z - nearestRoad(car.pos.z)) < 7;
  if (nearX && nearZ && time > car.turnAt) {
    car.turnAt = time + rng.range(1.5, 4);
    const roll = rng.next();
    const options = [0, Math.PI / 2, -Math.PI / 2];
    const turn = options[Math.floor(roll * 3)];
    const next = car.targetHeading + turn;
    // Don't drive off the map or into the sea.
    const nx = car.pos.x + Math.sin(next) * 30;
    const nz = car.pos.z + Math.cos(next) * 30;
    if (Math.abs(nx) < CITY_EDGE + 10 && nz > -CITY_EDGE - 10 && nz < BEACH_Z + 40) {
      car.targetHeading = next;
    } else {
      car.targetHeading = car.targetHeading + Math.PI;
    }
  }
  let diff = car.targetHeading - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff * 2.5 * dt * 2));
  car.pos.x += f.x * car.speed * dt;
  car.pos.z += f.z * car.speed * dt;
  clampBounds(car.pos);
  if (collideBuildings(car.pos, CAR_RADIUS, world.colliders)) {
    car.heading += Math.PI / 2;
    car.targetHeading = car.heading;
    car.speed *= 0.5;
  }
  car.group.rotation.y = car.heading;
  for (const wheel of car.wheels) wheel.rotation.x += (car.speed * dt) / WHEEL_RADIUS;
}

export { TRAFFIC_COLORS };
