// Drawing only: the world's state and the current screen in, pixels out. Top-down 2.5D:
// every object casts a drop shadow, buildings get a raised roof with a parapet, and the
// south side of buildings and roads is shaded darker for a cheap sun-from-the-north depth cue.
import { WORLD, VIEW, AVENUES, STREETS, ROAD_WIDTH, PALETTE, FONT, SHOPS, WEAPONS, OUTFITS } from './config.js';
import { districtAt } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_BUSTED = 'busted';

const SHADOW = 'rgba(0,0,0,0.28)';

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    view.scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    view.x = (canvas.width - VIEW.width * view.scale) / 2;
    view.y = (canvas.height - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align = 'left', baseline = 'alphabetic') {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = baseline;
    context.fillText(value, x, y);
  }

  function shadowEllipse(x, y, rx, ry) {
    context.fillStyle = SHADOW;
    context.beginPath();
    context.ellipse(x + 5, y + 7, rx, ry, 0, 0, Math.PI * 2);
    context.fill();
  }

  function drawGround(state) {
    const cam = state.camera;
    const x0 = Math.max(0, cam.x - VIEW.width / 2 - 40);
    const y0 = Math.max(0, cam.y - VIEW.height / 2 - 40);
    const x1 = Math.min(WORLD.width, cam.x + VIEW.width / 2 + 40);
    const y1 = Math.min(WORLD.height, cam.y + VIEW.height / 2 + 40);
    // base grass
    context.fillStyle = PALETTE.grass;
    context.fillRect(x0, y0, x1 - x0, y1 - y0);
    // district tint bands
    context.fillStyle = 'rgba(255,255,255,0.05)';
    context.fillRect(0, 0, 1000, 1260);
    // water + sand on the west edge
    context.fillStyle = PALETTE.waterDeep;
    context.fillRect(0, 0, 120, WORLD.height);
    context.fillStyle = PALETTE.water;
    context.fillRect(0, 0, 110, WORLD.height);
    context.fillStyle = PALETTE.sand;
    context.fillRect(110, 0, 60, WORLD.height);
    // parks and plazas
    for (const p of state.parks) {
      context.fillStyle = p.plaza ? PALETTE.plaza : PALETTE.grassDark;
      context.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
      if (p.plaza) {
        context.strokeStyle = 'rgba(0,0,0,0.15)';
        context.lineWidth = 3;
        context.strokeRect(p.x - p.w / 2 + 6, p.y - p.h / 2 + 6, p.w - 12, p.h - 12);
      }
    }
    // sidewalks (road shoulders)
    context.fillStyle = PALETTE.sidewalk;
    for (const a of AVENUES) context.fillRect(a - ROAD_WIDTH / 2 - 10, y0, ROAD_WIDTH + 20, y1 - y0);
    for (const s of STREETS) context.fillRect(x0, s - ROAD_WIDTH / 2 - 10, x1 - x0, ROAD_WIDTH + 20);
    // roads
    context.fillStyle = PALETTE.road;
    for (const a of AVENUES) context.fillRect(a - ROAD_WIDTH / 2, y0, ROAD_WIDTH, y1 - y0);
    for (const s of STREETS) context.fillRect(x0, s - ROAD_WIDTH / 2, x1 - x0, ROAD_WIDTH);
    // south-side shading on roads (sun from the north)
    context.fillStyle = PALETTE.roadShade;
    for (const s of STREETS) context.fillRect(x0, s + ROAD_WIDTH / 2 - 10, x1 - x0, 10);
    for (const a of AVENUES) context.fillRect(a + ROAD_WIDTH / 2 - 8, y0, 8, y1 - y0);
    // centre dashes
    context.fillStyle = PALETTE.roadLine;
    for (const a of AVENUES) {
      for (let y = Math.floor(y0 / 44) * 44; y < y1; y += 44) context.fillRect(a - 2, y, 4, 22);
    }
    for (const s of STREETS) {
      for (let x = Math.floor(x0 / 44) * 44; x < x1; x += 44) context.fillRect(x, s - 2, 22, 4);
    }
    // trees
    for (const t of state.trees) {
      if (t.x < x0 - 30 || t.x > x1 + 30 || t.y < y0 - 30 || t.y > y1 + 30) continue;
      shadowEllipse(t.x, t.y, t.r, t.r * 0.6);
      context.fillStyle = '#5a4028';
      context.fillRect(t.x - 3, t.y - 2, 6, 12);
      context.fillStyle = t.palm ? '#3f9e4d' : '#2f7a3a';
      context.beginPath();
      context.arc(t.x, t.y - 6, t.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.18)';
      context.beginPath();
      context.arc(t.x - t.r * 0.3, t.y - 6 - t.r * 0.3, t.r * 0.45, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawBuilding(b) {
    const lift = 4 + b.height * 2;
    // drop shadow
    context.fillStyle = SHADOW;
    context.fillRect(b.x + 7, b.y + 9, b.w, b.h);
    // wall
    context.fillStyle = b.color;
    context.fillRect(b.x, b.y, b.w, b.h);
    // south-side shading
    context.fillStyle = 'rgba(0,0,0,0.22)';
    context.fillRect(b.x, b.y + b.h - 12, b.w, 12);
    context.fillRect(b.x + b.w - 8, b.y, 8, b.h);
    // raised roof + parapet
    context.fillStyle = b.roof;
    context.fillRect(b.x + 6, b.y + 6 - lift, b.w - 12, b.h - 12);
    context.strokeStyle = 'rgba(255,255,255,0.35)';
    context.lineWidth = 2;
    context.strokeRect(b.x + 6, b.y + 6 - lift, b.w - 12, b.h - 12);
    context.fillStyle = 'rgba(255,255,255,0.25)';
    context.fillRect(b.x + 6, b.y + 6 - lift, b.w - 12, 5);
    // windows on the wall face
    context.fillStyle = 'rgba(20,30,44,0.55)';
    const cols = Math.max(1, Math.floor(b.w / 34));
    const rows = Math.max(1, Math.floor(b.h / 34));
    for (let c = 0; c < cols; c += 1) {
      for (let r = 0; r < rows; r += 1) {
        context.fillRect(b.x + 12 + c * 34, b.y + 12 + r * 34, 16, 14);
      }
    }
    if (b.shop) {
      const shop = SHOPS.find((s) => s.id === b.shop);
      if (shop) {
        text(shop.name, b.x + b.w / 2, b.y + b.h / 2 + 4, 17, '#ffffff', 'center', 'middle');
      }
    }
  }

  function drawCar(car, isPlayer) {
    shadowEllipse(car.x, car.y, 34, 18);
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    const halfL = 32; const halfW = 15;
    // body
    context.fillStyle = car.wrecked ? '#3a3a3a' : car.color;
    context.beginPath();
    context.roundRect(-halfL, -halfW, halfL * 2, halfW * 2, 8);
    context.fill();
    // south-side shading on the body
    context.fillStyle = 'rgba(0,0,0,0.18)';
    context.fillRect(-halfL, halfW - 6, halfL * 2, 6);
    // cabin + windshield
    context.fillStyle = car.wrecked ? '#222' : '#1d2b3a';
    context.beginPath();
    context.roundRect(-12, -11, 22, 22, 5);
    context.fill();
    context.fillStyle = 'rgba(180,220,255,0.7)';
    context.fillRect(6, -10, 5, 20);
    // headlights
    context.fillStyle = '#ffe9a8';
    context.fillRect(halfL - 3, -halfW + 3, 3, 5);
    context.fillRect(halfL - 3, halfW - 8, 3, 5);
    // police light bar
    if (car.color === '#2f6fd6' || car.id?.startsWith('police')) {
      context.fillStyle = '#ff3b30';
      context.fillRect(-4, -halfW + 1, 8, 5);
      context.fillStyle = '#2f6fd6';
      context.fillRect(-4, halfW - 6, 8, 5);
    }
    context.restore();
    if (car.wrecked) {
      context.fillStyle = 'rgba(120,120,120,0.5)';
      context.beginPath();
      context.arc(car.x - 10, car.y - 14, 10, 0, Math.PI * 2);
      context.fill();
    }
    if (isPlayer) {
      context.strokeStyle = '#f2c94c';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(car.x, car.y, 40, 0, Math.PI * 2);
      context.stroke();
    }
  }

  function drawPerson(x, y, angle, shirt, pants, opts = {}) {
    shadowEllipse(x, y, 12, 7);
    if (opts.dead) {
      context.save();
      context.translate(x, y);
      context.rotate(1.2);
      context.fillStyle = shirt;
      context.fillRect(-13, -6, 26, 12);
      context.fillStyle = pants;
      context.fillRect(8, -5, 12, 10);
      context.restore();
      return;
    }
    const bob = opts.bob || 0;
    context.fillStyle = pants;
    context.fillRect(x - 6, y + 2 + bob, 5, 10);
    context.fillRect(x + 1, y + 2 - bob, 5, 10);
    context.fillStyle = shirt;
    context.beginPath();
    context.arc(x, y - 2, 10, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8b98a';
    context.beginPath();
    context.arc(x, y - 12, 7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#2b2f36';
    context.beginPath();
    context.arc(x, y - 14, 7, Math.PI, Math.PI * 2);
    context.fill();
    if (opts.aim) {
      context.strokeStyle = '#222';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(x, y - 2);
      context.lineTo(x + Math.cos(angle) * 22, y - 2 + Math.sin(angle) * 22);
      context.stroke();
    }
  }

  function drawMissionMarker(x, y, pulse) {
    const r = 26 + Math.sin(pulse * 4) * 4;
    context.strokeStyle = '#f2c94c';
    context.lineWidth = 4;
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = 'rgba(242,201,76,0.18)';
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#f2c94c';
    context.beginPath();
    context.moveTo(x, y - 34);
    context.lineTo(x + 8, y - 20);
    context.lineTo(x - 8, y - 20);
    context.closePath();
    context.fill();
  }

  function drawMinimap(state, screen) {
    const R = 92;
    const cx = VIEW.width - R - 18;
    const cy = VIEW.height - R - 18;
    const scale = (R * 2) / WORLD.width;
    context.save();
    context.beginPath();
    context.arc(cx, cy, R, 0, Math.PI * 2);
    context.clip();
    context.fillStyle = 'rgba(20,28,38,0.88)';
    context.fillRect(cx - R, cy - R, R * 2, R * 2);
    context.fillStyle = '#1d6f8e';
    context.fillRect(cx - R, cy - R, 120 * scale * (WORLD.width / (R * 2)) * 0 + 6, R * 2);
    context.fillStyle = '#3a3f46';
    for (const a of AVENUES) context.fillRect(cx - R + a * scale, cy - R, 2, R * 2);
    for (const s of STREETS) context.fillRect(cx - R, cy - R + s * scale, R * 2, 2);
    const px = state.player.x; const py = state.player.y;
    // shops
    for (const s of SHOPS) {
      context.fillStyle = '#7ec850';
      context.fillRect(cx - R + s.x * scale - 3, cy - R + s.y * scale - 3, 6, 6);
    }
    // mission marker
    const target = state._missionTarget;
    if (target) {
      context.fillStyle = '#f2c94c';
      context.beginPath();
      context.arc(cx - R + target.x * scale, cy - R + target.y * scale, 5, 0, Math.PI * 2);
      context.fill();
    }
    // police
    context.fillStyle = '#4f8ff7';
    for (const pc of state.police) {
      context.beginPath();
      context.arc(cx - R + pc.x * scale, cy - R + pc.y * scale, 3.5, 0, Math.PI * 2);
      context.fill();
    }
    // player
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(cx - R + px * scale, cy - R + py * scale, 5, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#f2c94c';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(cx - R + px * scale, cy - R + py * scale, 7, 0, Math.PI * 2);
    context.stroke();
    context.restore();
    // ring + north label
    context.strokeStyle = 'rgba(242,245,247,0.85)';
    context.lineWidth = 3;
    context.beginPath();
    context.arc(cx, cy, R, 0, Math.PI * 2);
    context.stroke();
    text('N', cx, cy - R + 14, 13, '#f2f5f7', 'center');
    const d = districtAt(px, py);
    text(d.name, cx, cy + R - 8, 13, '#f2f5f7', 'center');
  }

  function drawHud(state, screen) {
    const p = state.player;
    // top-left: money + district
    context.fillStyle = 'rgba(16,22,30,0.75)';
    context.fillRect(14, 12, 250, 64);
    text(`$${p.money.toLocaleString('en-US')}`, 26, 40, 26, '#7ec850');
    const d = districtAt(p.x, p.y);
    text(d.name, 26, 64, 15, '#f2f5f7');
    // top-right: wanted stars
    context.fillStyle = 'rgba(16,22,30,0.75)';
    context.fillRect(VIEW.width - 214, 12, 200, 44);
    for (let i = 0; i < 5; i += 1) {
      text('★', VIEW.width - 196 + i * 38, 44, 28, i < state.wanted ? '#ffb02e' : '#4a5560', 'left', 'middle');
    }
    // top-centre: clock
    const hh = String(Math.floor(state.clockMinutes / 60) % 24).padStart(2, '0');
    const mm = String(state.clockMinutes % 60).padStart(2, '0');
    text(`${hh}:${mm}`, VIEW.width / 2, 34, 22, '#f2f5f7', 'center', 'middle');
    // health bar (bottom-left, above minimap space)
    context.fillStyle = 'rgba(16,22,30,0.75)';
    context.fillRect(14, VIEW.height - 66, 250, 52);
    text('HEALTH', 26, VIEW.height - 46, 13, '#aeb8c2');
    context.fillStyle = '#2b2f36';
    context.fillRect(26, VIEW.height - 38, 200, 14);
    context.fillStyle = p.health > 30 ? '#7ec850' : '#e5534b';
    context.fillRect(26, VIEW.height - 38, 200 * (p.health / 100), 14);
    text(`${Math.ceil(p.health)}`, 232, VIEW.height - 26, 13, '#f2f5f7');
    // weapon + ammo (bottom-right, left of minimap)
    const w = WEAPONS[p.weapon];
    context.fillStyle = 'rgba(16,22,30,0.75)';
    context.fillRect(VIEW.width - 430, VIEW.height - 66, 200, 52);
    text(w.name, VIEW.width - 418, VIEW.height - 46, 14, '#f2f5f7');
    if (p.weapon === 'pistol') text(`${p.ammo} / ${p.reserveAmmo}`, VIEW.width - 418, VIEW.height - 26, 14, p.ammo === 0 ? '#e5534b' : '#f2c94c');
    else text('1 Fists  2 Bat  3 Pistol', VIEW.width - 418, VIEW.height - 26, 12, '#aeb8c2');
    // objective bar
    const obj = state._objective || '';
    if (obj) {
      context.fillStyle = 'rgba(16,22,30,0.75)';
      const wdt = Math.min(640, 24 + obj.length * 8.4);
      context.fillRect((VIEW.width - wdt) / 2, 66, wdt, 34);
      text(obj, VIEW.width / 2, 88, 16, '#f2c94c', 'center', 'middle');
    }
    // message toast
    if (state.messageTimer > 0 && state.message) {
      context.fillStyle = 'rgba(16,22,30,0.85)';
      const wdt = Math.min(760, 30 + state.message.length * 8.2);
      context.fillRect((VIEW.width - wdt) / 2, VIEW.height - 130, wdt, 36);
      text(state.message, VIEW.width / 2, VIEW.height - 106, 16, '#f2f5f7', 'center', 'middle');
    }
    // prompts
    if (state.nearShop && !state.shopOpen) text(`Press E — enter ${state.nearShop.name}`, VIEW.width / 2, VIEW.height - 150, 18, '#7ec850', 'center');
    if (state.nearMissionNpc) text('Press E — talk', VIEW.width / 2, VIEW.height - 150, 18, '#f2c94c', 'center');
    if (state.nearCar && !p.inCar) text('Press E — steal car', VIEW.width / 2, VIEW.height - 150, 18, '#f2c94c', 'center');
    drawMinimap(state, screen);
  }

  function drawWorld(state, pulse) {
    const cam = state.camera;
    context.save();
    context.translate(-(cam.x - VIEW.width / 2), -(cam.y - VIEW.height / 2));
    drawGround(state);
    for (const b of state.buildings) drawBuilding(b);
    const target = state._missionTarget;
    if (target) drawMissionMarker(target.x, target.y, pulse);
    // cars (parked + traffic + police + roadblocks)
    const allCars = [...state.cars, ...state.police, ...state.roadblocks];
    allCars.sort((a, b) => a.y - b.y);
    for (const car of allCars) drawCar(car, state.player.inCar === car);
    // pedestrians + enemies
    for (const p of state.peds) {
      drawPerson(p.x, p.y, p.angle, p.shirt, '#2b3a4a', { dead: p.dead, bob: Math.sin(p.walkPhase) * 1.5 });
    }
    for (const e of state.enemies) {
      if (e.dead) drawPerson(e.x, e.y, e.angle, '#8a2f2f', '#2b2f36', { dead: true });
      else drawPerson(e.x, e.y, e.angle, '#8a2f2f', '#2b2f36', { bob: Math.sin(state.elapsed * 6) * 1.5 });
    }
    // bullets
    context.fillStyle = '#ffe9a8';
    for (const b of state.bullets) {
      context.beginPath();
      context.arc(b.x, b.y, 3, 0, Math.PI * 2);
      context.fill();
    }
    // particles
    for (const pt of state.particles) {
      context.globalAlpha = Math.max(0, pt.life);
      context.fillStyle = pt.color;
      context.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    context.globalAlpha = 1;
    // player (on foot)
    const p = state.player;
    if (!p.inCar && !p.dead) {
      const outfit = OUTFITS[p.outfit] || OUTFITS.default;
      const blink = p.hurtTimer > 0 && Math.floor(p.hurtTimer * 12) % 2 === 0;
      if (!blink) drawPerson(p.x, p.y, p.angle, outfit.shirt, outfit.pants, { aim: p.weapon === 'pistol', bob: 0 });
    }
    // helicopter + searchlight
    if (state.heli) {
      const h = state.heli;
      context.fillStyle = 'rgba(242,201,76,0.16)';
      context.beginPath();
      context.moveTo(h.x, h.y);
      context.arc(p.x, p.y, 150, Math.atan2(p.y - h.y, p.x - h.x) - 0.35, Math.atan2(p.y - h.y, p.x - h.x) + 0.35);
      context.closePath();
      context.fill();
      context.fillStyle = 'rgba(0,0,0,0.3)';
      context.beginPath();
      context.ellipse(h.x + 14, h.y + 18, 30, 12, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#2b2f36';
      context.beginPath();
      context.ellipse(h.x, h.y, 26, 10, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#e5534b';
      context.fillRect(h.x - 26, h.y - 2, 52, 4);
    }
    // floating texts
    for (const t of state.texts) {
      context.globalAlpha = Math.max(0, Math.min(1, t.life));
      text(t.text, t.x, t.y, 20, t.color, 'center', 'middle');
    }
    context.globalAlpha = 1;
    context.restore();
  }

  function drawPanel(title, lines, prompt, accent = '#f2c94c') {
    const width = 640;
    const height = 150 + lines.length * 32;
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = 'rgba(10,14,20,0.5)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, width, height);
    context.strokeStyle = accent;
    context.lineWidth = 3;
    context.strokeRect(x, y, width, height);
    text(title, VIEW.width / 2, y + 66, 46, '#f2f5f7', 'center');
    lines.forEach((line, i) => text(line, VIEW.width / 2, y + 116 + i * 32, 20, '#aeb8c2', 'center'));
    text(prompt, VIEW.width / 2, y + height - 30, 20, accent, 'center');
  }

  function drawShop(state) {
    const shop = state.shopOpen;
    if (!shop) return;
    const lines = shop.items.map((it) => `[${it.key}] ${it.name} — $${it.price} · ${it.desc}`);
    drawPanel(shop.name, [...lines, '', `Cash: $${state.player.money}`], 'Press 1-3 to buy · E or Esc to leave', '#7ec850');
  }

  function draw(state, screen, best, pulse) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      drawWorld(state, pulse);
      drawPanel('SOLMARIS', [
        'A sun-soaked coastal city. Five districts, one big job.',
        'WASD move · E steal cars & talk · Mouse aim · Click shoot',
        'F punch · 1/2/3 weapons · R reload · P pause · M mute',
        'Missions, wanted stars, police, shops — the whole city is yours.',
      ], 'Press Space or click to start', '#f2c94c');
      return;
    }
    drawWorld(state, pulse);
    drawHud(state, screen);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The city waits for you.', `Missions done: ${state.stats.missionsDone} · Earned: $${state.stats.earned}`], 'Press P to resume · progress auto-saves', '#aeb8c2');
    } else if (screen === SCREEN_OVER) {
      drawPanel('WASTED', ['You got taken down in Solmaris.', `Cash left: $${state.player.money}`], 'Press Space to try again', '#e5534b');
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', ['The harbor police caught you.', 'Fine: $100. The heat is off — for now.'], 'Press Space to walk free', '#4f8ff7');
    }
    if (screen === SCREEN_PLAY && state.shopOpen) drawShop(state);
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
