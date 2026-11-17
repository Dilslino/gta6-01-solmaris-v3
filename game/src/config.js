// Solmaris — every tuning number, colour and layout constant in one place.
// The world is a fixed 3600x2520 logical city; the camera shows a 1280x720 window of it.

export const WORLD = { width: 3600, height: 2520 };
export const VIEW = { width: 1280, height: 720 };
export const STEP = 1 / 60;
export const ROAD_WIDTH = 64;

// 9 avenues (vertical) x 7 streets (horizontal): the road graph the city is built on.
export const AVENUES = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000, 3400];
export const STREETS = [180, 540, 900, 1260, 1620, 1980, 2340];

export const DISTRICTS = [
  { name: 'Marina Bay', x0: 0, y0: 0, x1: 1000, y1: 1260, tint: '#2f7f8f' },
  { name: 'Old Harbor', x0: 0, y0: 1260, x1: 1000, y1: 2520, tint: '#8f6b3a' },
  { name: 'Palm Court', x0: 1000, y0: 0, x1: 2200, y1: 1260, tint: '#3f8f5a' },
  { name: 'Sunvale', x0: 1000, y0: 1260, x1: 2200, y1: 2520, tint: '#a8873c' },
  { name: 'Coral Heights', x0: 2200, y0: 0, x1: 3600, y1: 2520, tint: '#7a5a9e' },
];

export const PLAYER = {
  radius: 13,
  walkSpeed: 230,
  runSpeed: 320,
  health: 100,
  punchDamage: 12,
  punchRange: 34,
  punchCooldown: 0.38,
};

export const CAR = {
  length: 64,
  width: 30,
  accel: 420,
  brake: 700,
  reverseAccel: 260,
  maxSpeed: 560,
  maxReverse: 180,
  steer: 2.6,
  grip: 3.2,
};

export const TRAFFIC_COUNT = 14;
export const PED_COUNT = 26;

export const WEAPONS = {
  fists: { name: 'Fists', damage: 12, range: 34, rate: 0.38, auto: false },
  bat: { name: 'Alley Bat', damage: 26, range: 46, rate: 0.5, auto: false, price: 50 },
  pistol: { name: 'P9 Pistol', damage: 34, range: 520, rate: 0.22, auto: false, price: 400, mag: 12, ammoPrice: 20, ammoQty: 12 },
};

export const SHOPS = [
  { id: 'taco', name: 'Taco Sol', kind: 'food', x: 800, y: 720, color: '#e2703a', items: [
    { key: '1', name: 'Street Taco', desc: '+25 health', price: 10, apply: 'food25' },
    { key: '2', name: 'Solmaris Feast', desc: 'Full health', price: 25, apply: 'foodFull' },
    { key: '3', name: 'Churro Box', desc: '+10 health, tasty', price: 5, apply: 'food10' },
  ]},
  { id: 'lumen', name: 'Lumen Outfits', kind: 'clothes', x: 2000, y: 720, color: '#c94f7c', items: [
    { key: '1', name: 'Harbor Tee', desc: 'Teal street look', price: 80, apply: 'outfitTeal' },
    { key: '2', name: 'Coral Jacket', desc: 'Sunset orange look', price: 120, apply: 'outfitOrange' },
    { key: '3', name: 'Night Runner', desc: 'Stealth black look', price: 150, apply: 'outfitBlack' },
  ]},
  { id: 'harbor', name: 'Harbor Arms', kind: 'weapons', x: 800, y: 1800, color: '#5a6b7a', items: [
    { key: '1', name: 'Alley Bat', desc: 'Melee, 26 dmg', price: 50, apply: 'buyBat' },
    { key: '2', name: 'P9 Pistol', desc: '12-round mag', price: 400, apply: 'buyPistol' },
    { key: '3', name: 'Pistol Ammo x12', desc: 'Needs the pistol', price: 20, apply: 'buyAmmo' },
  ]},
];

export const OUTFITS = {
  default: { shirt: '#3fa7d6', pants: '#2b3a4a' },
  outfitTeal: { shirt: '#17a398', pants: '#22303a' },
  outfitOrange: { shirt: '#e2703a', pants: '#3a2b22' },
  outfitBlack: { shirt: '#23272e', pants: '#14161a' },
};

export const PALETTE = {
  backdrop: '#0d1520',
  water: '#1d6f8e',
  waterDeep: '#155a74',
  sand: '#d9c08a',
  grass: '#5d9e52',
  grassDark: '#4c8a44',
  sidewalk: '#9aa0a3',
  road: '#3a3f46',
  roadEdge: '#2c3036',
  roadLine: '#e8c84a',
  roadShade: 'rgba(0,0,0,0.18)',
  buildingWall: '#c9b8a3',
  plaza: '#b8b0a0',
  text: '#f2f5f7',
  muted: '#aeb8c2',
  panel: 'rgba(16,22,30,0.92)',
  gold: '#f2c94c',
  red: '#e5534b',
  police: '#2f6fd6',
};

export const SAVE_KEY = 'solmaris.save.v1';
export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
