// Deterministic screenshot scenes behind ?shot=1-title|2-driving|3-chase|4-mission.
// Each plays the real rules forward from a fresh world for a fixed number of steps with a
// simple driving autopilot that follows road waypoints, so the frame is what real play looks
// like and the same seed always gives the same frame.
import { STEP } from './config.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const SAMPLE = STEP;

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Drive the player's car along a road polyline with pure pursuit: each step the car aims at
 * a point 150px ahead of its closest point on the path, so it joins the road and stays on it
 * through corners instead of overshooting them. Reverses briefly if wedged. */
function polyline(waypoints) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push({ a, b, len, start: total });
    total += len;
  }
  return { segs, total };
}

function closestS(pl, x, y) {
  let bestS = 0;
  let bestD = Infinity;
  for (const s of pl.segs) {
    const dx = s.b.x - s.a.x;
    const dy = s.b.y - s.a.y;
    const t = Math.max(0, Math.min(1, ((x - s.a.x) * dx + (y - s.a.y) * dy) / (s.len * s.len)));
    const px = s.a.x + dx * t;
    const py = s.a.y + dy * t;
    const d = Math.hypot(x - px, y - py);
    if (d < bestD) { bestD = d; bestS = s.start + s.len * t; }
  }
  return bestS;
}

function pointAt(pl, s) {
  s = Math.min(s, pl.total);
  for (const seg of pl.segs) {
    if (s <= seg.start + seg.len) {
      const t = (s - seg.start) / seg.len;
      return { x: seg.a.x + (seg.b.x - seg.a.x) * t, y: seg.a.y + (seg.b.y - seg.a.y) * t };
    }
  }
  const last = pl.segs[pl.segs.length - 1];
  return { x: last.b.x, y: last.b.y };
}

function driveRoute(world, waypoints, seconds) {
  const pl = polyline(waypoints);
  const state = world.state;
  let reverseTimer = 0;
  let lastX = state.player.x;
  let lastY = state.player.y;
  let checkTimer = 0;
  for (let t = 0; t < seconds; t += SAMPLE) {
    const p = state.player;
    if (!p.inCar) break;
    const s = closestS(pl, p.x, p.y);
    if (s >= pl.total - 5) break;
    // Near the path, look far ahead for smooth following; far from it, aim close so
    // the car joins the road instead of drifting parallel to it.
    const dPath = Math.hypot(p.x - pointAt(pl, s).x, p.y - pointAt(pl, s).y);
    const lookahead = dPath > 80 ? 50 : 150;
    checkTimer += SAMPLE;
    if (checkTimer > 1) {
      checkTimer = 0;
      if (Math.hypot(p.x - lastX, p.y - lastY) < 25 && reverseTimer <= 0) reverseTimer = 0.7;
      lastX = p.x; lastY = p.y;
    }
    if (reverseTimer > 0) {
      reverseTimer -= SAMPLE;
      world.step(SAMPLE, { moveX: 0, moveY: 1, running: false }, null);
      continue;
    }
    const target = pointAt(pl, s + lookahead);
    const want = Math.atan2(target.y - p.y, target.x - p.x);
    const diff = angleDiff(p.angle, want);
    const steer = Math.max(-1, Math.min(1, diff * 2.5));
    // Brake through sharp turns instead of coasting wide off the road.
    const speed = Math.abs(p.inCar.speed);
    const throttle = Math.abs(diff) > 1.0 ? (speed > 150 ? 1 : 0) : -1;
    world.step(SAMPLE, { moveX: steer, moveY: throttle, running: false }, null);
  }
}

export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  if (name === '1-title') {
    for (let t = 0; t < 4; t += SAMPLE) {
      world.step(SAMPLE, { moveX: 0, moveY: 0, running: false }, null);
    }
    return { screen: SCREEN_TITLE };
  }
  if (name === '2-driving') {
    // Walk to the runabout parked by the spawn, steal it, cruise east along 1st Street.
    world.debug.teleport(600, 420);
    world.interact();
    driveRoute(world, [{ x: 600, y: 420 }, { x: 600, y: 540 }, { x: 2600, y: 540 }], 9);
    return { screen: SCREEN_PLAY };
  }
  if (name === '3-chase') {
    world.debug.teleport(600, 420);
    world.interact();
    world.debug.setWanted(4);
    // Flee south down Harbor Ave, then east — police and the helicopter close in.
    driveRoute(world, [{ x: 600, y: 420 }, { x: 600, y: 1980 }, { x: 3000, y: 1980 }], 8);
    return { screen: SCREEN_PLAY };
  }
  // 4-mission: mission 1, second leg — drive the borrowed car into Palm Court Plaza.
  world.debug.setMission(0, 1);
  // Put a traffic car on 1st Street for the player to take, then drive to the plaza.
  const car = state.cars.find((c) => c.kind === 'traffic');
  if (car) { car.x = 1250; car.y = 540; car.angle = 0; car.target = { x: 1600, y: 540 }; }
  world.debug.teleport(1250, 540);
  world.interact();
  driveRoute(world, [{ x: 1600, y: 540 }, { x: 1600, y: 700 }], 6);
  return { screen: SCREEN_PLAY };
}

export { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE };
