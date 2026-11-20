// Solmar's story: Lena Cruz, getaway driver, working jobs for the fixer
// Mr. Solano. Five missions in a chain, each a list of stages (go somewhere,
// get in a kind of car, grab something, beat a clock). A waypoint marks the
// current goal on the map and the minimap; dialogue lines play at each
// beat. Taxis and courier packages offer side cash between jobs.

import { PLACES } from './config.js';
import { pick, range } from './random.js';

export const MISSIONS = [
  {
    id: 1,
    title: 'First Pickup',
    reward: 200,
    briefing: "Mr. Solano: Lena, a client left a red sports car at Plaza del Sol. Bring it to my garage. Don't scratch it.",
    stages: [
      { type: 'goto', x: PLACES.plaza.x, y: PLACES.plaza.y, r: 80, text: 'Get to the sports car at Plaza del Sol' },
      { type: 'enter', kind: 'sports', text: 'Get in the sports car' },
      { type: 'goto', x: PLACES.garage.x, y: PLACES.garage.y, r: 90, text: 'Bring the car to Solmar Garage' },
    ],
  },
  {
    id: 2,
    title: 'The Package',
    reward: 250,
    briefing: "A package is waiting at the docks. Pick it up and bring it to my office. Keep your head down.",
    stages: [
      { type: 'goto', x: PLACES.docks.x, y: PLACES.docks.y, r: 80, text: 'Pick up the package at the Docks' },
      { type: 'goto', x: PLACES.office.x, y: PLACES.office.y, r: 80, text: "Deliver the package to Solano's Office" },
    ],
  },
  {
    id: 3,
    title: 'Hot Pursuit',
    reward: 350,
    briefing: 'The cops impounded a taxi with my ledger inside. Steal a taxi, then lose the heat and bring it to the hideout.',
    stages: [
      { type: 'enter', kind: 'taxi', text: 'Steal a taxi' },
      { type: 'goto', x: PLACES.hideout.x, y: PLACES.hideout.y, r: 100, text: 'Lose the cops and reach the Hideout', clearWanted: true },
    ],
  },
  {
    id: 4,
    title: 'The Courier',
    reward: 400,
    briefing: 'A client needs a delivery across town in 90 seconds. No excuses, no stops.',
    stages: [
      { type: 'goto', x: PLACES.docks.x, y: PLACES.docks.y, r: 80, text: 'Pick up the delivery at the Docks' },
      { type: 'timed', x: PLACES.hospital.x, y: PLACES.hospital.y, r: 90, seconds: 90, text: 'Deliver to St. Marina Hospital — fast!' },
    ],
  },
  {
    id: 5,
    title: 'The Big Score',
    reward: 800,
    briefing: "The bank. In and out, grab the cash, and don't stop until you see the marina. This is the one, Lena.",
    stages: [
      { type: 'goto', x: PLACES.bank.x, y: PLACES.bank.y, r: 80, text: 'Get to First Solmar Bank' },
      { type: 'grab', x: PLACES.bank.x, y: PLACES.bank.y, r: 70, text: 'Grab the cash', stars: 4, take: 500 },
      { type: 'goto', x: PLACES.marina.x, y: PLACES.marina.y, r: 100, text: 'Escape to the Marina boat', clearWanted: true },
    ],
  },
];

export function say(G, speaker, text, seconds = 5) {
  G.dialogue = { speaker, text, until: G.time + seconds };
}

export function startMission(G, index) {
  const def = MISSIONS[index];
  if (!def) {
    G.mission = null;
    return;
  }
  G.mission = {
    index,
    def,
    stage: 0,
    timer: 0,
    target: null,
    objective: def.stages[0].text,
    startedAt: G.time,
  };
  say(G, 'Mr. Solano', def.briefing, 6);
  updateTarget(G);
}

function updateTarget(G) {
  const m = G.mission;
  if (!m) return;
  const stage = m.def.stages[m.stage];
  if (!stage) {
    m.target = null;
    return;
  }
  m.objective = stage.text;
  if (stage.x !== undefined) {
    m.target = { x: stage.x, y: stage.y, label: stage.text };
  } else {
    m.target = null;
  }
}

function completeMission(G) {
  const m = G.mission;
  const def = m.def;
  G.player.cash += def.reward;
  G.audio.jingle();
  say(G, 'Mr. Solano', `Job done. $${def.reward} is yours, Lena.`, 5);
  G.stats.missionsDone += 1;
  const next = m.index + 1;
  if (next >= MISSIONS.length) {
    G.storyDone = true;
    G.player.cash += 500;
    say(G, 'Mr. Solano', 'That was the big one. Solmar is yours now — enjoy it.', 7);
    G.mission = null;
    return;
  }
  G.mission = null;
  G._nextMissionAt = G.time + 3;
  G._nextMissionIndex = next;
}

function failMission(G) {
  say(G, 'Mr. Solano', 'Too slow. Shake it off and run it again.', 5);
  const index = G.mission.index;
  G.mission = null;
  G._nextMissionAt = G.time + 2;
  G._nextMissionIndex = index;
}

function stageDone(G, stage) {
  const p = G.player;
  if (stage.type === 'goto' || stage.type === 'timed' || stage.type === 'grab') {
    return Math.hypot(p.x - stage.x, p.y - stage.y) < stage.r;
  }
  if (stage.type === 'enter') {
    return !!p.inCar && p.inCar.kind === stage.kind;
  }
  return false;
}

function applyStage(G, stage) {
  if (stage.type === 'grab') {
    G.player.cash += stage.take || 0;
    G.wanted.add(stage.stars || 3, 'robbed the bank', G.time);
    G.danger = { x: G.player.x, y: G.player.y, radius: 320, until: G.time + 2 };
    say(G, 'Lena', 'Got it — now run!', 3);
  }
  if (stage.clearWanted) {
    G.wanted.stars = 0;
    G.wanted.busted = 0;
    say(G, 'Lena', 'Clean. They lost me.', 3);
  }
}

export function updateMissions(G, dt) {
  // Delayed start of the next mission (after one ends or fails).
  if (G._nextMissionAt !== undefined && G.time >= G._nextMissionAt) {
    const index = G._nextMissionIndex;
    G._nextMissionAt = undefined;
    startMission(G, index);
  }
  const m = G.mission;
  if (!m) return;
  const stage = m.def.stages[m.stage];
  if (!stage) return;

  if (stage.type === 'timed') {
    if (m.timer <= 0) m.timer = stage.seconds;
    m.timer -= dt;
    if (m.timer <= 0) {
      failMission(G);
      return;
    }
  }

  if (stageDone(G, stage)) {
    applyStage(G, stage);
    // Stealing the taxi in mission 3 draws the heat.
    if (m.def.id === 3 && m.stage === 0) {
      G.wanted.add(2, 'stole the ledger taxi', G.time);
      say(G, 'Dispatch', 'All units: stolen taxi, last seen downtown.', 4);
    }
    m.stage += 1;
    if (m.stage >= m.def.stages.length) {
      completeMission(G);
      return;
    }
    const next = m.def.stages[m.stage];
    m.timer = 0;
    updateTarget(G);
    if (next.type === 'timed') say(G, 'Mr. Solano', `${next.seconds} seconds. Go!`, 3);
  }
}

/** The current waypoint (mission first, then the side job). */
export function currentTarget(G) {
  if (G.mission && G.mission.target) return G.mission.target;
  if (G.job && G.job.target) return G.job.target;
  return null;
}

// ---- Side jobs: taxi fares and courier packages. ----

function spawnTaxiFare(G) {
  const ped = pick(G.rng, G.peds.filter((p) => p.down <= 0 && p.state === 'walk'));
  if (!ped) return;
  G.job = {
    type: 'taxi',
    stage: 'pickup',
    fare: ped,
    target: { x: ped.x, y: ped.y, label: 'Taxi fare' },
    reward: 0,
    timer: 0,
  };
}

function spawnCourier(G) {
  const spot = G.city.randomRoadPoint();
  G.job = {
    type: 'courier',
    stage: 'pickup',
    target: { x: spot.x, y: spot.y, label: 'Courier package' },
    reward: 0,
    timer: 0,
    dest: null,
  };
}

export function updateJobs(G, dt) {
  const p = G.player;
  // Offer a taxi fare while driving a taxi.
  if (!G.job && p.inCar && p.inCar.kind === 'taxi') {
    G._taxiWait = (G._taxiWait ?? 0) + dt;
    if (G._taxiWait > 6) {
      G._taxiWait = 0;
      spawnTaxiFare(G);
      if (G.job) say(G, 'Fare', 'Taxi! Over here!', 3);
    }
  }
  // Offer a courier package now and then when nothing else is going on.
  if (!G.job && !p.inCar) {
    G._courierWait = (G._courierWait ?? 0) + dt;
    if (G._courierWait > 50) {
      G._courierWait = 0;
      spawnCourier(G);
    }
  }
  const job = G.job;
  if (!job) return;

  if (job.type === 'taxi') {
    if (job.stage === 'pickup') {
      if (!p.inCar || p.inCar.kind !== 'taxi') {
        G.job = null;
        return;
      }
      const fare = job.fare;
      job.target = { x: fare.x, y: fare.y, label: 'Taxi fare' };
      if (Math.hypot(p.x - fare.x, p.y - fare.y) < 48) {
        // Passenger hops in.
        fare.down = 999;
        G.peds = G.peds.filter((q) => q !== fare);
        const spot = G.city.randomRoadPoint();
        job.stage = 'dropoff';
        job.dest = spot;
        job.target = { x: spot.x, y: spot.y, label: 'Drop off the fare' };
        job.reward = 50 + Math.round(Math.hypot(spot.x - fare.x, spot.y - fare.y) / 100) * 10;
        say(G, 'Fare', 'Downtown, and step on it!', 3);
      }
    } else if (job.stage === 'dropoff') {
      if (Math.hypot(p.x - job.dest.x, p.y - job.dest.y) < 55) {
        p.cash += job.reward;
        G.audio.pickup();
        say(G, 'Fare', `Thanks! Keep the change — $${job.reward}.`, 3);
        G.job = null;
      }
    }
    return;
  }

  if (job.type === 'courier') {
    if (job.stage === 'pickup') {
      if (Math.hypot(p.x - job.target.x, p.y - job.target.y) < 38) {
        const spot = G.city.randomRoadPoint();
        job.stage = 'deliver';
        job.dest = spot;
        job.target = { x: spot.x, y: spot.y, label: 'Deliver the package' };
        job.timer = 60;
        job.reward = 60;
        say(G, 'Dispatch', 'Package collected. 60 seconds to deliver.', 3);
      }
    } else if (job.stage === 'deliver') {
      job.timer -= dt;
      if (job.timer <= 0) {
        say(G, 'Dispatch', 'Too slow — the package went to someone else.', 3);
        G.job = null;
        return;
      }
      if (Math.hypot(p.x - job.dest.x, p.y - job.dest.y) < 55) {
        p.cash += job.reward;
        G.audio.pickup();
        say(G, 'Dispatch', `Delivered. $${job.reward} on its way.`, 3);
        G.job = null;
      }
    }
  }
}
