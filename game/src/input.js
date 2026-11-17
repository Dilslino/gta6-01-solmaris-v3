// Keyboard and mouse input. Held keys are read every frame; one-shot presses (interact,
// pause, weapon switch, reload, shop keys) are queued as flags and taken once by the loop.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_RELOAD = 8;
export const ACTION_MELEE = 16;

const UP = new Set(['KeyW', 'ArrowUp']);
const DOWN = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const INTERACT = new Set(['KeyE']);
const RELOAD = new Set(['KeyR']);
const MELEE = new Set(['KeyF']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let mousePressed = false;
  const pressedDigits = new Set();

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)
      || CONFIRM.has(event.code) || PAUSE.has(event.code) || INTERACT.has(event.code)
      || RELOAD.has(event.code) || MELEE.has(event.code) || RUN.has(event.code)
      || /^Digit[123]$/.test(event.code)) {
      event.preventDefault();
    }
    if (event.repeat) return;
    keys.add(event.code);
    if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (INTERACT.has(event.code)) actions |= ACTION_INTERACT;
    else if (RELOAD.has(event.code)) actions |= ACTION_RELOAD;
    else if (MELEE.has(event.code)) actions |= ACTION_MELEE;
    else if (/^Digit[123]$/.test(event.code)) pressedDigits.add(event.code);
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseDown = true;
    mousePressed = true;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => { mouseDown = false; });

  function axis(neg, pos) {
    return (pos ? 1 : 0) - (neg ? 1 : 0);
  }

  return {
    moveX() { return axis(keys.has('KeyA') || keys.has('ArrowLeft'), keys.has('KeyD') || keys.has('ArrowRight')); },
    moveY() { return axis(keys.has('KeyW') || keys.has('ArrowUp'), keys.has('KeyS') || keys.has('ArrowDown')); },
    running() { return keys.has('ShiftLeft') || keys.has('ShiftRight'); },
    takeActions() { const taken = actions; actions = 0; return taken; },
    takeDigits() { const taken = new Set(pressedDigits); pressedDigits.clear(); return taken; },
    mouse() { return { x: mouseX, y: mouseY, down: mouseDown, pressed: mousePressed }; },
    clearMousePressed() { mousePressed = false; },
    /** Test hook: pretend a key is held. */
    debugHold(code, held) { if (held) keys.add(code); else keys.delete(code); },
    debugAction(flag) { actions |= flag; },
  };
}
