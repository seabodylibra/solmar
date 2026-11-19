// Keyboard and pointer input. Held keys give movement and driving; one-shot presses
// (enter a car, shoot, punch, pause, mute, confirm) are queued as bit flags and taken
// once by the loop, so a press between two frames is never lost or counted twice.
// Dragging the mouse orbits the camera.

export const ACTION_ENTER = 1;
export const ACTION_SHOOT = 2;
export const ACTION_PUNCH = 4;
export const ACTION_PAUSE = 8;
export const ACTION_MUTE = 16;
export const ACTION_CONFIRM = 32;

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let orbitDX = 0;
  let orbitDY = 0;
  let orbitWheel = 0;

  // Drop held keys, queued one-shot presses AND any half-finished camera drag,
  // so a key tapped or a drag started while the tab is unfocused never fires
  // as a stale action on return.
  function reset() {
    held.clear();
    actions = 0;
    dragging = false;
    orbitDX = 0;
    orbitDY = 0;
    orbitWheel = 0;
  }

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyE' && !event.repeat) actions |= ACTION_ENTER;
    else if (event.code === 'KeyF' && !event.repeat) actions |= ACTION_SHOOT;
    else if (event.code === 'KeyG' && !event.repeat) actions |= ACTION_PUNCH;
    else if ((event.code === 'KeyP' || event.code === 'Escape') && !event.repeat) actions |= ACTION_PAUSE;
    else if (event.code === 'KeyM' && !event.repeat) actions |= ACTION_MUTE;
    else if ((event.code === 'Enter' || event.code === 'Space') && !event.repeat) actions |= ACTION_CONFIRM;
    if (FORWARD.has(event.code) || BACK.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) {
      held.add(event.code);
      event.preventDefault();
    }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') held.add(event.code);
    if (event.code === 'Space') {
      held.add(event.code);
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', reset);

  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    orbitDX += event.clientX - lastX;
    orbitDY += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
  });
  const endDrag = () => { dragging = false; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (event) => {
    orbitWheel += event.deltaY;
    event.preventDefault();
  }, { passive: false });

  const has = (...codes) => codes.some((c) => held.has(c));

  return {
    /** Clear all held keys, queued presses and orbit state (same as losing focus). */
    reset,
    /** Camera-relative movement as world-space x/z (-1..1 each). */
    moveVector(cameraYaw) {
      const fwd = (has('KeyW', 'ArrowUp') ? 1 : 0) - (has('KeyS', 'ArrowDown') ? 1 : 0);
      const strafe = (has('KeyD', 'ArrowRight') ? 1 : 0) - (has('KeyA', 'ArrowLeft') ? 1 : 0);
      const fx = Math.sin(cameraYaw);
      const fz = Math.cos(cameraYaw);
      const rx = Math.cos(cameraYaw);
      const rz = -Math.sin(cameraYaw);
      return { x: fx * fwd + rx * strafe, z: fz * fwd + rz * strafe };
    },
    running() { return held.has('ShiftLeft') || held.has('ShiftRight'); },
    /** Driving: throttle 1 forward, -1 back; steer -1 left, 1 right; handbrake held. */
    drive() {
      return {
        throttle: (has('KeyW', 'ArrowUp') ? 1 : 0) - (has('KeyS', 'ArrowDown') ? 1 : 0),
        steer: (has('KeyD', 'ArrowRight') ? 1 : 0) - (has('KeyA', 'ArrowLeft') ? 1 : 0),
        handbrake: held.has('Space'),
      };
    },
    /** Orbit deltas since the last call, in pixels. */
    takeOrbit() {
      const out = { dx: orbitDX, dy: orbitDY, wheel: orbitWheel };
      orbitDX = 0;
      orbitDY = 0;
      orbitWheel = 0;
      return out;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
