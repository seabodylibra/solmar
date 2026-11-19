// Boot and the one loop for SOLMAR: a Three.js open-world crime game. The world runs in
// fixed 1/60 s steps; the game moves between title, play, paused and busted screens.
// ?seed=N fixes the world. ?shot=chase|street|mission|beach stages that scene instead
// of running the loop, paints it twice and sets window.__shotReady for a screenshot.

import * as THREE from 'three';
import { STEP, PLAYER, CAR, TRAFFIC_COUNT, PED_COUNT, PALETTE, PITCH, CITY_EDGE } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import { createCity } from './city.js';
import { createCar, updatePlayerCar, updateTrafficCar, carForward, collideBuildings, TRAFFIC_COLORS } from './vehicles.js';
import { createPlayer, updatePlayerOnFoot, nearestCar, healPlayer } from './player.js';
import { createPedestrians, updatePedestrians, knockDown } from './pedestrians.js';
import { createPolice, addWanted, updatePolice } from './police.js';
import { createMissions, startMission, updateMissions, missionTarget, missionObjective } from './missions.js';
import { createPickups, updatePickups, shoot, punch } from './combat.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';
import { createCamera } from './camera.js';
import { createInput, ACTION_ENTER, ACTION_SHOOT, ACTION_PUNCH, ACTION_PAUSE, ACTION_MUTE, ACTION_CONFIRM } from './input.js';
import { loadSave, writeSave, readBestCash, writeBestCash } from './save.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
// Health slowly returns when the player is unhurt and the heat is off.
const HEALTH_REGEN_PER_SEC = 3;
// Seconds after the last hit before health starts coming back.
const HEALTH_REGEN_DELAY = 8;
// Mid-job progress is written this often, so quitting never loses much play.
const AUTOSAVE_EVERY_SEC = 15;
// Frames the follow camera gets to settle on its target before a screenshot.
const SETTLE_FRAMES = 40;
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(PALETTE.fog, 200, 760);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);

const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 1.05);
scene.add(hemi);
const sun = new THREE.DirectionalLight(PALETTE.sun, 2.3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -170;
sun.shadow.camera.right = 170;
sun.shadow.camera.top = 170;
sun.shadow.camera.bottom = -170;
sun.shadow.camera.far = 700;
sun.shadow.bias = -0.0006;
scene.add(sun);
scene.add(sun.target);

const audio = createAudio();
const hud = createHud();
const cameraRig = createCamera(camera);
const input = createInput(canvas);

// The mission beacon: a light pillar and a floating diamond over the current target.
const beacon = new THREE.Group();
const beam = new THREE.Mesh(
  new THREE.CylinderGeometry(2.4, 2.4, 70, 16, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false }),
);
beam.position.y = 35;
const diamond = new THREE.Mesh(
  new THREE.OctahedronGeometry(1.7),
  new THREE.MeshBasicMaterial({ color: 0xffd23e }),
);
diamond.position.y = 15;
beacon.add(beam, diamond);
beacon.visible = false;
scene.add(beacon);

// ---- game state ------------------------------------------------------------
const game = {
  scene,
  time: 0,
  state: 'title',
  cash: 0,
  ammo: 24,
  rng: createRandom(seed),
  player: null,
  police: null,
  missions: null,
  pickups: null,
  world: null,
  lastHurtAt: -999,
  lastShotAt: -999,
  saveSnapshot: null,
  audio,
  hud,
  cameraRig,
  addCash(n) {
    game.cash += n;
    hud.setCash(game.cash);
  },
  addCrime(n, reason) {
    if (addWanted(game.police, n, game.time)) {
      game.onWantedChange(game.police.stars);
      audio.setSiren(game.police.stars > 0);
    }
  },
  dialogue(speaker, text) { hud.showDialogue(speaker, text, 7); },
  toast(text, seconds) { hud.showToast(text, seconds); },
  onWantedChange(stars) { hud.setWanted(stars); },
  onPlayerHurt() { game.lastHurtAt = game.time; },
  onMissionComplete() { saveProgress(); },
  onStoryComplete() { saveProgress(); },
  onBusted(reason) { endGame('BUSTED', reason); },
};

function saveProgress() {
  game.saveSnapshot = { cash: game.cash, missionIndex: game.missions.index, missionsDone: game.missions.index, ammo: game.ammo };
  writeSave(game.saveSnapshot);
  if (game.cash > readBestCash()) writeBestCash(game.cash);
}

function announce(message) {
  statusEl.textContent = message;
}

// ---- world construction ----------------------------------------------------
let city = null;

function buildWorld() {
  const rng = game.rng;
  city = createCity(scene, rng);
  const effects = createEffects(scene);
  const world = {
    colliders: city.colliders,
    landmarks: city.landmarks,
    cars: [],
    traffic: [],
    peds: createPedestrians(scene, rng, PED_COUNT),
    police: null,
    effects,
    threat: null,
    rng,
    onCrash: (speed) => {
      audio.crash();
      const car = game.player.inCar;
      if (car) effects.burst(new THREE.Vector3(car.pos.x, 1, car.pos.z), 0xffaa33, 12, 6, 0.4, 4);
    },
    onBump: (other) => {
      audio.crash();
      effects.burst(new THREE.Vector3(other.pos.x, 1, other.pos.z), 0xffcc66, 8, 5, 0.3, 3);
    },
    explodeCar: (car) => explodeCar(car),
  };
  game.world = world;
  game.player = createPlayer(scene, 8, 8);
  world.player = game.player;
  game.police = createPolice(scene);
  world.police = game.police;
  game.missions = createMissions(city.landmarks);
  game.pickups = createPickups(scene, rng);
  spawnTraffic();
  spawnParkedCars();
  return world;
}

function spawnTraffic() {
  const world = game.world;
  const rng = game.rng;
  for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
    const road = Math.round(rng.range(-4, 4)) * PITCH;
    const along = rng.range(-260, 260);
    let x = road;
    let z = along;
    let heading = rng.next() < 0.5 ? 0 : Math.PI;
    if (rng.next() < 0.5) {
      x = along;
      z = road;
      heading = rng.next() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    }
    const car = createCar(scene, 'traffic', rng.pick(TRAFFIC_COLORS), x, z, heading);
    car.targetHeading = heading;
    car.targetSpeed = rng.range(9, 14);
    world.cars.push(car);
    world.traffic.push(car);
  }
}

function spawnParkedCars() {
  const world = game.world;
  const rng = game.rng;
  // Parked cars sit in a road lane (4 m off the road centre), facing along the road,
  // so stealing one puts you straight onto a street, not into a building.
  const spots = [
    [40, -68, Math.PI / 2], [-68, 100, 0], [180, -140, -Math.PI / 2], [-36, 212, Math.PI / 2],
    [212, 40, 0], [-180, -68, -Math.PI / 2], [108, 140, Math.PI / 2], [-212, 148, Math.PI],
  ];
  for (const [x, z, heading] of spots) {
    const car = createCar(scene, 'parked', rng.pick(TRAFFIC_COLORS), x, z, heading);
    world.cars.push(car);
  }
}

function clearCars() {
  const world = game.world;
  for (const car of world.cars) scene.remove(car.group);
  world.cars = [];
  world.traffic = [];
  for (const cop of game.police.cops) scene.remove(cop.group);
  game.police = createPolice(scene);
  world.police = game.police;
}

function resetWorld(newSeed, saveData) {
  game.rng = createRandom(newSeed);
  game.world.rng = game.rng;
  game.time = 0;
  game.cash = saveData ? saveData.cash : 0;
  game.ammo = saveData ? saveData.ammo : 24;
  game.lastHurtAt = -999;
  game.lastShotAt = -999;
  clearCars();
  // Fresh pedestrians across town.
  for (const ped of game.world.peds) {
    ped.pos.set(game.rng.range(-260, 260), 0, game.rng.range(-260, 300));
    ped.target.copy(ped.pos);
    ped.state = 'walk';
    ped.stateTime = 0;
    ped.group.rotation.x = 0;
    ped.group.position.y = 0;
  }
  for (const p of game.pickups) {
    p.taken = false;
    p.mesh.visible = true;
  }
  game.player.pos.set(8, 0, 8);
  game.player.heading = Math.PI;
  game.player.health = PLAYER.maxHealth;
  game.player.inCar = null;
  game.player.group.visible = true;
  game.missions = createMissions(city.landmarks);
  if (saveData && saveData.missionIndex >= 5) {
    game.missions.index = 5;
    game.missions.storyDone = true;
  } else if (saveData) {
    game.missions.index = saveData.missionIndex;
  }
  spawnTraffic();
  spawnParkedCars();
  hud.setCash(game.cash);
  hud.setAmmo(game.ammo);
  hud.setHealth(game.player.health, PLAYER.maxHealth);
  hud.setWanted(0);
  setSunset(false);
  if (game.missions.index < 5) startMission(game.missions, game, game.missions.index);
}

game.resetWorld = resetWorld;

// ---- car entry, explosions, endings ----------------------------------------
function enterCar(car, silent) {
  const player = game.player;
  if (player.inCar) return;
  if (car.kind === 'traffic') {
    const i = game.world.traffic.indexOf(car);
    if (i >= 0) game.world.traffic.splice(i, 1);
    if (!silent) {
      game.addCrime(1, 'car stolen');
      game.toast('Car stolen!', 2.5);
      audio.denied();
    }
  } else if (car.kind === 'parked' && !silent) {
    game.addCrime(1, 'car stolen');
    game.toast('Car stolen!', 2.5);
  }
  car.stolen = true;
  player.inCar = car;
  player.group.visible = false;
  cameraRig.snapBehind(car.heading);
  announce('Driving. W A S D to drive, Space to handbrake, E to get out.');
}

function exitCar() {
  const player = game.player;
  const car = player.inCar;
  if (!car) return;
  const side = car.pos.x + Math.cos(car.heading) * 2.2;
  const sideZ = car.pos.z - Math.sin(car.heading) * 2.2;
  player.pos.set(side, 0, sideZ);
  player.heading = car.heading;
  player.inCar = null;
  player.group.visible = true;
  cameraRig.snapBehind(player.heading);
  announce('On foot.');
}

function explodeCar(car) {
  const world = game.world;
  const pos = new THREE.Vector3(car.pos.x, 1.2, car.pos.z);
  world.effects.burst(pos, 0xff7722, 46, 13, 0.9, 7);
  world.effects.burst(pos, 0x333333, 24, 7, 1.4, 1);
  world.effects.flash(pos, 0xff9933, 0.25);
  audio.explosion();
  if (car === game.player.inCar) {
    exitCar();
    game.player.health -= 25;
    game.onPlayerHurt();
  }
  const i = world.cars.indexOf(car);
  if (i >= 0) world.cars.splice(i, 1);
  const t = world.traffic.indexOf(car);
  if (t >= 0) world.traffic.splice(t, 1);
  const p = game.police.cars.indexOf(car);
  if (p >= 0) game.police.cars.splice(p, 1);
  scene.remove(car.group);
}

function endGame(title, reason) {
  if (game.state !== 'play') return;
  game.state = 'busted';
  audio.silence();
  saveProgress();
  // endTitle lives only on the end overlay, so this always writes the shown title.
  document.getElementById('endTitle').textContent = title;
  document.getElementById('endText').textContent = `${reason} Cash kept: $${game.cash}. The story continues from your last completed job.`;
  document.getElementById('end').classList.remove('hidden');
  hud.hide();
  announce(`${title}. ${reason}`);
}

function setSunset(on) {
  if (on) {
    sun.color.setHex(0xffb36b);
    sun.position.set(190, 70, 90);
    sun.intensity = 1.9;
    hemi.intensity = 0.55;
    scene.background.setHex(0xffd9a0);
    scene.fog.color.setHex(0xf2c98f);
  } else {
    sun.color.setHex(PALETTE.sun);
    sun.position.set(140, 200, 80);
    sun.intensity = 2.3;
    hemi.intensity = 1.05;
    scene.background.setHex(PALETTE.sky);
    scene.fog.color.setHex(PALETTE.fog);
  }
}
game.setSunset = setSunset;
game.enterCar = enterCar;

// ---- one fixed simulation step ----------------------------------------------
// Step order matters: the player first (so crimes land this step), then traffic
// and pedestrians (who react to the player's speed and gunfire), then police,
// missions and pickups (which read the results), and effects last.
function stepWorld(dt, sim) {
  const world = game.world;
  const player = game.player;
  game.time += dt;

  if (game.state === 'play') {
    if (player.inCar) {
      const car = player.inCar;
      updatePlayerCar(car, sim.drive || { throttle: 0, steer: 0, handbrake: false }, dt, world);
      // Running over pedestrians is a crime the whole city sees.
      for (const ped of world.peds) {
        if (ped.state === 'down') continue;
        const d = Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z);
        if (d < 2.0 && Math.abs(car.speed) > 3) {
          knockDown(ped);
          game.addCrime(1, 'pedestrian hit');
          game.toast('You hit a pedestrian!', 2);
          audio.crash();
        }
      }
      if (car.health <= 0) explodeCar(car);
      audio.setEngine(Math.abs(car.speed), true);
    } else {
      const mv = sim.move || { x: 0, z: 0 };
      updatePlayerOnFoot(player, mv.x, mv.z, !!sim.running, dt, world);
      audio.setEngine(0, false);
    }
    // Health slowly recovers when the heat is off.
    if (game.time - game.lastHurtAt > HEALTH_REGEN_DELAY && game.police.stars === 0 && player.health > 0) {
      healPlayer(player, HEALTH_REGEN_PER_SEC * dt);
    }
    if (player.health <= 0) {
      endGame('WASTED', 'Lena is out cold. The Solmar PD scrapes her off the boulevard.');
      return;
    }
    // Threat the pedestrians react to: a speeding car or a fresh gunshot.
    const speeding = player.inCar && Math.abs(player.inCar.speed) > 12;
    const threatPos = player.inCar ? player.inCar.pos : player.pos;
    world.threat = speeding || game.time - game.lastShotAt < 1
      ? { x: threatPos.x, z: threatPos.z }
      : null;
  }

  for (const car of world.traffic) updateTrafficCar(car, dt, world, game.rng, game.time);
  // Traffic can clip a pedestrian too (no crime — it wasn't you).
  for (const car of world.traffic) {
    if (Math.abs(car.speed) < 3) continue;
    for (const ped of world.peds) {
      if (ped.state === 'down') continue;
      if (Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z) < 1.9) knockDown(ped);
    }
  }
  updatePedestrians(world.peds, dt, world, game.rng, game.time);
  updatePolice(game.police, dt, world, game);
  updateMissions(game.missions, dt, game, world);
  updatePickups(game.pickups, dt, game, game.time);
  world.effects.update(dt);
  city.update(dt, game.time);
  audio.setSiren(game.police.stars > 0);
  if (player.health <= 0 && game.state === 'play') {
    endGame('WASTED', 'Lena is out cold. The Solmar PD scrapes her off the boulevard.');
  }
}
game.stepWorld = stepWorld;

function renderFrame() {
  const player = game.player;
  const focus = player.inCar ? player.inCar.pos : player.pos;
  const focusHeading = player.inCar ? player.inCar.heading : player.heading;
  const orbit = input.takeOrbit();
  if (orbit.dx || orbit.dy || orbit.wheel) cameraRig.orbit(orbit.dx, orbit.dy, orbit.wheel);
  // Real frame time, so the camera tracks tightly even when the display is slow.
  const now = performance.now();
  const frameDt = Math.min(0.1, Math.max(0.001, (now - (renderFrame._last || now)) / 1000));
  renderFrame._last = now;
  cameraRig.update(frameDt, focus, focusHeading, !!player.inCar);
  // Keep the camera out of buildings when the player hugs a wall.
  collideBuildings(camera.position, 1.5, game.world.colliders);
  camera.position.y = Math.max(camera.position.y, 1.2);
  // Sun and its shadows follow the player.
  sun.position.set(focus.x + 140, 200, focus.z + 80);
  sun.target.position.set(focus.x, 0, focus.z);
  sun.target.updateMatrixWorld();
  // Beacon over the current objective.
  const target = missionTarget(game.missions);
  if (target && game.state === 'play') {
    beacon.visible = true;
    beacon.position.set(target.x, 0, target.z);
    diamond.rotation.y += 0.03;
    diamond.position.y = 15 + Math.sin(game.time * 2) * 1.2;
  } else {
    beacon.visible = false;
  }
  if (game.state === 'play') {
    const obj = missionObjective(game.missions);
    const dist = target
      ? Math.hypot(target.x - focus.x, target.z - focus.z)
      : null;
    hud.setMission(obj.title, obj.text, dist, obj.timer);
    hud.setHealth(player.health, PLAYER.maxHealth);
    hud.setAmmo(game.ammo);
    hud.setSpeed(player.inCar ? Math.abs(player.inCar.speed) * 3.6 : 0, !!player.inCar);
    hud.drawMinimap(game.world, target);
    const near = player.inCar ? null : nearestCar(player, game.world.cars, 4);
    if (near) hud.showPrompt('Press E — steal the car');
    else hud.hidePrompt();
  }
  renderer.render(scene, camera);
}

// ---- screens and the loop ----------------------------------------------------
function startGame(saveData) {
  audio.unlock();
  resetWorld(Math.floor(Math.random() * 4294967296), saveData || null);
  game.state = 'play';
  document.getElementById('title').classList.add('hidden');
  document.getElementById('end').classList.add('hidden');
  document.getElementById('pause').classList.add('hidden');
  hud.show();
  announce('Playing. Follow the mission marker.');
}

function quitToTitle() {
  saveProgress();
  game.state = 'title';
  document.getElementById('pause').classList.add('hidden');
  document.getElementById('end').classList.add('hidden');
  document.getElementById('title').classList.remove('hidden');
  hud.hide();
  refreshTitleButtons();
  announce('Solmar. Press New Game or Continue.');
}

function refreshTitleButtons() {
  const save = loadSave();
  document.getElementById('btnContinue').classList.toggle('hidden', !save);
}

document.getElementById('btnStart').addEventListener('click', () => startGame(null));
document.getElementById('btnContinue').addEventListener('click', () => startGame(loadSave()));
document.getElementById('btnResume').addEventListener('click', () => {
  game.state = 'play';
  document.getElementById('pause').classList.add('hidden');
});
document.getElementById('btnQuit').addEventListener('click', quitToTitle);
document.getElementById('btnRetry').addEventListener('click', () => {
  document.getElementById('end').classList.add('hidden');
  startGame(game.saveSnapshot);
});
document.getElementById('btnEndTitle').addEventListener('click', quitToTitle);

function handleActions() {
  const actions = input.takeActions();
  if (!actions) return;
  if (actions & ACTION_MUTE) {
    audio.setMuted(!audio.isMuted());
    game.toast(audio.isMuted() ? 'Sound off' : 'Sound on', 1.5);
  }
  if (game.state === 'title') {
    if (actions & ACTION_CONFIRM) startGame(null);
    return;
  }
  if (game.state === 'busted') {
    if (actions & ACTION_CONFIRM) {
      document.getElementById('end').classList.add('hidden');
      startGame(game.saveSnapshot);
    }
    return;
  }
  if (actions & ACTION_PAUSE) {
    if (game.state === 'play') {
      game.state = 'paused';
      document.getElementById('pause').classList.remove('hidden');
      announce('Paused.');
    } else if (game.state === 'paused') {
      game.state = 'play';
      document.getElementById('pause').classList.add('hidden');
      announce('Playing.');
    }
    return;
  }
  if (game.state !== 'play') return;
  if (actions & ACTION_ENTER) {
    if (game.player.inCar) exitCar();
    else {
      const car = nearestCar(game.player, game.world.cars, 4);
      if (car) enterCar(car, false);
    }
  }
  if (actions & ACTION_SHOOT && !game.player.inCar) {
    const result = shoot(game, game.world);
    if (result !== 'noammo') game.lastShotAt = game.time;
  }
  if (actions & ACTION_PUNCH && !game.player.inCar) punch(game, game.world);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();
  let titleAngle = 0;
  refreshTitleButtons();
  announce('Solmar. Press New Game to start.');

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (game.state === 'title') {
      // Attract mode: the city lives behind the title, camera slowly orbiting the park.
      while (accumulator >= STEP) {
        game.time += STEP;
        for (const car of game.world.traffic) updateTrafficCar(car, STEP, game.world, game.rng, game.time);
        updatePedestrians(game.world.peds, STEP, game.world, game.rng, game.time);
        game.world.effects.update(STEP);
        city.update(STEP, game.time);
        accumulator -= STEP;
      }
      titleAngle += 0.0004;
      camera.position.set(Math.sin(titleAngle) * 120, 55, Math.cos(titleAngle) * 120);
      camera.lookAt(0, 8, 40);
    } else if (game.state === 'play') {
      while (accumulator >= STEP && game.state === 'play') {
        const sim = game.player.inCar
          ? { drive: input.drive() }
          : { move: input.moveVector(cameraRig.yaw), running: input.running() };
        stepWorld(STEP, sim);
        accumulator -= STEP;
      }
      if (game.state === 'play') {
        accumulator = 0;
        // Keep the save fresh so quitting mid-job never loses much progress.
        if (game.time - (game.lastSaveAt || 0) > AUTOSAVE_EVERY_SEC) {
          saveProgress();
          game.lastSaveAt = game.time;
        }
      }
    } else {
      accumulator = 0;
    }
    if (game.state !== 'title') renderFrame();
    else renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

function runShot(name) {
  const sceneResult = stageShot(name, game);
  // Shots are gameplay frames, not the title screen: hide every overlay.
  document.getElementById('title').classList.add('hidden');
  document.getElementById('pause').classList.add('hidden');
  document.getElementById('end').classList.add('hidden');
  // Let the follow camera settle on its target before the frame is taken.
  for (let i = 0; i < SETTLE_FRAMES; i += 1) renderFrame();
  // The settle takes real seconds under software rendering, longer than a dialogue
  // line or toast lasts: re-show the mission's line and title for the screenshot.
  const active = game.missions.active;
  if (active) {
    hud.showDialogue(active.dialogue[0], active.dialogue[1], 60);
    hud.showToast(active.title, 60);
  }
  let painted = 0;
  function paint() {
    renderFrame();
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

buildWorld();
if (params.get('debug')) window.__solmar = game; // play-test hook (?debug=1), not used by the game itself
if (shot) runShot(shot);
else runGame();
