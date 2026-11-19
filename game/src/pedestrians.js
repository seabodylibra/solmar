// Pedestrians: ambient walkers who stroll the sidewalks, chat in place, and flee when
// a car bears down on them or a shot goes off. Hit one and they go down — and the law
// notices. They respawn across town after a while.
// States: walk (head for a sidewalk target) → flee (a threat is near) → down
// (knocked over; invisible timer, then teleported across town and walking again).

import * as THREE from 'three';
import { PITCH, CITY_EDGE, BEACH_Z } from './config.js';

// A threat inside this radius makes a pedestrian run away from it.
const FLEE_RADIUS = 16;
// Amble speed on the sidewalk, and the flat-out sprint when fleeing a threat.
const WALK_SPEED = 1.4;
const FLEE_SPEED = 4.6;
// Seconds a knocked-down pedestrian lies in the road before getting back up
// across town, and seconds a walker waits at a target before picking a new one.
const DOWN_SECONDS = 6;
const MAX_IDLE_SECONDS = 25;

const SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0xecf0f1, 0x1abc9c, 0xfd79a8, 0x6c5ce7, 0x00b894];
const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];

function buildPedMesh(shirt, skin) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.32, 0.85, 8),
    new THREE.MeshLambertMaterial({ color: shirt }),
  );
  body.position.y = 0.95;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 8),
    new THREE.MeshLambertMaterial({ color: skin }),
  );
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const legs = [];
  for (const x of [-0.11, 0.11]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.18), legMat);
    leg.position.set(x, 0.28, 0);
    group.add(leg);
    legs.push(leg);
  }
  return { group, legs };
}

export function createPedestrians(scene, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const { group, legs } = buildPedMesh(rng.pick(SHIRTS), rng.pick(SKINS));
    scene.add(group);
    const ped = {
      group, legs,
      pos: group.position,
      heading: rng.range(0, Math.PI * 2),
      speed: 0,
      state: 'walk', // walk | flee | down
      target: new THREE.Vector3(),
      stateTime: 0,
      walkPhase: rng.range(0, 6),
      downTime: 0,
    };
    ped.pos.set(rng.range(-260, 260), 0, rng.range(-260, 300));
    ped.target.copy(ped.pos);
    peds.push(ped);
  }
  return peds;
}

function randomSidewalkTarget(rng, out) {
  // A point just off a road, on a block edge (a sidewalk).
  const along = rng.range(-CITY_EDGE, CITY_EDGE);
  const road = Math.round(rng.range(-4, 4)) * PITCH;
  if (rng.next() < 0.5) out.set(along, 0, road + (rng.next() < 0.5 ? 10 : -10));
  else out.set(road + (rng.next() < 0.5 ? 10 : -10), 0, along);
  out.z = Math.min(out.z, BEACH_Z - 4);
  return out;
}

export function updatePedestrians(peds, dt, world, rng, time) {
  for (const ped of peds) {
    ped.stateTime += dt;
    if (ped.state === 'down') {
      ped.downTime -= dt;
      ped.group.rotation.x = -Math.PI / 2;
      ped.group.position.y = 0.25;
      if (ped.downTime <= 0) {
        randomSidewalkTarget(rng, ped.target);
        ped.pos.copy(ped.target);
        ped.group.rotation.x = 0;
        ped.group.position.y = 0;
        ped.state = 'walk';
        ped.stateTime = 0;
      }
      continue;
    }
    // Flee from a nearby threat (fast car, gunfire, the player on a rampage).
    const threat = world.threat;
    let fleeing = false;
    if (threat && ped.state !== 'down') {
      const d = Math.hypot(ped.pos.x - threat.x, ped.pos.z - threat.z);
      if (d < FLEE_RADIUS) {
        fleeing = true;
        const away = Math.atan2(ped.pos.x - threat.x, ped.pos.z - threat.z);
        ped.heading = away;
        ped.speed = FLEE_SPEED;
      }
    }
    if (!fleeing) {
      if (ped.state === 'flee') { ped.state = 'walk'; ped.stateTime = 0; }
      const dx = ped.target.x - ped.pos.x;
      const dz = ped.target.z - ped.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.5 || ped.stateTime > MAX_IDLE_SECONDS) {
        randomSidewalkTarget(rng, ped.target);
        ped.stateTime = 0;
      } else {
        const desired = Math.atan2(dx, dz);
        let diff = desired - ped.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        ped.heading += Math.max(-2 * dt, Math.min(2 * dt, diff * 4 * dt));
        ped.speed = WALK_SPEED;
      }
    } else {
      ped.state = 'flee';
    }
    ped.pos.x += Math.sin(ped.heading) * ped.speed * dt;
    ped.pos.z += Math.cos(ped.heading) * ped.speed * dt;
    ped.pos.x = Math.max(-300, Math.min(300, ped.pos.x));
    ped.pos.z = Math.max(-300, Math.min(BEACH_Z + 30, ped.pos.z));
    ped.group.rotation.y = ped.heading;
    ped.walkPhase += ped.speed * dt * 2.4;
    const swing = Math.sin(ped.walkPhase) * 0.5;
    ped.legs[0].rotation.x = swing;
    ped.legs[1].rotation.x = -swing;
  }
}

/** Knock a pedestrian down; returns true if they were standing. */
export function knockDown(ped) {
  if (ped.state === 'down') return false;
  ped.state = 'down';
  ped.downTime = DOWN_SECONDS;
  ped.speed = 0;
  return true;
}
