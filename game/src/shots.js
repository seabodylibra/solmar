// The screenshot scenes behind ?shot=chase|street|mission|beach. Each one plays the real
// rules forward from a fresh seeded world for a fixed number of steps, steered by a
// simple autopilot (hold the road, walk toward the marker), so the frame is what a
// short game really looks like — and the same seed always gives the same frame.
// Driving scenes use a front three-quarter camera (just off the car's nose, looking
// back at it), so the car and whatever chases it are both in frame at once.

import { STEP, PITCH } from './config.js';
import { createCar } from './vehicles.js';
import { startMission } from './missions.js';

// Camera yaw offset for the front three-quarter framing, as a fraction of a
// half-turn from straight behind the car.
const FRONT_THREE_QUARTER = Math.PI * 0.9;
// Every staged scene runs from this seed, so the same shot always frames the same world.
const STAGED_SEED = 1;
// How many nearby traffic cars and pedestrians a scene pulls in around the action.
const NEAR_CARS = 5;
const NEAR_PEDS = 7;

const SAMPLE = STEP;

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Steer a car toward a point: returns a drive input for one step. */
function driveToward(car, tx, tz, throttle) {
  const desired = Math.atan2(tx - car.pos.x, tz - car.pos.z);
  const err = angleDiff(desired, car.heading);
  return { throttle: throttle ?? 1, steer: Math.max(-1, Math.min(1, err * 1.6)), handbrake: false };
}

/** Put a few traffic cars and pedestrians on the roads around (x, z). */
function populateNear(game, x, z) {
  const rng = game.rng;
  let placed = 0;
  for (const car of game.world.cars) {
    if (car.kind !== 'traffic' || placed >= NEAR_CARS) continue;
    // Traffic sits on a road centreline (a multiple of the road pitch).
    const road = Math.round(rng.range(-3, 3)) * PITCH;
    const along = (rng.next() < 0.5 ? x : z) + rng.range(-50, 50);
    if (rng.next() < 0.5) {
      car.pos.set(road, 0, Math.max(-280, Math.min(280, along)));
      car.heading = rng.next() < 0.5 ? 0 : Math.PI;
    } else {
      car.pos.set(Math.max(-280, Math.min(280, along)), 0, road);
      car.heading = rng.next() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    }
    car.targetHeading = car.heading;
    car.targetSpeed = rng.range(9, 13);
    placed += 1;
  }
  let peds = 0;
  for (const ped of game.world.peds) {
    if (peds >= NEAR_PEDS) break;
    ped.pos.set(x + rng.range(-18, 18), 0, z + rng.range(-14, 14));
    ped.target.set(x + rng.range(-22, 22), 0, z + rng.range(-22, 22));
    ped.state = 'walk';
    peds += 1;
  }
}

function stepFor(game, seconds, inputFn) {
  const steps = Math.round(seconds / SAMPLE);
  for (let i = 0; i < steps; i += 1) game.stepWorld(SAMPLE, inputFn());
}

/**
 * Set the world to the named scene and return the screen to draw over it.
 * The game object is main.js's live game; every field this touches is its public state.
 */
export function stageShot(name, game) {
  game.resetWorld(STAGED_SEED);
  game.state = 'play';
  game.hud.show();
  // The shots frame the action: a front three-quarter view for the driving scenes
  // (so the car and what chases it are both in frame), a higher chase cam on foot.
  const rig = game.cameraRig;
  rig.free = true;

  if (name === 'beach') {
    // Golden-hour drive down the beachfront boulevard, palms and sea on the left.
    game.setSunset(true);
    const car = createCar(game.scene, 'player', 0xe67e22, -220, 288, Math.PI / 2);
    car.targetSpeed = 0;
    game.world.cars.push(car);
    game.enterCar(car, true);
    startMission(game.missions, game, 1);
    populateNear(game, -100, 288);
    stepFor(game, 5, () => ({ drive: driveToward(car, 300, 288, 1) }));
    rig.yaw = car.heading + FRONT_THREE_QUARTER;
    rig.pitch = 0.38;
    rig.distance = 12;
    return { screen: 'play' };
  }

  if (name === 'mission') {
    // The pickup: Lena pulls up to the Marina marker, Solano's line on screen.
    const car = createCar(game.scene, 'player', 0x2e86c1, 170, 288, Math.PI / 2);
    car.targetSpeed = 0;
    game.world.cars.push(car);
    game.enterCar(car, true);
    startMission(game.missions, game, 1);
    populateNear(game, 220, 288);
    stepFor(game, 3, () => ({ drive: driveToward(car, 252, 288, 0.7) }));
    // Camera behind the car, looking forward: the Marina beacon is in frame ahead.
    rig.yaw = car.heading + Math.PI * 0.12;
    rig.pitch = 0.36;
    rig.distance = 11;
    return { screen: 'play' };
  }

  if (name === 'street') {
    // On foot downtown: traffic, pedestrians, the skyline, a mission ahead.
    game.player.pos.set(60, 0, 60);
    game.player.heading = Math.PI;
    startMission(game.missions, game, 1);
    populateNear(game, 60, 60);
    const target = game.missions.landmarks.marina;
    stepFor(game, 3, () => {
      const dx = target.x - game.player.pos.x;
      const dz = target.z - game.player.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      return { move: { x: (dx / d) * 0.8, z: (dz / d) * 0.8 }, running: false };
    });
    // A few pedestrians strolling ahead of her, so the street reads as lived-in.
    const h = game.player.heading;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const rx = Math.cos(h);
    const rz = -Math.sin(h);
    let placedPeds = 0;
    for (const ped of game.world.peds) {
      if (placedPeds >= 5) break;
      const d = 8 + placedPeds * 2.5;
      const side = (placedPeds % 2 === 0 ? 1 : -1) * (2 + placedPeds);
      ped.pos.set(game.player.pos.x + fx * d + rx * side, 0, game.player.pos.z + fz * d + rz * side);
      ped.target.copy(ped.pos);
      ped.state = 'walk';
      placedPeds += 1;
    }
    rig.yaw = game.player.heading;
    rig.pitch = 0.32;
    rig.distance = 8.5;
    return { screen: 'play' };
  }

  // Default: 'chase' — the cover. Three stars, two cruisers on Lena's tail, the
  // beachfront boulevard ahead and a job on the board.
  const car = createCar(game.scene, 'player', 0xc0392b, -60, 288, Math.PI / 2);
  car.targetSpeed = 0;
  game.world.cars.push(car);
  game.enterCar(car, true);
  startMission(game.missions, game, 2); // HEAT: wanted 3, lose the cops
  populateNear(game, 0, 288);
  // Two cruisers right behind her.
  for (const dz of [-16, -30]) {
    const cop = createCar(game.scene, 'police', 0xf2f2f2, car.pos.x + dz * 0.4, 288 + dz * 0.2, Math.PI / 2);
    cop.targetSpeed = 30;
    game.police.cars.push(cop);
    game.world.cars.push(cop);
  }
  stepFor(game, 5, () => ({ drive: driveToward(car, 300, 288, 1) }));
  rig.yaw = car.heading + FRONT_THREE_QUARTER;
  rig.pitch = 0.36;
  rig.distance = 12;
  return { screen: 'play' };
}
