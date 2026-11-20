// Solmar — every tuning number and colour in one place.
// Top-down open world: a coastal city on a 2560x1920 map. Roads form a grid;
// the south edge is a beach with the ocean beyond it.

export const WORLD = { w: 2560, h: 1920 };

export const ROAD = {
  spacing: 320,
  width: 72,
  // Centres of the vertical roads, west to east.
  vertical: [160, 480, 800, 1120, 1440, 1760, 2080, 2400],
  // Centres of the horizontal roads, north to south. The last one is the
  // beachfront boulevard.
  horizontal: [160, 480, 800, 1120, 1440, 1760],
};

// South of this line the ground is sand; south of OCEAN_Y it is water.
export const BEACH_Y = 1796;
export const OCEAN_Y = 1872;

// Named places the missions and the HUD point at.
export const PLACES = {
  garage: { x: 480, y: 560, label: 'Solmar Garage' },
  hospital: { x: 2080, y: 560, label: 'St. Marina Hospital' },
  policeStation: { x: 1440, y: 1200, label: 'Solmar PD' },
  bank: { x: 1120, y: 880, label: 'First Solmar Bank' },
  docks: { x: 240, y: 1440, label: 'The Docks' },
  marina: { x: 1760, y: 1840, label: 'Marina' },
  hideout: { x: 2400, y: 1520, label: 'Hideout' },
  office: { x: 800, y: 1200, label: "Solano's Office" },
  plaza: { x: 1120, y: 480, label: 'Plaza del Sol' },
};

export const PLAYER = {
  walk: 150,
  run: 235,
  radius: 13,
  health: 100,
  punchRange: 34,
  punchDamage: 25,
  punchCooldown: 0.45,
};

export const PISTOL = {
  mag: 12,
  reserveStart: 48,
  damage: 34,
  range: 460,
  cooldown: 0.16,
  reloadTime: 1.1,
  bulletSpeed: 900,
};

export const CAR = {
  radius: 17,
  length: 46,
  width: 22,
  accel: 340,
  brake: 520,
  reverseMax: 110,
  drag: 0.55,
  grip: 2.6,
  handbrakeGrip: 0.35,
  maxSpeed: 420,
  sportsMax: 520,
  truckMax: 330,
  health: 100,
};

export const TRAFFIC = { count: 26, parked: 14, speed: 95, speedJitter: 30 };
export const PEDS = { count: 42, walk: 42, run: 150 };
export const COP = {
  carSpeed: 400,
  footSpeed: 165,
  bustRadius: 42,
  bustTime: 2.2,
  maxCars: 5,
  maxFoot: 6,
};

export const WANTED = {
  max: 5,
  decayDelay: 18,
  decayInterval: 14,
  steal: 1,
  hitPed: 1,
  shoot: 1,
  killCop: 2,
  explode: 1,
};

export const STEP = 1 / 60;
export const SAVE_KEY = 'solmar.save.v1';

export const PALETTE = {
  grass: '#7fae5a',
  grassDark: '#6f9c4e',
  sidewalk: '#c9c2b4',
  sidewalkEdge: '#b3ab9a',
  asphalt: '#3d3f45',
  asphaltLine: '#e8d44d',
  curb: '#9a938a',
  sand: '#ecd9a0',
  sandWet: '#dcc78d',
  ocean: '#2e8fb8',
  oceanDeep: '#1f6f96',
  oceanFoam: '#bfe8f2',
  building: ['#e8b4a0', '#a8c4d4', '#d4c49a', '#c4a8cc', '#e0a080', '#9ab8a0', '#d48c8c', '#8fa8c8'],
  roof: ['#f0f0e8', '#e0d8c8', '#c8d4d8', '#d8c8b8'],
  palm: '#3e8f4f',
  palmTrunk: '#8a6a4a',
  player: '#ff5a3c',
  playerDark: '#c23a24',
  police: '#2b5fd9',
  policeDark: '#1a3a8a',
  taxi: '#f2c200',
  sports: '#e83e8c',
  sedan: '#5a7a9a',
  van: '#8a8a92',
  truck: '#a06a3a',
  text: '#ffffff',
  textDark: '#22242a',
  hud: 'rgba(12, 16, 24, 0.72)',
  star: '#ffd94a',
  starEmpty: 'rgba(255,255,255,0.28)',
  waypoint: '#ffd94a',
  health: '#58d158',
  healthLow: '#e5484d',
  cash: '#7be07b',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
