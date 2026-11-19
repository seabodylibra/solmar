// The HUD: wanted stars, cash and health, the mission tracker, dialogue lines, prompts
// and toasts — plus the live minimap, a top-down canvas of the city with the player,
// cars, cops and the mission marker on it.

import { CITY_EDGE, BEACH_Z, PITCH, GRID } from './config.js';

const MAP_RANGE = 340; // world units shown across the minimap
// Below this many hit points the health bar turns red, so low health reads at
// a glance in the middle of a chase.
const LOW_HEALTH = 30;
// Stars the wanted display ever shows (matches WANTED.max).
const MAX_STARS = 5;

export function createHud() {
  const el = (id) => document.getElementById(id);
  const hud = el('hud');
  const wanted = el('wanted');
  const cash = el('cash');
  const healthFill = el('healthfill');
  const ammo = el('ammo');
  const missionTitle = el('missionTitle');
  const missionObj = el('missionObj');
  const missionDist = el('missionDist');
  const dialogue = el('dialogue');
  const minimap = el('minimap');
  const mapCtx = minimap.getContext('2d');
  const speed = el('speed');
  const prompt = el('prompt');
  const toast = el('toast');
  let toastUntil = 0;
  let dialogueUntil = 0;

  function worldToMap(x, z) {
    const s = minimap.width / (MAP_RANGE * 2);
    return [minimap.width / 2 + x * s, minimap.height / 2 + z * s];
  }

  return {
    show() { hud.classList.remove('hidden'); },
    hide() { hud.classList.add('hidden'); },
    setWanted(stars) {
      let html = '';
      for (let i = 0; i < MAX_STARS; i += 1) html += i < stars ? '★' : '<span class="off">★</span>';
      wanted.innerHTML = html;
    },
    setCash(value) { cash.textContent = `$${value.toLocaleString('en-US')}`; },
    setHealth(value, max) {
      healthFill.style.width = `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
      // The bar turns red under LOW_HEALTH, so low health reads at a glance in a chase.
      healthFill.style.background = value < LOW_HEALTH
        ? 'linear-gradient(90deg, #e74c3c, #ff6b6b)'
        : 'linear-gradient(90deg, #2ecc71, #7dff9b)';
    },
    setAmmo(value) { ammo.textContent = `PISTOL — ${value}`; },
    setMission(title, text, dist, timer) {
      missionTitle.textContent = title;
      missionObj.textContent = text;
      missionDist.textContent = timer > 0
        ? `${Math.ceil(timer)}s left${dist !== null ? ` · ${Math.round(dist)}m` : ''}`
        : dist !== null ? `${Math.round(dist)}m away` : '';
    },
    showDialogue(speaker, text, seconds) {
      dialogue.innerHTML = `<b>${speaker}:</b> ${text}`;
      dialogue.classList.remove('hidden');
      dialogueUntil = performance.now() / 1000 + seconds;
    },
    showPrompt(text) {
      prompt.textContent = text;
      prompt.classList.remove('hidden');
    },
    hidePrompt() { prompt.classList.add('hidden'); },
    showToast(text, seconds) {
      toast.textContent = text;
      toast.classList.remove('hidden');
      toastUntil = performance.now() / 1000 + seconds;
    },
    setSpeed(kmh, driving) {
      if (driving) {
        speed.innerHTML = `${Math.round(kmh)}<small>km/h</small>`;
        speed.classList.remove('hidden');
      } else {
        speed.classList.add('hidden');
      }
    },
    /** Paint the minimap: roads, sea, player, cars, cops, target. */
    drawMinimap(world, target) {
      const g = mapCtx;
      const W = minimap.width;
      g.clearRect(0, 0, W, W);
      // Sea to the south.
      g.fillStyle = '#1d5f96';
      const [, seaY] = worldToMap(0, BEACH_Z + 30);
      g.fillRect(0, seaY, W, W - seaY);
      // City ground.
      g.fillStyle = '#3a4046';
      const [x0, y0] = worldToMap(-CITY_EDGE, -CITY_EDGE);
      const [x1, y1] = worldToMap(CITY_EDGE, CITY_EDGE);
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
      // Roads.
      g.strokeStyle = '#8b939a';
      g.lineWidth = 5;
      for (let k = -GRID; k <= GRID; k += 1) {
        const [ax, ay] = worldToMap(k * PITCH, -CITY_EDGE);
        const [bx, by] = worldToMap(k * PITCH, CITY_EDGE);
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
        const [cx, cy] = worldToMap(-CITY_EDGE, k * PITCH);
        const [dx, dy] = worldToMap(CITY_EDGE, k * PITCH);
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(dx, dy); g.stroke();
      }
      // Mission / taxi target: a pulsing yellow diamond.
      if (target) {
        const [tx, ty] = worldToMap(target.x, target.z);
        const pulse = 6 + Math.sin(performance.now() / 180) * 2;
        g.fillStyle = '#ffd23e';
        g.beginPath();
        g.moveTo(tx, ty - pulse); g.lineTo(tx + pulse, ty); g.lineTo(tx, ty + pulse); g.lineTo(tx - pulse, ty);
        g.closePath(); g.fill();
        g.strokeStyle = '#fff';
        g.lineWidth = 1.5;
        g.stroke();
      }
      // Traffic cars: small white dots.
      g.fillStyle = '#e8ecf0';
      for (const car of world.cars) {
        if (car.kind !== 'traffic') continue;
        const [px, py] = worldToMap(car.pos.x, car.pos.z);
        g.fillRect(px - 1.5, py - 1.5, 3, 3);
      }
      // Police: blue/red flashing dots.
      const flashBlue = Math.floor(performance.now() / 300) % 2 === 0;
      g.fillStyle = flashBlue ? '#3a7bff' : '#ff3b30';
      for (const car of world.police.cars) {
        const [px, py] = worldToMap(car.pos.x, car.pos.z);
        g.beginPath(); g.arc(px, py, 4, 0, Math.PI * 2); g.fill();
      }
      for (const cop of world.police.cops) {
        if (cop.health <= 0) continue;
        const [px, py] = worldToMap(cop.pos.x, cop.pos.z);
        g.beginPath(); g.arc(px, py, 3, 0, Math.PI * 2); g.fill();
      }
      // Player: white arrow with a dark outline, rotated to heading.
      const player = world.player;
      const pos = player.inCar ? player.inCar.pos : player.pos;
      const [px, py] = worldToMap(pos.x, pos.z);
      const heading = player.inCar ? player.inCar.heading : player.heading;
      g.save();
      g.translate(px, py);
      g.rotate(-heading + Math.PI);
      g.fillStyle = '#fff';
      g.strokeStyle = '#111';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(0, -8); g.lineTo(5.5, 6); g.lineTo(0, 3); g.lineTo(-5.5, 6);
      g.closePath(); g.fill(); g.stroke();
      g.restore();
      // Expire timed lines.
      const now = performance.now() / 1000;
      if (now > toastUntil) toast.classList.add('hidden');
      if (now > dialogueUntil) dialogue.classList.add('hidden');
    },
  };
}
