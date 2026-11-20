// Save and continue: Lena's cash, health, mission progress, position and
// wanted level live in localStorage, so the title screen can offer a
// Continue button. Saving is cheap and silent; a missing or corrupt save
// just means a fresh start.

import { SAVE_KEY } from './config.js';

export function saveGame(G) {
  try {
    const data = {
      version: 1,
      cash: Math.floor(G.player.cash),
      health: Math.round(G.player.health),
      ammo: G.player.ammo,
      reserve: G.player.reserve,
      missionIndex: G.mission ? G.mission.index : (G.storyDone ? 99 : 0),
      storyDone: !!G.storyDone,
      x: Math.round(G.player.x),
      y: Math.round(G.player.y),
      wanted: G.wanted.stars,
      missionsDone: G.stats.missionsDone,
      carsStolen: G.stats.carsStolen,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage off: nothing to clear.
  }
}
