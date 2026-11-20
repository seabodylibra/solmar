// The world: one object holding everything (city, player, cars, pedestrians,
// police, missions, effects, camera, sound, HUD) and the fixed step that
// advances it. main.js owns the screens and the loop; this module owns the
// simulation: movement, driving, traffic, the wanted level, missions, jobs,
// combat, pickups, the garage, and respawning after a bust or a hospital trip.

import { CAR, PEDS, PLACES, STEP, TRAFFIC } from './config.js';
import { createRng } from './random.js';
import { createCity } from './city.js';
import { createCamera } from './camera.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createPlayer, tryEnterExit, tryPunch, updatePlayer } from './player.js';
import {
  collideCars, makeCar, spawnParked, spawnTraffic,
  updatePlayerCar, updatePoliceCars, updateTraffic,
} from './vehicles.js';
import { hitPedestrian, spawnPeds, updatePeds } from './pedestrians.js';
import { createWanted } from './police.js';
import { say, startMission, updateJobs, updateMissions } from './missions.js';
import { spawnPickups, tryReload, tryShoot, updateCombat } from './combat.js';
import { saveGame } from './save.js';
import { ACT_ENTER, ACT_PUNCH, ACT_RELOAD } from './input.js';

export function createWorld(seed) {
  const rng = createRng(seed);
  const city = createCity(rng);
  const player = createPlayer(1120, 580);
  const cars = [];
  cars.push(...spawnTraffic(city, rng, TRAFFIC.count));
  cars.push(...spawnParked(city, rng, TRAFFIC.parked));
  // The red sports car waiting at Plaza del Sol for the first mission.
  const missionCar = makeCar(rng, 'sports', 1120, 470, Math.PI / 2);
  missionCar.color = '#e83e3e';
  cars.push(missionCar);

  const G = {
    seed,
    rng,
    time: 0,
    mode: 'title',
    viewW: 1280,
    viewH: 720,
    city,
    camera: createCamera(),
    effects: createEffects(),
    audio: createAudio(),
    hud: createHud(),
    player,
    cars,
    peds: spawnPeds(city, rng, PEDS.count),
    cops: [],
    bullets: [],
    pickups: spawnPickups(city, rng, 14),
    wanted: createWanted(),
    mission: null,
    job: null,
    dialogue: null,
    danger: null,
    storyDone: false,
    stats: { missionsDone: 0, carsStolen: 0, pedsHit: 0, shotsFired: 0, explosions: 0 },
    _saveTimer: 0,
    _garageCooldown: 0,
  };
  G.camera.snap(player.x, player.y);
  return G;
}

export function stepWorld(G, dt, input, actions) {
  if (G.mode !== 'play') return;
  G.time += dt;
  const p = G.player;

  if (actions & ACT_ENTER) tryEnterExit(G);
  if (actions & ACT_PUNCH) tryPunch(G);
  if (actions & ACT_RELOAD) tryReload(G);

  if (p.inCar) updatePlayerCar(G, dt, input);
  else {
    updatePlayer(G, dt, input);
    tryShoot(G, input);
  }
  updateTraffic(G, dt);
  updatePoliceCars(G, dt);
  collideCars(G);
  updatePeds(G, dt);
  G.wanted.update(G, dt);
  updateMissions(G, dt);
  updateJobs(G, dt);
  updateCombat(G, dt);
  G.effects.update(dt);

  // Cars running pedestrians down.
  for (const car of G.cars) {
    if (car.dead || Math.abs(car.speed) < 90) continue;
    for (const ped of G.peds) {
      if (ped.down > 0) continue;
      if (Math.hypot(ped.x - car.x, ped.y - car.y) < 24) hitPedestrian(G, ped, true);
    }
  }
  // Wrecks burn out and are towed away.
  for (let i = G.cars.length - 1; i >= 0; i -= 1) {
    const car = G.cars[i];
    if (car.dead && car.removeAt && G.time > car.removeAt && car.driver !== 'player') {
      G.cars.splice(i, 1);
    }
  }

  // The garage: drive in to clear the heat and fix the car, for $50.
  if (p.inCar && G.wanted.stars > 0 && p.cash >= 50) {
    G._garageCooldown -= dt;
    if (G._garageCooldown <= 0 && Math.hypot(p.x - PLACES.garage.x, p.y - PLACES.garage.y) < 85) {
      p.cash -= 50;
      G.wanted.stars = 0;
      G.wanted.busted = 0;
      p.inCar.health = 100;
      G._garageCooldown = 6;
      say(G, 'Garage', "Wanted cleared, car fixed. That'll be $50.", 4);
      G.audio.pickup();
    }
  }

  G.camera.follow(p.x, p.y, dt);
  G.camera.clamp(G.viewW, G.viewH);

  const speed01 = p.inCar ? Math.min(1, Math.abs(p.inCar.speed) / p.inCar.maxSpeed) : 0;
  G.audio.engine(speed01, !!p.inCar);
  let sirenNear = false;
  for (const car of G.cars) {
    if (car.kind === 'police' && !car.dead && Math.hypot(car.x - p.x, car.y - p.y) < 520) {
      sirenNear = true;
      break;
    }
  }
  G.audio.siren(sirenNear);

  G._saveTimer += dt;
  if (G._saveTimer > 12) {
    G._saveTimer = 0;
    saveGame(G);
  }
  G.hud.update(G);
}

/** After a bust or a hospital trip: pay the price, clear the heat, wake up. */
export function respawn(G, kind) {
  const p = G.player;
  if (kind === 'busted') {
    p.cash = Math.max(0, p.cash - Math.min(p.cash, 150));
    p.x = PLACES.policeStation.x;
    p.y = PLACES.policeStation.y + 40;
  } else {
    p.cash = Math.max(0, p.cash - Math.min(p.cash, 100));
    p.x = PLACES.hospital.x;
    p.y = PLACES.hospital.y + 40;
  }
  p.health = p.maxHealth;
  p.inCar = null;
  p.angle = -Math.PI / 2;
  p.ammo = 12;
  G.wanted.stars = 0;
  G.wanted.busted = 0;
  G.cops = [];
  G.cars = G.cars.filter((c) => c.kind !== 'police');
  G.bullets = [];
  G.camera.snap(p.x, p.y);
  G.mode = 'play';
  saveGame(G);
}

/** Start a fresh run from the title screen (optionally from a save). */
export function startRun(G, save) {
  const p = G.player;
  if (save) {
    p.cash = save.cash;
    p.health = save.health;
    p.ammo = save.ammo;
    p.reserve = save.reserve;
    p.x = save.x;
    p.y = save.y;
    G.wanted.stars = save.wanted;
    G.storyDone = save.storyDone;
    G.stats.missionsDone = save.missionsDone;
    G.stats.carsStolen = save.carsStolen;
    if (save.missionIndex >= 0 && save.missionIndex < 5) {
      startMission(G, save.missionIndex);
    } else if (save.storyDone) {
      G.mission = null;
    } else {
      startMission(G, 0);
    }
  } else {
    p.cash = 120;
    p.health = p.maxHealth;
    p.ammo = 12;
    p.reserve = 48;
    p.x = 1120;
    p.y = 580;
    G.wanted.stars = 0;
    G.storyDone = false;
    G.stats.missionsDone = 0;
    G.stats.carsStolen = 0;
    startMission(G, 0);
  }
  p.inCar = null;
  p.angle = -Math.PI / 2;
  G.camera.snap(p.x, p.y);
  G.mode = 'play';
}
