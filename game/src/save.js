// Save / load through localStorage: cash, story progress, ammo and best cash.
// Storage can be off (private windows): the game then keeps progress for the visit only.
// Schema v1: missionIndex runs 0..5, where 5 means the whole story is done —
// it must be allowed through the clamp, or a finished story would reload as
// the last mission instead of free roam.

import { SAVE_KEY, BEST_KEY } from './config.js';

// Ammo never legitimately grows past a few hundred; cap it so a tampered or
// corrupted save cannot hand the player an absurd stockpile.
const MAX_AMMO = 999;

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      cash: Math.max(0, data.cash | 0),
      missionIndex: Math.min(5, Math.max(0, data.missionIndex | 0)),
      missionsDone: Math.min(5, Math.max(0, data.missionsDone | 0)),
      ammo: Math.min(MAX_AMMO, Math.max(0, data.ammo | 0)),
    };
  } catch {
    return null;
  }
}

// True when a valid save is present, without parsing it twice for callers
// that only need to decide whether to offer "Continue".
export function hasSave() {
  return loadSave() !== null;
}

export function writeSave(state) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: state.cash,
      missionIndex: state.missionIndex,
      missionsDone: state.missionsDone,
      ammo: state.ammo,
    }));
  } catch {
    // Storage off: ignore.
  }
}

export function readBestCash() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

export function writeBestCash(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage off: ignore.
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage off: ignore.
  }
}
