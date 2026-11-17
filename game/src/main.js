// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps,
// and the renderer paints what is there. Screens: title, play, paused, wasted, busted.
// ?seed=N fixes the city. ?shot=1-title|2-driving|3-chase|4-mission stages that scene instead
// of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { STEP, VIEW, SAVE_KEY } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_CASH, EVENT_CRASH, EVENT_KILL, EVENT_MISSION, EVENT_PICKUP, EVENT_SHOT, EVENT_STEAL, EVENT_WASTED, EVENT_HIT } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_INTERACT, ACTION_RELOAD, ACTION_MELEE, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_BUSTED } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.serialize()));
  } catch { /* Storage can be off: the save then lasts this visit only. */ }
}

function runShot(name) {
  const scene = stageShot(name, world);
  world.state._objective = world.missionObjective();
  world.state._missionTarget = world.missionTarget();
  world.state.nearCar = null;
  world.state.nearShop = null;
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, 0, world.state.elapsed);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  window.__sol.input = input;
  window.__sol.getScreen = () => screen;
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let hasSave = readSave() !== null;
  let muted = false;

  function announce(message) { status.textContent = message; }

  function startGame(fresh) {
    if (fresh) world.reset();
    else {
      const save = readSave();
      if (save) { world.reset(); world.loadSave(save); }
    }
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Playing Solmaris.');
  }

  function handleActions() {
    const actions = input.takeActions();
    const digits = input.takeDigits();
    const state = world.state;
    const p = state.player;

    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startGame(true);
      return;
    }
    if (screen === SCREEN_OVER || screen === SCREEN_BUSTED) {
      if (actions & ACTION_CONFIRM) { screen = SCREEN_PLAY; announce('Playing Solmaris.'); }
      return;
    }
    if (state.shopOpen) {
      if (actions & (ACTION_PAUSE | ACTION_INTERACT)) { state.shopOpen = null; audio.click(); }
      else for (const d of digits) {
        const item = state.shopOpen.items.find((i) => `Digit${i.key}` === d);
        if (item && world.buyItem(item)) audio.cash();
        else if (item) audio.denied();
      }
      return;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) { screen = SCREEN_PAUSED; writeSave(); announce('Paused. Progress saved.'); }
      else if (screen === SCREEN_PAUSED) { screen = SCREEN_PLAY; announce('Playing.'); }
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    if (actions & ACTION_INTERACT) {
      const events = world.interact();
      if (events & EVENT_STEAL) audio.engineStart();
      else if (events & EVENT_PICKUP) audio.pickup();
      else if (events & EVENT_MISSION) audio.cash();
      else audio.click();
    }
    if (actions & ACTION_RELOAD) {
      if (p.hasPistol && p.ammo < 12 && p.reserveAmmo > 0 && p.reloadTimer <= 0) {
        p.reloadTimer = 0.9;
        audio.click();
      }
    }
    if (actions & ACTION_MELEE) {
      if (world.meleeAttack() & EVENT_KILL) audio.punch();
      else audio.punch();
    }
    for (const d of digits) {
      if (d === 'Digit1') { p.weapon = 'fists'; audio.click(); }
      else if (d === 'Digit2' && p.hasBat) { p.weapon = 'bat'; audio.click(); }
      else if (d === 'Digit3' && p.hasPistol) { p.weapon = 'pistol'; audio.click(); }
      else if (d === 'Digit2' || d === 'Digit3') audio.denied();
    }
    const mouse = input.mouse();
    if (mouse.pressed && p.weapon === 'pistol' && !p.inCar) {
      if (world.fireBullet() & EVENT_SHOT) audio.shoot();
    } else if (mouse.pressed && !p.inCar) {
      world.meleeAttack();
      audio.punch();
    }
    input.clearMousePressed();
  }

  function aimAngle() {
    const p = world.state.player;
    const rect = canvas.getBoundingClientRect();
    const mouse = input.mouse();
    const scale = Math.min(rect.width / VIEW.width, rect.height / VIEW.height);
    const ox = (rect.width - VIEW.width * scale) / 2;
    const oy = (rect.height - VIEW.height * scale) / 2;
    const wx = world.state.camera.x - VIEW.width / 2 + (mouse.x - ox) / scale;
    const wy = world.state.camera.y - VIEW.height / 2 + (mouse.y - oy) / scale;
    return Math.atan2(wy - p.y, wx - p.x);
  }

  function step() {
    if (screen !== SCREEN_PLAY) return;
    const state = world.state;
    const mv = { moveX: input.moveX(), moveY: input.moveY(), running: input.running() };
    const aim = state.player.inCar ? null : aimAngle();
    const events = world.step(STEP, mv, aim);
    state._objective = world.missionObjective();
    state._missionTarget = world.missionTarget();
    state.nearShop = world.nearestShop();
    state.nearCar = state.player.inCar ? null : world.nearestCar(78);
    if (events & EVENT_MISSION) { audio.cash(); writeSave(); }
    if (events & EVENT_SHOT) audio.shoot();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_KILL) audio.punch();
    if (state.player.inCar) audio.setEngine(Math.abs(state.player.inCar.speed) / 560);
    else audio.stopEngine();
    if (events & EVENT_BUSTED) {
      world.respawn(true);
      audio.busted();
      writeSave();
      screen = SCREEN_BUSTED;
      announce('Busted. Fined $100.');
    } else if (events & EVENT_WASTED) {
      world.respawn(false);
      audio.wasted();
      writeSave();
      screen = SCREEN_OVER;
      announce('Wasted.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_TITLE) {
      // Title backdrop: the city idles behind the panel.
      while (accumulator >= STEP) {
        world.step(STEP, { moveX: 0, moveY: 0, running: false }, null);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    world.state._objective = world.missionObjective();
    world.state._missionTarget = world.missionTarget();
    renderer.draw(world.state, screen, 0, world.state.elapsed);
  }

  // Continue a save with C on the title screen; mute with M anywhere.
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyC' && screen === SCREEN_TITLE && hasSave) startGame(false);
    if (event.code === 'KeyM') { muted = audio.toggleMute(); announce(muted ? 'Muted.' : 'Sound on.'); }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      writeSave();
      announce('Paused.');
    }
  });

  announce(hasSave ? 'Solmaris. Press Space for a new game, or C to continue your save.' : 'Solmaris. Press Space or click to start.');
  requestAnimationFrame(frame);
}

// Headless play-test hook: state, debug helpers and a scripted-action runner.
window.__sol = {
  get state() { return world.state; },
  world,
  getScreen: () => 'title',
  teleport(x, y) { world.debug.teleport(x, y); },
  giveMoney(n) { world.debug.giveMoney(n); },
  setWanted(n) { world.debug.setWanted(n); },
  setMission(i, s) { world.debug.setMission(i, s); },
  damage(n) { world.debug.damage(n); },
  interact() { return world.interact(); },
  save() { writeSave(); return readSave(); },
};

if (shot) runShot(shot);
else runGame();
