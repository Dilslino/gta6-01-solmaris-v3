// Solmaris world: the city, its traffic, pedestrians, police, missions, combat and economy.
// Pure rules and state — no drawing, no browser — so the shot stager can step it deterministically.
import {
  WORLD, VIEW, AVENUES, STREETS, ROAD_WIDTH, DISTRICTS, PLAYER, CAR, TRAFFIC_COUNT, PED_COUNT,
  WEAPONS, SHOPS, OUTFITS,
} from './config.js';
import { createRandom, pick, range, intRange } from './random.js';

export const EVENT_MISSION = 1;
export const EVENT_BUSTED = 2;
export const EVENT_WASTED = 4;
export const EVENT_SHOT = 8;
export const EVENT_CRASH = 16;
export const EVENT_CASH = 32;
export const EVENT_PICKUP = 64;
export const EVENT_STEAL = 128;
export const EVENT_KILL = 256;
export const EVENT_HIT = 512;

const CAR_COLORS = ['#d64545', '#3f7fd6', '#e8c84a', '#7ec850', '#e8e8e8', '#f28c28', '#8e6fc0', '#2b2f36', '#d67ab0'];
const BUILDING_COLORS = ['#c9b8a3', '#b7a58e', '#d6c7b2', '#a89a86', '#c2b49a', '#8fa8b8', '#b8c4a8', '#d8b48f'];
const PED_SHIRTS = ['#e2703a', '#3fa7d6', '#7ec850', '#e8c84a', '#c94f7c', '#8e6fc0', '#5a6b7a', '#f2f5f7'];

export const MISSIONS = [
  {
    id: 1, name: 'First Wheels', giver: 'Rico', reward: 150,
    intro: 'Rico needs wheels. Borrow a car and bring it to Palm Court.',
    steps: [
      { type: 'talk', x: 400, y: 360, label: 'Talk to Rico at Marina Plaza', npc: 'Rico' },
      { type: 'driveTo', x: 1600, y: 720, label: 'Drive the car to Palm Court Plaza', needCar: true },
    ],
  },
  {
    id: 2, name: 'Harbor Run', giver: 'Rico', reward: 300,
    intro: 'A package waits at the Old Harbor docks. Pick it up, drop it in Sunvale.',
    steps: [
      { type: 'pickup', x: 800, y: 1440, label: 'Pick up the package at Old Harbor', item: 'Sealed package' },
      { type: 'goto', x: 1200, y: 1800, label: 'Deliver the package to Sunvale Plaza' },
    ],
  },
  {
    id: 3, name: 'Getaway Driver', giver: 'Mara', reward: 600,
    intro: 'Three checkpoints, 75 seconds. Drive like the harbor cops are already behind you.',
    steps: [
      { type: 'timed', time: 75, points: [[2000, 1080], [2800, 1800], [400, 360]], label: 'Hit all 3 checkpoints in time' },
    ],
  },
  {
    id: 4, name: 'Muscle', giver: 'Mara', reward: 900,
    intro: 'Three dock thugs are shaking down Sunvale vendors. Sort them out — fists work fine.',
    steps: [
      { type: 'eliminate', x: 1200, y: 1800, count: 3, label: 'Deal with the 3 thugs at Sunvale Plaza' },
    ],
  },
  {
    id: 5, name: 'Arms Deal', giver: 'Vex', reward: 2000,
    intro: 'Vex’s buyers got jumped by Coral Heights guards. Clear the plaza — bring a gun.',
    steps: [
      { type: 'eliminate', x: 2400, y: 1080, count: 4, label: 'Clear the 4 guards at Coral Heights Plaza' },
    ],
  },
  {
    id: 6, name: 'The Solmaris Job', giver: 'Vex', reward: 5000,
    intro: 'The big one: grab the cash at the Coral Bank plaza and lose a 3-star tail to the safehouse.',
    steps: [
      { type: 'goto', x: 2000, y: 1080, label: 'Reach the Coral Bank plaza' },
      { type: 'pickup', x: 2000, y: 1080, label: 'Grab the cash', item: 'Cash bag', setWanted: 3 },
      { type: 'goto', x: 400, y: 360, label: 'Escape to the Marina safehouse', escape: true },
    ],
  },
];

const PLAZAS = {
  marina: { x: 400, y: 360 }, harbor: { x: 800, y: 1440 }, palm: { x: 1600, y: 720 },
  sunvale: { x: 1200, y: 1800 }, coral: { x: 2400, y: 1080 }, bank: { x: 2000, y: 1080 },
};

function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function districtAt(x, y) {
  for (const d of DISTRICTS) if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
  return DISTRICTS[0];
}

export function onRoad(x, y) {
  for (const a of AVENUES) if (Math.abs(x - a) <= ROAD_WIDTH / 2) return true;
  for (const s of STREETS) if (Math.abs(y - s) <= ROAD_WIDTH / 2) return true;
  return false;
}

export function createWorld(random) {
  // ---- city generation (seeded, runs once) ----
  const buildings = [];
  const trees = [];
  const parks = [];
  const plazaSet = new Set(Object.values(PLAZAS).map((p) => `${p.x},${p.y}`));
  const shopSpots = SHOPS.map((s) => ({ x: s.x, y: s.y, shop: s }));

  for (let i = 0; i < AVENUES.length - 1; i += 1) {
    for (let j = 0; j < STREETS.length - 1; j += 1) {
      const x0 = AVENUES[i] + ROAD_WIDTH / 2 + 14;
      const x1 = AVENUES[i + 1] - ROAD_WIDTH / 2 - 14;
      const y0 = STREETS[j] + ROAD_WIDTH / 2 + 14;
      const y1 = STREETS[j + 1] - ROAD_WIDTH / 2 - 14;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const plazaHere = [...plazaSet].some((k) => {
        const [px, py] = k.split(',').map(Number);
        return px > x0 && px < x1 && py > y0 && py < y1;
      });
      const shopHere = shopSpots.find((s) => s.x > x0 && s.x < x1 && s.y > y0 && s.y < y1);
      if (plazaHere) {
        parks.push({ x: cx, y: cy, w: x1 - x0, h: y1 - y0, plaza: true });
        for (let t = 0; t < 8; t += 1) {
          trees.push({ x: range(random, x0 + 20, x1 - 20), y: range(random, y0 + 20, y1 - 20), r: range(random, 12, 20), palm: random() < 0.6 });
        }
        continue;
      }
      if (shopHere) {
        buildings.push({
          x: shopHere.x - 70, y: shopHere.y - 46, w: 140, h: 92,
          color: shopHere.shop.color, roof: '#2b2f36', height: intRange(random, 1, 2), shop: shopHere.shop.id,
        });
        trees.push({ x: x0 + 30, y: y0 + 30, r: 15, palm: true });
        trees.push({ x: x1 - 30, y: y1 - 30, r: 15, palm: true });
        continue;
      }
      const roll = random();
      if (roll < 0.16) {
        parks.push({ x: cx, y: cy, w: x1 - x0, h: y1 - y0, plaza: false });
        for (let t = 0; t < 10; t += 1) {
          trees.push({ x: range(random, x0 + 16, x1 - 16), y: range(random, y0 + 16, y1 - 16), r: range(random, 12, 22), palm: random() < 0.5 });
        }
        continue;
      }
      const n = random() < 0.6 ? 2 : 1;
      for (let b = 0; b < n; b += 1) {
        const bw = range(random, 110, 190);
        const bh = range(random, 90, 160);
        const bx = n === 1 ? cx - bw / 2 : x0 + 20 + b * ((x1 - x0 - bw - 40) / Math.max(1, n - 1));
        const by = cy - bh / 2 + range(random, -14, 14);
        buildings.push({
          x: bx, y: by, w: bw, h: bh,
          color: pick(random, BUILDING_COLORS), roof: pick(random, ['#7a6a58', '#5a6b7a', '#8a5a4a', '#4a5a6a']),
          height: intRange(random, 1, 4), shop: null,
        });
      }
      if (random() < 0.5) trees.push({ x: range(random, x0 + 20, x1 - 20), y: range(random, y0 + 20, y1 - 20), r: 14, palm: random() < 0.5 });
    }
  }

  // ---- state ----
  const player = {
    x: 400, y: 470, angle: -Math.PI / 2, health: PLAYER.health, money: 200,
    weapon: 'fists', ammo: 0, reserveAmmo: 0, hasBat: false, hasPistol: false,
    outfit: 'default', inCar: null, punchTimer: 0, shootTimer: 0, reloadTimer: 0,
    hurtTimer: 0, arrestTimer: 0, ramImmune: 0, dead: false,
  };
  const camera = { x: 400, y: 470 };
  const state = {
    player, camera, buildings, trees, parks,
    cars: [], peds: [], police: [], enemies: [], bullets: [], particles: [], texts: [],
    wanted: 0, wantedTimer: 0, hideTimer: 0, heli: null, roadblocks: [],
    missionIndex: 0, missionStep: 0, missionTimer: 0, missionDone: false, missionActive: true,
    elapsed: 0, clockMinutes: 9 * 60, message: '', messageTimer: 0,
    stats: { stolen: 0, kills: 0, missionsDone: 0, earned: 0 },
    shopOpen: null, nearShop: null, nearCar: null, nearMissionNpc: false,
    seedNote: 0,
  };

  function spawnParkedCar(x, y, angle) {
    return { id: `car${state.cars.length}`, x, y, angle, speed: 0, color: pick(random, CAR_COLORS), kind: 'parked', hp: 100, driver: null, owned: true, wrecked: false, honkTimer: 0 };
  }

  function spawnTrafficCar() {
    const vertical = random() < 0.5;
    let x; let y;
    if (vertical) { x = pick(random, AVENUES); y = range(random, 100, WORLD.height - 100); }
    else { y = pick(random, STREETS); x = range(random, 100, WORLD.width - 100); }
    const car = {
      id: `car${state.cars.length}`, x, y, angle: vertical ? (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (random() < 0.5 ? 0 : Math.PI),
      speed: range(random, 120, 190), color: pick(random, CAR_COLORS), kind: 'traffic',
      hp: 100, driver: null, owned: true, wrecked: false, honkTimer: 0,
      target: null, lane: 16,
    };
    car.target = nextIntersection(car);
    return car;
  }

  function nearestAvenue(x) { return AVENUES.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a)); }
  function nearestStreet(y) { return STREETS.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a)); }

  function nextIntersection(car) {
    const ax = nearestAvenue(car.x);
    const ay = nearestStreet(car.y);
    const options = [];
    // Continue along current axis, or turn at the nearest intersection.
    const onAvenue = Math.abs(car.x - ax) < Math.abs(car.y - ay);
    if (onAvenue) {
      const dir = Math.sin(car.angle) >= 0 ? 1 : -1;
      const nextStreet = STREETS.find((s) => (dir > 0 ? s > car.y + 30 : s < car.y - 30));
      if (nextStreet !== undefined) options.push({ x: ax + 16, y: nextStreet });
      const other = STREETS.filter((s) => Math.abs(s - car.y) > 60);
      if (other.length) options.push({ x: ax + 16, y: pick(random, other) });
    } else {
      const dir = Math.cos(car.angle) >= 0 ? 1 : -1;
      const nextAve = AVENUES.find((a) => (dir > 0 ? a > car.x + 30 : a < car.x - 30));
      if (nextAve !== undefined) options.push({ x: nextAve, y: ay + 16 });
      const other = AVENUES.filter((a) => Math.abs(a - car.x) > 60);
      if (other.length) options.push({ x: pick(random, other), y: ay + 16 });
    }
    return options.length ? pick(random, options) : { x: 1800, y: 1260 };
  }

  function spawnPed() {
    const vertical = random() < 0.5;
    let x; let y;
    if (vertical) { x = pick(random, AVENUES) + (random() < 0.5 ? -46 : 46); y = range(random, 100, WORLD.height - 100); }
    else { y = pick(random, STREETS) + (random() < 0.5 ? -46 : 46); x = range(random, 100, WORLD.width - 100); }
    return {
      x, y, angle: range(random, 0, Math.PI * 2), speed: range(random, 45, 75),
      shirt: pick(random, PED_SHIRTS), flee: 0, fleeX: 0, fleeY: 0, dead: false, deadTimer: 0,
      walkPhase: random() * Math.PI * 2, target: null,
    };
  }

  function reset() {
    // Mission step state lives on the shared MISSIONS table: clear it for a fresh run.
    for (const m of MISSIONS) for (const s of m.steps) {
      if (s.points) for (const p of s.points) p.done = false;
      if (s.type === 'eliminate') s.spawned = false;
    }
    player.x = 400; player.y = 470; player.angle = -Math.PI / 2;
    player.health = PLAYER.health; player.money = 200; player.weapon = 'fists';
    player.ammo = 0; player.reserveAmmo = 0; player.hasBat = false; player.hasPistol = false;
    player.outfit = 'default'; player.inCar = null; player.punchTimer = 0; player.shootTimer = 0;
    player.reloadTimer = 0; player.hurtTimer = 0; player.arrestTimer = 0; player.ramImmune = 0; player.dead = false;
    state.cars.length = 0; state.peds.length = 0; state.police.length = 0; state.enemies.length = 0;
    state.bullets.length = 0; state.particles.length = 0; state.texts.length = 0; state.roadblocks.length = 0;
    state.wanted = 0; state.wantedTimer = 0; state.hideTimer = 0; state.heli = null;
    state.missionIndex = 0; state.missionStep = 0; state.missionTimer = 0; state.missionDone = false;
    state.missionActive = true; state.elapsed = 0; state.clockMinutes = 9 * 60;
    state.message = ''; state.messageTimer = 0; state.shopOpen = null; state.nearShop = null;
    state.stats = { stolen: 0, kills: 0, missionsDone: 0, earned: 0 };
    camera.x = player.x; camera.y = player.y;
    // Parked cars: one unlocked runabout by the spawn, the rest owned.
    state.cars.push(spawnParkedCar(636, 420, Math.PI / 2));
    state.cars[0].owned = false;
    state.cars.push(spawnParkedCar(964, 1300, 0));
    state.cars.push(spawnParkedCar(2164, 940, -Math.PI / 2));
    state.cars.push(spawnParkedCar(1436, 2020, Math.PI));
    state.cars.push(spawnParkedCar(3036, 580, Math.PI / 2));
    state.cars.push(spawnParkedCar(1836, 1660, 0));
    state.cars.push(spawnParkedCar(2564, 2220, -Math.PI / 2));
    state.cars.push(spawnParkedCar(1036, 220, Math.PI));
    for (let i = 0; i < TRAFFIC_COUNT; i += 1) state.cars.push(spawnTrafficCar());
    for (let i = 0; i < PED_COUNT; i += 1) state.peds.push(spawnPed());
  }

  function say(text, seconds = 4) { state.message = text; state.messageTimer = seconds; }
  function addText(x, y, text, color = '#f2c94c') { state.texts.push({ x, y, text, life: 1.6, color }); }
  function burst(x, y, color, n = 14, speed = 160) {
    for (let i = 0; i < n; i += 1) {
      const a = random() * Math.PI * 2;
      const s = range(random, speed * 0.3, speed);
      state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: range(random, 0.3, 0.8), color, size: range(random, 3, 7) });
    }
  }

  function collideBuildingsCircle(e, r) {
    for (const b of buildings) {
      const cx = clamp(e.x, b.x, b.x + b.w);
      const cy = clamp(e.y, b.y, b.y + b.h);
      const dx = e.x - cx; const dy = e.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        e.x = cx + (dx / d) * r;
        e.y = cy + (dy / d) * r;
        return true;
      }
      if (d2 <= 0.0001) { e.y = b.y - r; return true; }
    }
    return false;
  }

  function currentMission() { return state.missionActive ? MISSIONS[state.missionIndex] : null; }
  function currentStep() { const m = currentMission(); return m ? m.steps[state.missionStep] : null; }

  function addWanted(n) {
    state.wanted = clamp(state.wanted + n, 0, 5);
    state.hideTimer = 0;
  }

  function hurtPlayer(amount, fromPolice) {
    if (player.dead || player.hurtTimer > 0) return;
    player.health -= amount;
    player.hurtTimer = 0.35;
    burst(player.x, player.y, '#e5534b', 8, 120);
    if (player.health <= 0) {
      player.health = 0;
      player.dead = true;
    }
  }

  // ---- missions ----
  function spawnEnemies(x, y, count) {
    state.enemies.length = 0;
    for (let i = 0; i < count; i += 1) {
      state.enemies.push({
        x: x + range(random, -90, 90), y: y + range(random, -90, 90),
        hp: 60, angle: 0, attackTimer: 0, hurtTimer: 0, dead: false, speed: 130,
        shirt: '#8a2f2f', label: 'Thug',
      });
    }
  }

  function advanceStep() {
    const m = currentMission();
    state.missionStep += 1;
    if (state.missionStep >= m.steps.length) {
      player.money += m.reward;
      state.stats.missionsDone += 1;
      state.stats.earned += m.reward;
      addText(player.x, player.y - 40, `+$${m.reward}  ${m.name} complete!`, '#7ec850');
      say(`Mission complete: ${m.name} — $${m.reward} earned.`, 5);
      state.missionIndex += 1;
      state.missionStep = 0;
      state.missionTimer = 0;
      if (state.missionIndex >= MISSIONS.length) {
        state.missionActive = false;
        state.missionDone = true;
        say('The Solmaris Job is done. The city is yours, boss.', 8);
      } else {
        const next = MISSIONS[state.missionIndex];
        say(`New mission: ${next.name} — ${next.intro}`, 6);
      }
      return EVENT_MISSION | EVENT_CASH;
    }
    const step = currentStep();
    if (step.type === 'eliminate') spawnEnemies(step.x, step.y, step.count);
    if (step.type === 'timed') state.missionTimer = step.time;
    return EVENT_MISSION;
  }

  function missionObjective() {
    const m = currentMission();
    if (!m) return 'All missions complete — free roam Solmaris!';
    const step = currentStep();
    if (step.type === 'timed') {
      const done = step.points.filter((p) => p.done).length;
      return `${m.name}: checkpoint ${done}/${step.points.length} — ${Math.ceil(state.missionTimer)}s left`;
    }
    if (step.type === 'eliminate') {
      const left = state.enemies.filter((e) => !e.dead).length;
      return `${m.name}: ${left} left to deal with`;
    }
    return `${m.name}: ${step.label}`;
  }

  function missionTarget() {
    const m = currentMission();
    if (!m) return null;
    const step = currentStep();
    if (step.type === 'timed') {
      const next = step.points.find((p) => !p.done);
      return next ? { x: next[0], y: next[1] } : null;
    }
    return { x: step.x, y: step.y };
  }

  // ---- combat ----
  function fireBullet() {
    const w = WEAPONS[player.weapon];
    if (!w || player.weapon !== 'pistol') return 0;
    if (player.reloadTimer > 0 || player.shootTimer > 0) return 0;
    if (player.ammo <= 0) { say('Out of ammo — press R to reload, or buy more at Harbor Arms.', 3); return 0; }
    player.ammo -= 1;
    player.shootTimer = w.rate;
    const a = player.angle;
    state.bullets.push({
      x: player.x + Math.cos(a) * 22, y: player.y + Math.sin(a) * 22,
      vx: Math.cos(a) * 900, vy: Math.sin(a) * 900, life: 0.7, damage: w.damage,
    });
    return EVENT_SHOT;
  }

  function meleeAttack() {
    if (player.punchTimer > 0) return 0;
    const w = WEAPONS[player.weapon];
    player.punchTimer = w.rate;
    const rangeR = w.range;
    let events = 0;
    const hit = (e) => {
      const d = dist(player.x, player.y, e.x, e.y);
      if (d > rangeR + 12) return;
      const ang = Math.atan2(e.y - player.y, e.x - player.x);
      let diff = Math.abs(ang - player.angle);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff > 1.1) return;
      e.hp -= w.damage;
      e.hurtTimer = 0.25;
      burst(e.x, e.y, '#f2c94c', 6, 100);
      if (e.hp <= 0 && !e.dead) { e.dead = true; events |= EVENT_KILL; state.stats.kills += 1; }
    };
    for (const e of state.enemies) if (!e.dead) hit(e);
    for (const p of state.peds) {
      if (p.dead) continue;
      const before = p.dead;
      hit(p);
      if (!before && p.dead) { addWanted(1); say('You killed a pedestrian! The cops are coming.', 3); }
    }
    return events;
  }

  // ---- driving / stealing ----
  function nearestCar(maxDist) {
    let best = null; let bestD = maxDist;
    for (const c of state.cars) {
      if (c.wrecked || (player.inCar && player.inCar === c)) continue;
      const d = dist(player.x, player.y, c.x, c.y);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  function stealOrEnter() {
    if (player.inCar) {
      const car = player.inCar;
      player.inCar = null;
      player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
      player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
      player.angle = car.angle;
      car.speed = 0;
      return 0;
    }
    const car = nearestCar(78);
    if (!car) return 0;
    player.inCar = car;
    player.x = car.x; player.y = car.y; player.angle = car.angle;
    if (car.kind === 'traffic') {
      state.cars = state.cars.filter((c) => c !== car);
      addWanted(1);
      state.stats.stolen += 1;
      say('Grand theft auto! That car had an owner.', 3);
      return EVENT_STEAL;
    }
    if (car.owned) {
      const witness = state.peds.some((p) => !p.dead && dist(p.x, p.y, car.x, car.y) < 450)
        || state.police.some((p) => dist(p.x, p.y, car.x, car.y) < 500);
      if (witness) {
        addWanted(1);
        say('Someone saw you steal that car!', 3);
      } else say('Nice — nobody saw a thing.', 2);
      state.stats.stolen += 1;
      return EVENT_STEAL;
    }
    state.stats.stolen += 1;
    say('Keys were in it. Lucky day.', 2);
    return EVENT_STEAL;
  }

  // ---- shops ----
  function nearestShop() {
    for (const s of SHOPS) if (dist(player.x, player.y, s.x, s.y) < 130) return s;
    return null;
  }

  function buyItem(item) {
    if (player.money < item.price) { say('Not enough cash for that.', 2); return false; }
    const apply = item.apply;
    if (apply === 'buyBat' && player.hasBat) { say('You already own a bat.', 2); return false; }
    if (apply === 'buyPistol' && player.hasPistol) { say('You already own the pistol — buy ammo instead.', 2); return false; }
    if (apply === 'buyAmmo' && !player.hasPistol) { say('You need the pistol first.', 2); return false; }
    player.money -= item.price;
    if (apply === 'food25') player.health = Math.min(PLAYER.health, player.health + 25);
    if (apply === 'foodFull') player.health = PLAYER.health;
    if (apply === 'food10') player.health = Math.min(PLAYER.health, player.health + 10);
    if (apply === 'outfitTeal' || apply === 'outfitOrange' || apply === 'outfitBlack') player.outfit = apply;
    if (apply === 'buyBat') { player.hasBat = true; }
    if (apply === 'buyPistol') { player.hasPistol = true; player.ammo = WEAPONS.pistol.mag; player.reserveAmmo += 12; }
    if (apply === 'buyAmmo') player.reserveAmmo += WEAPONS.pistol.ammoQty;
    say(`Bought ${item.name} for $${item.price}.`, 3);
    return true;
  }

  // ---- police ----
  function spawnPolice() {
    const want = Math.min(state.wanted, 5);
    while (state.police.length < want) {
      // Spawn on the road graph (an avenue or a street near the player), never inside a block,
      // so the chase starts moving instead of grinding against a building.
      const vertical = random() < 0.5;
      const side = random() < 0.5 ? -1 : 1;
      const off = range(random, 420, 620);
      let x; let y;
      if (vertical) { x = pick(random, AVENUES) + 16; y = clamp(player.y + side * off, 60, WORLD.height - 60); }
      else { y = pick(random, STREETS) + 16; x = clamp(player.x + side * off, 60, WORLD.width - 60); }
      state.police.push({
        x, y, angle: Math.atan2(player.y - y, player.x - x), speed: 0, hp: 80,
        ramTimer: 0, color: '#2f6fd6', wrecked: false, block: false,
        tx: player.x, ty: player.y, retarget: 0,
      });
    }
  }

  // Grid pursuit: far away the police drive the road graph toward the player (along the axis
  // with the bigger gap, on the nearest road line); close in they beeline for the ram.
  function policeTarget(pc) {
    const d = dist(pc.x, pc.y, player.x, player.y);
    if (d < 220) return { x: player.x, y: player.y };
    if (Math.abs(player.x - pc.x) > Math.abs(player.y - pc.y)) return { x: player.x, y: nearestStreet(pc.y) };
    return { x: nearestAvenue(pc.x), y: player.y };
  }

  function updateRoadblocks(dt) {
    if (state.wanted >= 3 && state.roadblocks.length === 0) {
      // Block the road the player is on, 520px ahead — two cars with a gap in the middle
      // so a driver can thread through (or a player can ram around the side).
      const ahead = player.inCar ? player.inCar.angle : player.angle;
      const ax = nearestAvenue(player.x);
      const sy = nearestStreet(player.y);
      let spots;
      if (Math.abs(player.x - ax) < Math.abs(player.y - sy)) {
        const dir = Math.sin(ahead) >= 0 ? 1 : -1;
        const by = clamp(player.y + dir * 520, 80, WORLD.height - 80);
        spots = [{ x: ax - 46, y: by, angle: 0 }, { x: ax + 46, y: by, angle: 0 }];
      } else {
        const dir = Math.cos(ahead) >= 0 ? 1 : -1;
        const bx = clamp(player.x + dir * 520, 80, WORLD.width - 80);
        spots = [{ x: bx, y: sy - 46, angle: Math.PI / 2 }, { x: bx, y: sy + 46, angle: Math.PI / 2 }];
      }
      for (const s of spots) {
        state.roadblocks.push({
          x: s.x, y: s.y, angle: s.angle, speed: 0, hp: 80, ramTimer: 0, color: '#2f6fd6',
          wrecked: false, block: true, bumpTimer: 0,
        });
      }
      say('Roadblock ahead! The harbor police mean it now.', 4);
    } else if (state.wanted < 3) state.roadblocks.length = 0;
  }

  // ---- per-frame update ----
  function step(dt, input, aimAngle) {
    let events = 0;
    state.elapsed += dt;
    state.clockMinutes = (9 * 60 + Math.floor(state.elapsed)) % (24 * 60);
    if (state.messageTimer > 0) state.messageTimer -= dt;
    if (player.hurtTimer > 0) player.hurtTimer -= dt;
    if (player.ramImmune > 0) player.ramImmune -= dt;
    if (player.punchTimer > 0) player.punchTimer -= dt;
    if (player.shootTimer > 0) player.shootTimer -= dt;
    if (player.reloadTimer > 0) {
      player.reloadTimer -= dt;
      if (player.reloadTimer <= 0 && player.hasPistol) {
        const need = WEAPONS.pistol.mag - player.ammo;
        const take = Math.min(need, player.reserveAmmo);
        player.ammo += take; player.reserveAmmo -= take;
      }
    }

    const stepDef = currentStep();
    if (stepDef && stepDef.type === 'timed') {
      state.missionTimer -= dt;
      if (state.missionTimer <= 0) {
        say('Too slow! The getaway window closed — try again.', 4);
        state.missionStep = 0;
        state.missionTimer = stepDef.time;
        for (const p of stepDef.points) p.done = false;
      }
    }
    if (stepDef && stepDef.type === 'eliminate' && state.enemies.length === 0 && !stepDef.spawned) {
      stepDef.spawned = true;
      spawnEnemies(stepDef.x, stepDef.y, stepDef.count);
    }

    // -- player --
    if (!player.dead) {
      if (player.inCar) {
        const car = player.inCar;
        const fwd = input.moveY !== 0 ? -input.moveY : 0; // W = forward
        if (fwd > 0) car.speed += CAR.accel * dt;
        else if (fwd < 0) car.speed -= (car.speed > 0 ? CAR.brake : CAR.reverseAccel) * dt;
        else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 160 * dt);
        car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
        const steer = input.moveX * CAR.steer * clamp(Math.abs(car.speed) / 200, 0, 1);
        car.angle += steer * (car.speed >= 0 ? 1 : -1) * dt * (Math.abs(car.speed) > 10 ? 1 : 0);
        car.x += Math.cos(car.angle) * car.speed * dt;
        car.y += Math.sin(car.angle) * car.speed * dt;
        car.x = clamp(car.x, 30, WORLD.width - 30);
        car.y = clamp(car.y, 30, WORLD.height - 30);
        if (collideBuildingsCircle(car, 22)) car.speed *= 0.4;
        player.x = car.x; player.y = car.y; player.angle = car.angle;
        if (Math.abs(car.speed) > 300 && random() < dt * 2) {
          state.particles.push({ x: car.x - Math.cos(car.angle) * 26, y: car.y - Math.sin(car.angle) * 26, vx: 0, vy: 0, life: 0.4, color: '#9aa0a3', size: 5 });
        }
      } else {
        const mx = input.moveX; const my = input.moveY;
        const len = Math.hypot(mx, my) || 1;
        const speed = input.running ? PLAYER.runSpeed : PLAYER.walkSpeed;
        player.x += (mx / len) * speed * dt * (mx || my ? 1 : 0);
        player.y += (my / len) * speed * dt * (mx || my ? 1 : 0);
        player.x = clamp(player.x, 20, WORLD.width - 20);
        player.y = clamp(player.y, 20, WORLD.height - 20);
        collideBuildingsCircle(player, PLAYER.radius);
        if (aimAngle !== null && aimAngle !== undefined) player.angle = aimAngle;
        else if (mx || my) player.angle = Math.atan2(my, mx);
      }
    }

    // -- traffic --
    for (const car of state.cars) {
      if (car.kind !== 'traffic' || car.wrecked) continue;
      if (!car.target) car.target = nextIntersection(car);
      const dx = car.target.x - car.x; const dy = car.target.y - car.y;
      const d = Math.hypot(dx, dy);
      if (d < 24) { car.target = nextIntersection(car); continue; }
      const wantAngle = Math.atan2(dy, dx);
      car.angle = angleLerp(car.angle, wantAngle, Math.min(1, dt * 2.2));
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      if (collideBuildingsCircle(car, 20)) car.speed *= 0.9;
      // bump the player car lightly
      if (player.inCar && dist(car.x, car.y, player.x, player.y) < 52) {
        player.inCar.speed *= 0.92;
        car.speed *= 0.9;
        if (random() < dt * 3) events |= EVENT_CRASH;
      }
    }

    // -- pedestrians --
    for (const p of state.peds) {
      if (p.dead) { p.deadTimer += dt; continue; }
      const dangerX = player.inCar ? player.x : null;
      let fleeing = false;
      if (p.flee > 0) { p.flee -= dt; fleeing = true; }
      else if (player.inCar && dist(p.x, p.y, player.x, player.y) < 90 && Math.abs(player.inCar.speed) > 200) {
        p.flee = 2; p.fleeX = p.x - player.x; p.fleeY = p.y - player.y; fleeing = true;
      }
      if (fleeing) {
        const fl = Math.hypot(p.fleeX, p.fleeY) || 1;
        p.x += (p.fleeX / fl) * 150 * dt;
        p.y += (p.fleeY / fl) * 150 * dt;
        p.angle = Math.atan2(p.fleeY, p.fleeX);
      } else {
        if (!p.target) {
          const vertical = random() < 0.5;
          if (vertical) p.target = { x: pick(random, AVENUES) + (random() < 0.5 ? -46 : 46), y: range(random, 100, WORLD.height - 100) };
          else p.target = { x: range(random, 100, WORLD.width - 100), y: pick(random, STREETS) + (random() < 0.5 ? -46 : 46) };
        }
        const dx = p.target.x - p.x; const dy = p.target.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < 20) { p.target = null; continue; }
        p.angle = Math.atan2(dy, dx);
        p.x += Math.cos(p.angle) * p.speed * dt;
        p.y += Math.sin(p.angle) * p.speed * dt;
      }
      p.walkPhase += dt * 6;
      p.x = clamp(p.x, 20, WORLD.width - 20);
      p.y = clamp(p.y, 20, WORLD.height - 20);
      // Pedestrians stay out of buildings even when they flee in a straight line.
      collideBuildingsCircle(p, 12);
      // run over by a speeding player car
      if (player.inCar && Math.abs(player.inCar.speed) > 120 && dist(p.x, p.y, player.x, player.y) < 30) {
        p.dead = true; p.deadTimer = 0;
        burst(p.x, p.y, '#e5534b', 10, 140);
        addWanted(1);
        say('You hit a pedestrian!', 3);
        events |= EVENT_CRASH;
      }
    }

    // -- enemies --
    for (const e of state.enemies) {
      if (e.dead) continue;
      if (e.hurtTimer > 0) e.hurtTimer -= dt;
      if (e.attackTimer > 0) e.attackTimer -= dt;
      const d = dist(e.x, e.y, player.x, player.y);
      if (d > 520) continue;
      e.angle = Math.atan2(player.y - e.y, player.x - e.x);
      if (d > 34) {
        e.x += Math.cos(e.angle) * e.speed * dt;
        e.y += Math.sin(e.angle) * e.speed * dt;
        collideBuildingsCircle(e, 13);
      } else if (e.attackTimer <= 0 && !player.dead) {
        e.attackTimer = 1.0;
        hurtPlayer(8, false);
        events |= EVENT_HIT;
      }
    }

    // -- bullets --
    for (const b of state.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0) continue;
      let hitSomething = false;
      for (const e of state.enemies) {
        if (!e.dead && dist(b.x, b.y, e.x, e.y) < 16) {
          e.hp -= b.damage; e.hurtTimer = 0.25;
          burst(b.x, b.y, '#f2c94c', 5, 90);
          if (e.hp <= 0) { e.dead = true; events |= EVENT_KILL; state.stats.kills += 1; }
          hitSomething = true; break;
        }
      }
      if (!hitSomething) for (const p of state.peds) {
        if (!p.dead && dist(b.x, b.y, p.x, p.y) < 14) {
          p.dead = true; p.deadTimer = 0;
          addWanted(1);
          say('You shot a pedestrian! The cops are coming.', 3);
          hitSomething = true; break;
        }
      }
      if (!hitSomething) for (const pc of [...state.police, ...state.roadblocks]) {
        if (!pc.wrecked && dist(b.x, b.y, pc.x, pc.y) < 26) {
          pc.hp -= b.damage;
          burst(b.x, b.y, '#f2c94c', 5, 90);
          if (pc.hp <= 0) {
            pc.wrecked = true;
            burst(pc.x, pc.y, '#e2703a', 26, 260);
            addWanted(1);
            say('You wrecked a police car!', 3);
          }
          hitSomething = true; break;
        }
      }
      if (hitSomething) b.life = 0;
    }
    state.bullets = state.bullets.filter((b) => b.life > 0);

    // -- police --
    if (state.wanted > 0) spawnPolice();
    else state.police = state.police.filter((p) => dist(p.x, p.y, player.x, player.y) < 900);
    updateRoadblocks(dt);
    for (const pc of state.police) {
      if (pc.wrecked) continue;
      if (pc.ramTimer > 0) pc.ramTimer -= dt;
      const d = dist(pc.x, pc.y, player.x, player.y);
      pc.retarget -= dt;
      if (pc.retarget <= 0 || dist(pc.x, pc.y, pc.tx, pc.ty) < 40) {
        const t = policeTarget(pc);
        pc.tx = t.x; pc.ty = t.y;
        pc.retarget = 0.4;
      }
      const wantAngle = Math.atan2(pc.ty - pc.y, pc.tx - pc.x);
      const turn = Math.abs(((wantAngle - pc.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      pc.angle = angleLerp(pc.angle, wantAngle, Math.min(1, dt * 2.6));
      // Slow for corners so the chase turns on the road instead of clipping buildings.
      const targetSpeed = (470 + state.wanted * 22) * (turn > 0.5 ? 0.55 : 1);
      pc.speed += (targetSpeed - pc.speed) * Math.min(1, dt * 1.2);
      pc.x += Math.cos(pc.angle) * pc.speed * dt;
      pc.y += Math.sin(pc.angle) * pc.speed * dt;
      if (collideBuildingsCircle(pc, 20)) pc.speed *= 0.85;
      if (d < 56 && pc.ramTimer <= 0) {
        pc.ramTimer = 0.8;
        if (player.inCar) {
          player.inCar.hp -= 6;
          // A ram shoves the car but cannot pin it: a short grace window stops five
          // cops staggered together from multiplying the speed to zero.
          if (player.ramImmune <= 0) {
            player.inCar.speed *= 0.85;
            player.ramImmune = 1.2;
          }
          events |= EVENT_CRASH;
          burst(player.x, player.y, '#e8c84a', 8, 120);
          if (player.inCar.hp <= 0) {
            player.inCar.wrecked = true;
            say('Your car is wrecked! Get out and run.', 4);
            stealOrEnter();
          }
        } else {
          hurtPlayer(10, true);
          events |= EVENT_HIT;
        }
      }
      // arrest: cop car sitting on the player on foot
      if (!player.inCar && !player.dead && d < 30) {
        player.arrestTimer += dt;
        if (player.arrestTimer > 1.4) { events |= EVENT_BUSTED; player.arrestTimer = 0; }
      } else player.arrestTimer = Math.max(0, player.arrestTimer - dt * 2);
    }
    state.police = state.police.filter((p) => !p.wrecked || dist(p.x, p.y, player.x, player.y) < 1200);

    // Roadblock cars are solid: the player's car bounces off them instead of driving through.
    if (player.inCar) {
      for (const rb of state.roadblocks) {
        if (rb.wrecked) continue;
        if (rb.bumpTimer > 0) rb.bumpTimer -= dt;
        const dd = dist(rb.x, rb.y, player.x, player.y);
        if (dd < 48 && dd > 0.01) {
          const nx = (player.x - rb.x) / dd;
          const ny = (player.y - rb.y) / dd;
          player.inCar.x = rb.x + nx * 48;
          player.inCar.y = rb.y + ny * 48;
          player.x = player.inCar.x; player.y = player.inCar.y;
          if (rb.bumpTimer <= 0) {
            player.inCar.speed *= 0.7;
            player.inCar.hp -= 4;
            rb.bumpTimer = 0.4;
            events |= EVENT_CRASH;
            burst(player.x, player.y, '#e8c84a', 8, 120);
          }
        }
      }
    }

    // -- helicopter --
    if (state.wanted >= 4) {
      if (!state.heli) state.heli = { angle: 0, x: player.x, y: player.y };
      state.heli.angle += dt * 0.9;
      state.heli.x = player.x + Math.cos(state.heli.angle) * 210;
      state.heli.y = player.y + Math.sin(state.heli.angle) * 210 - 60;
    } else state.heli = null;

    // -- wanted decay: hidden when no police close --
    if (state.wanted > 0) {
      const nearest = state.police.reduce((m, p) => Math.min(m, dist(p.x, p.y, player.x, player.y)), Infinity);
      if (nearest > 650) {
        state.hideTimer += dt;
        if (state.hideTimer > 6) { state.wanted -= 1; state.hideTimer = 0; say('You lost them — heat is dropping.', 3); }
      } else state.hideTimer = 0;
    }

    // -- mission progress --
    const m = currentMission();
    if (m && !player.dead) {
      const s = currentStep();
      if (s.type === 'talk' && dist(player.x, player.y, s.x, s.y) < 70) state.nearMissionNpc = true;
      else state.nearMissionNpc = false;
      if (s.type === 'goto' && dist(player.x, player.y, s.x, s.y) < 70) events |= advanceStep();
      if (s.type === 'driveTo' && player.inCar && dist(player.x, player.y, s.x, s.y) < 80) events |= advanceStep();
      if (s.type === 'timed') {
        const next = s.points.find((p) => !p.done);
        if (next && dist(player.x, player.y, next[0], next[1]) < 80) {
          next.done = true;
          addText(player.x, player.y - 40, 'Checkpoint!', '#7ec850');
          if (s.points.every((p) => p.done)) events |= advanceStep();
        }
      }
      if (s.type === 'eliminate' && state.enemies.length > 0 && state.enemies.every((e) => e.dead)) {
        events |= advanceStep();
      }
    }

    // -- particles / texts --
    for (const p of state.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; p.life -= dt; }
    state.particles = state.particles.filter((p) => p.life > 0);
    for (const t of state.texts) { t.y -= 24 * dt; t.life -= dt; }
    state.texts = state.texts.filter((t) => t.life > 0);

    // -- camera --
    camera.x = clamp(player.x, VIEW.width / 2, WORLD.width - VIEW.width / 2);
    camera.y = clamp(player.y, VIEW.height / 2, WORLD.height - VIEW.height / 2);

    // -- death --
    if (player.dead) {
      events |= state.wanted > 0 ? EVENT_BUSTED : EVENT_WASTED;
    }
    return events;
  }

  function interact() {
    let events = 0;
    if (state.shopOpen) return 0;
    const shop = nearestShop();
    if (shop && !player.inCar) { state.shopOpen = shop; return 0; }
    const s = currentStep();
    if (s && s.type === 'talk' && dist(player.x, player.y, s.x, s.y) < 70) {
      say(`${s.npc}: "${currentMission().intro}"`, 5);
      events |= advanceStep();
      return events;
    }
    if (s && s.type === 'pickup' && dist(player.x, player.y, s.x, s.y) < 70) {
      if (s.setWanted) addWanted(s.setWanted);
      say(`Picked up: ${s.item}.`, 3);
      events |= EVENT_PICKUP | advanceStep();
      return events;
    }
    return stealOrEnter();
  }

  function respawn(busted) {
    if (busted) {
      player.money = Math.max(0, player.money - 100);
      say('BUSTED! The harbor police fined you $100.', 5);
    } else {
      player.money = Math.max(0, player.money - 50);
      say('WASTED! You wake up at the Marina clinic, $50 lighter.', 5);
    }
    state.wanted = 0;
    state.police.length = 0;
    state.roadblocks.length = 0;
    state.heli = null;
    state.enemies.length = 0;
    const s = currentStep();
    if (s && s.type === 'eliminate') s.spawned = false;
    if (s && s.type === 'timed') { state.missionTimer = s.time; for (const p of s.points) p.done = false; }
    player.health = PLAYER.health;
    player.dead = false;
    player.inCar = null;
    player.x = 400; player.y = 470; player.angle = -Math.PI / 2;
    camera.x = player.x; camera.y = player.y;
  }

  function serialize() {
    return {
      x: player.x, y: player.y, money: player.money, health: player.health,
      weapon: player.weapon, ammo: player.ammo, reserveAmmo: player.reserveAmmo,
      hasBat: player.hasBat, hasPistol: player.hasPistol, outfit: player.outfit,
      missionIndex: state.missionIndex, missionStep: state.missionStep,
      wanted: state.wanted, elapsed: state.elapsed, stats: state.stats,
    };
  }

  function loadSave(data) {
    player.x = data.x; player.y = data.y; player.money = data.money; player.health = data.health;
    player.weapon = data.weapon; player.ammo = data.ammo; player.reserveAmmo = data.reserveAmmo;
    player.hasBat = data.hasBat; player.hasPistol = data.hasPistol; player.outfit = data.outfit;
    state.missionIndex = Math.min(data.missionIndex, MISSIONS.length - 1);
    state.missionStep = data.missionStep;
    state.wanted = 0; state.elapsed = data.elapsed || 0;
    state.stats = data.stats || state.stats;
    player.inCar = null; player.dead = false;
    camera.x = player.x; camera.y = player.y;
  }

  reset();

  return {
    state, reset, step, interact, stealOrEnter, fireBullet, meleeAttack, buyItem,
    nearestShop, nearestCar, missionObjective, missionTarget, currentMission, currentStep,
    addWanted, respawn, serialize, loadSave, say, addText, burst, hurtPlayer,
    // Test hooks for the headless play-test (not part of normal play).
    debug: {
      teleport(x, y) { player.x = x; player.y = y; camera.x = x; camera.y = y; if (player.inCar) { player.inCar.x = x; player.inCar.y = y; } },
      giveMoney(n) { player.money += n; },
      setWanted(n) { state.wanted = n; },
      damage(n) { player.health -= n; if (player.health <= 0) { player.health = 0; player.dead = true; } },
      setMission(i, s = 0) { state.missionIndex = i; state.missionStep = s; state.missionActive = true; state.missionDone = false; },
      outfit() { return OUTFITS[player.outfit] || OUTFITS.default; },
    },
  };
}
