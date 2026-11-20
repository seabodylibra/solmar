// Solmar boot and the one loop: input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there.
// Screens: title (with a slow pan over the city), play, paused, busted and
// wasted. ?shot=chase|street|mission|beach stages that scene instead of
// running the loop, paints it twice and sets window.__shotReady.
//
// ?seed=N fixes the city. Without it the city is random each visit.

import { STEP } from './config.js';
import { createWorld, respawn, startRun, stepWorld } from './world.js';
import { createRenderer } from './render.js';
import { ACT_CONFIRM, ACT_PAUSE, createInput } from './input.js';
import { stageShot } from './shots.js';
import { clearSave, loadGame, saveGame } from './save.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const hud = document.getElementById('hud');
const screens = {
  title: document.getElementById('title-screen'),
  pause: document.getElementById('pause-screen'),
  busted: document.getElementById('busted-screen'),
  wasted: document.getElementById('wasted-screen'),
};

const G = createWorld(seed);
const renderer = createRenderer(canvas);
const input = createInput(canvas);

function syncView() {
  G.viewW = window.innerWidth;
  G.viewH = window.innerHeight;
}
syncView();
window.addEventListener('resize', syncView);

function showScreen(name) {
  for (const key of Object.keys(screens)) {
    screens[key].classList.toggle('show', key === name);
  }
  hud.style.display = name === null ? 'block' : 'none';
}

function announce(message) {
  status.textContent = message;
}

function startNew() {
  G.audio.ensure();
  clearSave();
  startRun(G, null);
  G.audio.music(true);
  showScreen(null);
  announce('Playing. Mission 1: First Pickup.');
}

function startContinue() {
  const save = loadGame();
  if (!save) {
    startNew();
    return;
  }
  G.audio.ensure();
  startRun(G, save);
  G.audio.music(true);
  showScreen(null);
  announce('Continuing your game in Solmar.');
}

function quitToTitle() {
  saveGame(G);
  G.audio.music(false);
  G.audio.engine(0, false);
  G.audio.siren(false);
  G.mode = 'title';
  refreshTitleButtons();
  showScreen('title');
  announce('Solmar. Press Enter or New game to start.');
}

function refreshTitleButtons() {
  const save = loadGame();
  const btn = document.getElementById('btn-continue');
  btn.style.display = save ? 'inline-block' : 'none';
}

document.getElementById('btn-new').addEventListener('click', startNew);
document.getElementById('btn-continue').addEventListener('click', startContinue);
document.getElementById('btn-resume').addEventListener('click', () => {
  G.mode = 'play';
  showScreen(null);
});
document.getElementById('btn-restart').addEventListener('click', () => {
  startNew();
});
document.getElementById('btn-quit').addEventListener('click', quitToTitle);
document.getElementById('btn-busted').addEventListener('click', () => {
  respawn(G, 'busted');
  showScreen(null);
  announce('Back on the street. Stay clean.');
});
document.getElementById('btn-wasted').addEventListener('click', () => {
  respawn(G, 'wasted');
  showScreen(null);
  announce('Back on the street. Stay clean.');
});

// First gesture unlocks the audio context (browsers demand one).
window.addEventListener('keydown', () => G.audio.ensure(), { once: true });
window.addEventListener('pointerdown', () => G.audio.ensure(), { once: true });

function runShot(name) {
  const scene = stageShot(name, G);
  G.mode = 'play';
  showScreen(null);
  G.hud.update(G);
  let painted = 0;
  function paint() {
    renderer.draw(G, scene.tint);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();
  let attract = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();

    if (G.mode === 'title') {
      // Slow attract pan over the city and the beach.
      attract += dt;
      G.time += dt;
      G.camera.snap(
        1280 + Math.sin(attract * 0.07) * 700,
        980 + Math.cos(attract * 0.045) * 420,
      );
      G.camera.clamp(G.viewW, G.viewH);
      renderer.draw(G, null);
      if (actions & ACT_CONFIRM) {
        if (loadGame()) startContinue();
        else startNew();
      }
      return;
    }

    if (G.mode === 'play') {
      if (actions & ACT_PAUSE) {
        G.mode = 'paused';
        saveGame(G);
        G.audio.music(false);
        G.audio.engine(0, false);
        G.audio.siren(false);
        showScreen('pause');
        announce('Paused.');
        renderer.draw(G, null);
        return;
      }
      accumulator += dt;
      let firstStep = true;
      while (accumulator >= STEP) {
        stepWorld(G, STEP, input, firstStep ? actions : 0);
        firstStep = false;
        accumulator -= STEP;
      }
      // A bust or a hospital trip flips the mode mid-step.
      if (G.mode === 'busted') {
        showScreen('busted');
        announce('Busted by the Solmar PD.');
      } else if (G.mode === 'wasted') {
        showScreen('wasted');
        announce('Wasted. You woke up at the hospital.');
      }
      renderer.draw(G, null);
      return;
    }

    if (G.mode === 'paused') {
      if (actions & (ACT_PAUSE | ACT_CONFIRM)) {
        G.mode = 'play';
        G.audio.music(true);
        showScreen(null);
        announce('Playing.');
      }
      renderer.draw(G, null);
      return;
    }

    if (G.mode === 'busted' || G.mode === 'wasted') {
      if (actions & ACT_CONFIRM) {
        respawn(G, G.mode);
        showScreen(null);
        announce('Back on the street. Stay clean.');
      }
      renderer.draw(G, null);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.mode === 'play') {
      G.mode = 'paused';
      saveGame(G);
      G.audio.music(false);
      showScreen('pause');
    }
  });

  refreshTitleButtons();
  showScreen('title');
  announce('Solmar. Press Enter or New game to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
