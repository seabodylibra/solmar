// Every tuning number and colour in one place. Solmar is a grid city: roads run on a
// 72 m pitch, blocks are 56 m of buildings between 16 m roads, and the beach and sea
// lie to the south (+z). The simulation runs in fixed 1/60 s steps.
// Coordinate note: +x is east, +z is south (toward the sea), -z is north into the city;
// headings follow the same convention (0 = north, growing clockwise from above).

export const STEP = 1 / 60;
// Same step in milliseconds, for timers that think in wall-clock time.
export const STEP_MS = 1000 / 60;

/** City geometry: roads at x = k*PITCH and z = k*PITCH, k in [-4..4]. */
export const PITCH = 72;
export const ROAD_W = 16;
export const BLOCK = PITCH - ROAD_W;
export const GRID = 4; // roads from -4*PITCH to +4*PITCH
export const CITY_EDGE = GRID * PITCH + ROAD_W / 2; // 296
export const BEACH_Z = CITY_EDGE + 26; // sand starts here
export const SEA_Z = BEACH_Z + 46; // water starts here

export const PLAYER = {
  walkSpeed: 5.2,
  runSpeed: 8.5,
  radius: 0.55,
  maxHealth: 100,
  punchDamage: 12,
  // A touch beyond arm's length: melee should connect when it looks like it does.
  punchRange: 2.4,
};

export const CAR = {
  accel: 16,
  brake: 30,
  reverseMax: 12,
  maxSpeed: 40, // ~144 km/h
  steerMax: 0.62, // radians of wheel angle at low speed
  grip: 6.5,
  maxHealth: 100,
};

export const TRAFFIC_COUNT = 16;
export const PED_COUNT = 26;
export const POLICE_MAX_CARS = 4;

export const WANTED = {
  stealCar: 1,
  hitPed: 1,
  shoot: 1,
  killCop: 2,
  max: 5,
  // After this many quiet seconds with no cop nearby, one star falls every
  // decayEvery seconds; a fresh crime restarts the whole quiet period.
  decayDelay: 14, // seconds with no crime and no cop near before stars fall
  decayEvery: 9, // seconds per star once decaying
};

/** Cash rewards for the story missions, in order. */
export const MISSION_REWARDS = [150, 300, 400, 500, 800];
export const TAXI_FARE_MIN = 60;
export const TAXI_FARE_MAX = 130;

export const PALETTE = {
  sky: 0x8ec9e8,
  horizon: 0xffe3b3,
  fog: 0xcfe4ef,
  sun: 0xfff1cf,
  asphalt: 0x33373d,
  sidewalk: 0x9aa0a3,
  sand: 0xe8d29a,
  sea: 0x2e7fb8,
  seaDeep: 0x1d5f96,
  grass: 0x5d9b4a,
  building: [0xd8c9b0, 0xc9b8a3, 0xb8c4cc, 0xe0d6c2, 0xc4a882, 0xa8b8c4, 0xd0b0a0, 0x9fb8a8],
  glass: 0x7fb2d9,
  palmTrunk: 0x8a6a4a,
  palmLeaf: 0x3f8f4f,
};

export const SAVE_KEY = 'solmar.save.v1';
export const BEST_KEY = 'solmar.best.v1';
