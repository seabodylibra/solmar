// The story: five jobs for fixer Mr. Solano, from stealing your first ride to the big
// getaway, plus repeatable taxi fares once the story is done. Each mission names its
// objective, its map target and its reward; the game loop asks this module what to
// show and whether the player just finished (or failed) a job.
// Lifecycle: startMission opens a job, updateMissions watches it every step, and a
// job ends only through completeMission (reward + next job) or failMission (retry
// the same job) — the loop never advances the index itself.

import * as THREE from 'three';
import { MISSION_REWARDS, TAXI_FARE_MIN, TAXI_FARE_MAX, PITCH } from './config.js';

// Quiet seconds between taxi fares, so a new passenger never appears the
// instant the last one pays.
const TAXI_COOLDOWN = 18;
// How long after the story ends before the first taxi fare offers itself.
const FIRST_FARE_WAIT = 6;
// Distance to a marker that counts as arriving (story targets and taxi stops).
const ARRIVAL_DIST = 8;
// Grace period before a scripted wanted level may start decaying.
const SCRIPTED_HEAT_GRACE = 20;

const STORY = [
  {
    id: 'wheels',
    title: '1 · WHEELS',
    objective: 'Steal a car — any car. Press E near one.',
    dialogue: ['SOLANO', 'Lena, baby. You want work, you need wheels. Take any car on the street — nobody here locks their doors.'],
    target: null,
    reward: MISSION_REWARDS[0],
  },
  {
    id: 'pickup',
    title: '2 · THE PICKUP',
    objective: 'Drive to the Marina and collect the package.',
    dialogue: ['SOLANO', 'A package is waiting at the Marina, south-east docks. Bring it to me and don\'t stop for anyone.'],
    target: 'marina',
    reward: MISSION_REWARDS[1],
  },
  {
    id: 'heat',
    title: '3 · HEAT',
    objective: 'The cops are onto you. Lose the wanted level!',
    dialogue: ['SOLANO', 'Somebody talked. The PD has your plate — three stars, Lena. Shake them. Lay low till it cools off.'],
    target: null,
    wanted: 3,
    reward: MISSION_REWARDS[2],
  },
  {
    id: 'drop',
    title: '4 · THE DROP',
    objective: 'Deliver the package to North Tower — 90 seconds!',
    dialogue: ['SOLANO', 'North Tower, top of the map. My buyer waits ninety seconds, then walks. Drive like you mean it.'],
    target: 'northTower',
    timer: 90,
    reward: MISSION_REWARDS[3],
  },
  {
    id: 'getaway',
    title: '5 · THE GETAWAY',
    objective: 'Four stars and counting. Reach the beach and vanish.',
    dialogue: ['SOLANO', 'Last job, Lena. Every cop in Solmar is coming. Get to the beach, south-west — and don\'t look back.'],
    target: 'beach',
    wanted: 4,
    reward: MISSION_REWARDS[4],
  },
];

export function createMissions(landmarks) {
  return {
    landmarks,
    index: 0, // next story mission to start (0..5; 5 = story done)
    active: null, // the running mission definition, plus runtime state
    timer: 0,
    taxi: null, // {stage, target, fare, waitAt}
    storyDone: false,
  };
}

export function startMission(missions, game, index) {
  const def = STORY[index];
  if (!def) return;
  missions.active = { ...def, targetPos: def.target ? missions.landmarks[def.target].clone() : null };
  missions.timer = def.timer || 0;
  missions.index = index;
  game.dialogue(def.dialogue[0], def.dialogue[1]);
  game.toast(def.title, 3);
  if (def.wanted) {
    game.police.stars = def.wanted;
    game.police.lastCrimeAt = game.time;
    game.police.decayAt = game.time + SCRIPTED_HEAT_GRACE;
    game.onWantedChange?.(def.wanted);
  }
}

function completeMission(missions, game) {
  const def = missions.active;
  game.addCash(def.reward);
  game.audio.missionComplete();
  game.toast(`JOB DONE — +$${def.reward}`, 3);
  missions.active = null;
  missions.index += 1;
  if (missions.index >= STORY.length) {
    missions.storyDone = true;
    game.dialogue('SOLANO', 'That\'s the whole coast owing you now, Lena. Solmar is yours — drive fares, cause chaos, live large.');
    game.toast('STORY COMPLETE — SOLMAR IS YOURS', 4);
    game.onStoryComplete?.();
  } else {
    startMission(missions, game, missions.index);
  }
  // Save after the index moves, so Continue restarts the next job, not this one.
  game.onMissionComplete?.();
}

function failMission(missions, game, reason) {
  game.toast(`JOB FAILED — ${reason}`, 3);
  game.dialogue('SOLANO', 'Relax. We do it again. Same job, clean run this time.');
  startMission(missions, game, missions.index);
}

function randomRoadTarget(rng) {
  // Taxi stops sit on a road centreline (a multiple of the road pitch).
  const road = Math.round(rng.range(-4, 4)) * PITCH;
  const along = rng.range(-260, 260);
  if (rng.next() < 0.5) return new THREE.Vector3(along, 0, road);
  return new THREE.Vector3(road, 0, Math.min(along, 280));
}

export function updateMissions(missions, dt, game, world) {
  const playerPos = game.player.inCar ? game.player.inCar.pos : game.player.pos;
  const m = missions.active;
  if (m) {
    if (m.timer > 0) {
      m.timer -= dt;
      if (m.timer <= 0) {
        failMission(missions, game, 'out of time');
        return;
      }
    }
    if (m.id === 'wheels') {
      if (game.player.inCar) completeMission(missions, game);
    } else if (m.id === 'heat') {
      if (game.police.stars === 0) completeMission(missions, game);
    } else if (m.targetPos) {
      const d = Math.hypot(m.targetPos.x - playerPos.x, m.targetPos.z - playerPos.z);
      if (d < ARRIVAL_DIST) completeMission(missions, game);
    }
  }
  // Taxi fares: only in free roam, after the story.
  if (missions.storyDone) {
    const taxi = missions.taxi;
    if (!taxi) {
      missions.taxi = { stage: 'wait', target: null, fare: 0, waitAt: game.time + FIRST_FARE_WAIT };
    } else if (taxi.stage === 'wait' && game.time > taxi.waitAt) {
      taxi.stage = 'pickup';
      taxi.target = randomRoadTarget(world.rng);
      taxi.fare = 0;
      game.toast('TAXI FARE — pick up the passenger', 3);
    } else if (taxi.stage === 'pickup' && taxi.target) {
      if (Math.hypot(taxi.target.x - playerPos.x, taxi.target.z - playerPos.z) < ARRIVAL_DIST) {
        taxi.stage = 'dropoff';
        taxi.target = randomRoadTarget(world.rng);
        taxi.fare = Math.round(world.rng.range(TAXI_FARE_MIN, TAXI_FARE_MAX));
        game.toast('Passenger aboard — drive to the marker', 2.5);
        game.audio.pickup();
      }
    } else if (taxi.stage === 'dropoff' && taxi.target) {
      if (Math.hypot(taxi.target.x - playerPos.x, taxi.target.z - playerPos.z) < ARRIVAL_DIST) {
        game.addCash(taxi.fare);
        game.audio.cash();
        game.toast(`FARE PAID — +$${taxi.fare}`, 2.5);
        missions.taxi = { stage: 'wait', target: null, fare: 0, waitAt: game.time + TAXI_COOLDOWN };
      }
    }
  }
}

/** The current map target: story marker first, then the taxi fare. */
export function missionTarget(missions) {
  if (missions.active?.targetPos) return missions.active.targetPos;
  if (missions.taxi?.target) return missions.taxi.target;
  return null;
}

export function missionObjective(missions) {
  if (missions.active) return { title: missions.active.title, text: missions.active.objective, timer: missions.active.timer || 0 };
  if (missions.taxi?.stage === 'pickup') return { title: 'TAXI FARE', text: 'Pick up the passenger at the marker.', timer: 0 };
  if (missions.taxi?.stage === 'dropoff') return { title: 'TAXI FARE', text: `Drop the passenger off — fare $${missions.taxi.fare}.`, timer: 0 };
  if (missions.storyDone) return { title: 'FREE ROAM', text: 'Solmar is yours. A taxi fare will appear shortly.', timer: 0 };
  return { title: 'SOLMAR', text: 'Welcome to Solmar.', timer: 0 };
}
