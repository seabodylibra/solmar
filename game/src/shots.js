// The screenshot scenes behind ?shot=chase|street|mission|beach. Each one
// arranges the real game — the player, cars, police, pedestrians, a wanted
// level, a mission objective — at fixed places, so the same seed always
// gives the same frame. The frame is what a short game really looks like.

import { PLACES } from './config.js';
import { makeCar, spawnParked, spawnTraffic } from './vehicles.js';
import { spawnPeds } from './pedestrians.js';
import { say } from './missions.js';

function resetScene(G) {
  G.time = 8;
  G.cars = [];
  G.peds = [];
  G.cops = [];
  G.bullets = [];
  G.pickups = [];
  G.effects.particles.length = 0;
  G.effects.skids.length = 0;
  G.wanted.stars = 0;
  G.wanted.busted = 0;
  G.mission = null;
  G.job = null;
  G.dialogue = null;
  G.player.inCar = null;
  G.player.health = 100;
  G.player.cash = 340;
  G.player.ammo = 9;
  G.player.reserve = 36;
  G.player.reloading = 0;
  G.player.punchAnim = 0;
  G.player.hurtFlash = 0;
}

function setMission(G, index, title, objective, target) {
  G.mission = {
    index,
    def: { title, stages: [{ text: objective }] },
    stage: 0,
    timer: 0,
    target,
    objective,
    startedAt: 0,
  };
}

function addSports(G, x, y, angle, color) {
  const car = makeCar(G.rng, 'sports', x, y, angle);
  car.color = color;
  car.speed = 0;
  car.vx = 0;
  car.vy = 0;
  G.cars.push(car);
  return car;
}

function addPolice(G, x, y, angle) {
  const car = makeCar(G.rng, 'police', x, y, angle);
  car.driver = 'npc';
  car.siren = true;
  car.speed = 300;
  car.vx = Math.cos(angle) * 300;
  car.vy = Math.sin(angle) * 300;
  G.cars.push(car);
  return car;
}

function addTraffic(G, count) {
  G.cars.push(...spawnTraffic(G.city, G.rng, count));
  G.cars.push(...spawnParked(G.city, G.rng, 6));
}

function addPeds(G, count) {
  G.peds.push(...spawnPeds(G.city, G.rng, count));
}

function placePlayerInCar(G, car, speed) {
  const p = G.player;
  p.inCar = car;
  car.driver = 'player';
  car.speed = speed;
  car.vx = Math.cos(car.angle) * speed;
  car.vy = Math.sin(car.angle) * speed;
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
}

function placePlayerOnFoot(G, x, y, angle) {
  const p = G.player;
  p.inCar = null;
  p.x = x;
  p.y = y;
  p.angle = angle;
}

function aimCamera(G, x, y) {
  G.camera.snap(x, y);
  G.camera.clamp(G.viewW, G.viewH);
}

/**
 * Arrange the named scene and return the sun tint to paint over it
 * (null for plain daylight).
 */
export function stageShot(name, G) {
  resetScene(G);
  if (name === 'street') {
    placePlayerOnFoot(G, 1120, 820, 0.3);
    addTraffic(G, 12);
    addPeds(G, 22);
    addSports(G, 1180, 480, Math.PI / 2, '#e83e3e');
    setMission(G, 0, 'First Pickup', 'Get to the sports car at Plaza del Sol', { x: PLACES.plaza.x, y: PLACES.plaza.y, label: 'Plaza del Sol' });
    say(G, 'Mr. Solano', 'A client left a red sports car at Plaza del Sol. Bring it to my garage.', 999);
    aimCamera(G, 1120, 800);
    return { tint: null };
  }
  if (name === 'mission') {
    placePlayerOnFoot(G, 330, 1470, Math.PI);
    addSports(G, 420, 1400, Math.PI / 2, '#2b2f36');
    addTraffic(G, 6);
    addPeds(G, 10);
    setMission(G, 1, 'The Package', 'Pick up the package at the Docks', { x: PLACES.docks.x, y: PLACES.docks.y, label: 'The Docks' });
    say(G, 'Mr. Solano', 'The package is at the docks. Grab it and don\'t get seen.', 999);
    aimCamera(G, 330, 1440);
    return { tint: null };
  }
  if (name === 'beach') {
    const car = addSports(G, 1380, 1760, 0, '#e83e3e');
    placePlayerInCar(G, car, 360);
    addTraffic(G, 7);
    addPeds(G, 8);
    setMission(G, 3, 'The Courier', 'Deliver to St. Marina Hospital — fast!', { x: PLACES.hospital.x, y: PLACES.hospital.y, label: 'Hospital' });
    G.player.cash = 620;
    aimCamera(G, 1500, 1740);
    return { tint: 'rgba(255, 140, 80, 0.10)' };
  }
  // Default: the chase (the cover).
  const car = addSports(G, 1180, 1760, 0, '#e83e3e');
  placePlayerInCar(G, car, 380);
  addPolice(G, 1020, 1760, 0);
  addPolice(G, 940, 1730, 0.12);
  addTraffic(G, 6);
  addPeds(G, 6);
  G.wanted.stars = 3;
  G.player.cash = 540;
  setMission(G, 2, 'Hot Pursuit', 'Escape the police!', { x: PLACES.marina.x, y: PLACES.marina.y, label: 'Marina' });
  say(G, 'Dispatch', 'All units: pursuit in progress on Ocean Drive.', 999);
  aimCamera(G, 1300, 1740);
  return { tint: 'rgba(255, 170, 60, 0.10)' };
}
