// The HUD: DOM readouts (cash, health, stars, speed, objective, dialogue)
// and a live minimap canvas (roads, beach, player, cars, cops, waypoint).
// The HUD is plain DOM so the text stays crisp in screenshots; the minimap
// is a small canvas redrawn every frame.

import { BEACH_Y, OCEAN_Y, PALETTE, ROAD, WORLD } from './config.js';

function el(id) {
  return document.getElementById(id);
}

function starRow(stars) {
  let out = '';
  for (let i = 0; i < 5; i += 1) {
    out += `<span class="${i < stars ? 'star on' : 'star'}">★</span>`;
  }
  return out;
}

export function createHud() {
  const cash = el('hud-cash');
  const healthFill = el('hud-health-fill');
  const healthText = el('hud-health-text');
  const ammo = el('hud-ammo');
  const stars = el('hud-stars');
  const speed = el('hud-speed');
  const objective = el('hud-objective');
  const objectiveSub = el('hud-objective-sub');
  const timer = el('hud-timer');
  const job = el('hud-job');
  const dialogue = el('hud-dialogue');
  const dialogueSpeaker = el('hud-dialogue-speaker');
  const dialogueText = el('hud-dialogue-text');
  const busted = el('hud-busted');
  const minimap = el('minimap');
  const mctx = minimap ? minimap.getContext('2d') : null;

  const mapScale = minimap ? minimap.width / WORLD.w : 0;
  const mapH = minimap ? minimap.height : 0;

  function drawMinimap(G) {
    if (!mctx) return;
    const w = minimap.width;
    const h = minimap.height;
    // Ground.
    mctx.fillStyle = PALETTE.grass;
    mctx.fillRect(0, 0, w, h);
    // Ocean and sand along the south edge.
    mctx.fillStyle = PALETTE.sand;
    mctx.fillRect(0, BEACH_Y * mapScale, w, h - BEACH_Y * mapScale);
    mctx.fillStyle = PALETTE.ocean;
    mctx.fillRect(0, OCEAN_Y * mapScale, w, h - OCEAN_Y * mapScale);
    // Roads.
    mctx.strokeStyle = PALETTE.asphalt;
    mctx.lineWidth = Math.max(2, ROAD.width * mapScale);
    mctx.beginPath();
    for (const vx of ROAD.vertical) {
      mctx.moveTo(vx * mapScale, 0);
      mctx.lineTo(vx * mapScale, h);
    }
    for (const hy of ROAD.horizontal) {
      mctx.moveTo(0, hy * mapScale);
      mctx.lineTo(w, hy * mapScale);
    }
    mctx.stroke();
    // Buildings as dark blocks.
    mctx.fillStyle = 'rgba(40, 42, 50, 0.85)';
    for (const b of G.city.buildings) {
      mctx.fillRect(b.x * mapScale, b.y * mapScale, Math.max(1, b.w * mapScale), Math.max(1, b.h * mapScale));
    }
    // Side-job target (green).
    if (G.job && G.job.target) {
      mctx.fillStyle = '#39d353';
      mctx.beginPath();
      mctx.arc(G.job.target.x * mapScale, G.job.target.y * mapScale, 4, 0, Math.PI * 2);
      mctx.fill();
    }
    // Mission waypoint (pulsing yellow star).
    if (G.mission && G.mission.target) {
      const pulse = 3 + Math.sin(G.time * 5) * 1.5;
      mctx.fillStyle = PALETTE.waypoint;
      mctx.beginPath();
      mctx.arc(G.mission.target.x * mapScale, G.mission.target.y * mapScale, pulse + 2, 0, Math.PI * 2);
      mctx.fill();
      mctx.fillStyle = '#222';
      mctx.beginPath();
      mctx.arc(G.mission.target.x * mapScale, G.mission.target.y * mapScale, 2, 0, Math.PI * 2);
      mctx.fill();
    }
    // Police cars (flashing blue/red).
    for (const car of G.cars) {
      if (car.dead || car.kind !== 'police') continue;
      mctx.fillStyle = Math.floor(G.time * 4) % 2 === 0 ? '#3a7bff' : '#ff4a4a';
      mctx.beginPath();
      mctx.arc(car.x * mapScale, car.y * mapScale, 3, 0, Math.PI * 2);
      mctx.fill();
    }
    // Traffic (pale dots).
    mctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const car of G.cars) {
      if (car.dead || car.kind === 'police') continue;
      mctx.fillRect(car.x * mapScale - 1, car.y * mapScale - 1, 2, 2);
    }
    // Player (white arrow).
    const p = G.player;
    mctx.save();
    mctx.translate(p.x * mapScale, p.y * mapScale);
    mctx.rotate(p.angle);
    mctx.fillStyle = '#ffffff';
    mctx.beginPath();
    mctx.moveTo(6, 0);
    mctx.lineTo(-4, -4);
    mctx.lineTo(-4, 4);
    mctx.closePath();
    mctx.fill();
    mctx.restore();
    // North tick.
    mctx.fillStyle = 'rgba(255,255,255,0.85)';
    mctx.font = 'bold 10px system-ui, sans-serif';
    mctx.fillText('N', 4, 12);
  }

  function update(G) {
    const p = G.player;
    if (cash) cash.textContent = `$${Math.floor(p.cash)}`;
    if (healthFill) {
      const pct = Math.max(0, (p.health / p.maxHealth) * 100);
      healthFill.style.width = `${pct}%`;
      healthFill.style.background = pct < 30 ? PALETTE.healthLow : PALETTE.health;
    }
    if (healthText) healthText.textContent = `${Math.ceil(Math.max(0, p.health))}`;
    if (ammo) {
      ammo.textContent = p.inCar ? '' : `Pistol  ${p.ammo} / ${p.reserve}${p.reloading > 0 ? '  reloading…' : ''}`;
    }
    if (stars) stars.innerHTML = starRow(G.wanted.stars);
    if (speed) {
      if (p.inCar) {
        const mph = Math.round(Math.abs(p.inCar.speed) * 0.14);
        speed.textContent = `${mph} mph`;
      } else {
        speed.textContent = '';
      }
    }
    if (objective) {
      if (G.mission) {
        objective.textContent = `Mission ${G.mission.index + 1}: ${G.mission.def.title}`;
        if (objectiveSub) objectiveSub.textContent = G.mission.objective;
      } else if (G.storyDone) {
        objective.textContent = 'Solmar is yours';
        if (objectiveSub) objectiveSub.textContent = 'Free roam — take a taxi fare or a courier job, or just drive.';
      } else {
        objective.textContent = '';
        if (objectiveSub) objectiveSub.textContent = '';
      }
    }
    if (timer) {
      const m = G.mission;
      if (m && m.def.stages[m.stage] && m.def.stages[m.stage].type === 'timed' && m.timer > 0) {
        timer.textContent = `${Math.ceil(m.timer)}s`;
        timer.style.display = 'block';
      } else if (G.job && G.job.type === 'courier' && G.job.stage === 'deliver') {
        timer.textContent = `${Math.ceil(G.job.timer)}s`;
        timer.style.display = 'block';
      } else {
        timer.style.display = 'none';
      }
    }
    if (job) {
      if (G.job) {
        job.textContent = G.job.type === 'taxi'
          ? (G.job.stage === 'pickup' ? 'Side job: pick up the taxi fare' : 'Side job: drop off the fare')
          : (G.job.stage === 'pickup' ? 'Side job: collect the courier package' : 'Side job: deliver the package');
        job.style.display = 'block';
      } else {
        job.style.display = 'none';
      }
    }
    if (dialogue) {
      const d = G.dialogue;
      if (d && G.time < d.until) {
        dialogue.style.display = 'block';
        if (dialogueSpeaker) dialogueSpeaker.textContent = d.speaker;
        if (dialogueText) dialogueText.textContent = d.text;
      } else {
        dialogue.style.display = 'none';
      }
    }
    if (busted) {
      const w = G.wanted;
      if (w.stars > 0 && w.busted > 0.2) {
        busted.style.display = 'block';
        busted.textContent = 'BUSTED?';
        busted.style.opacity = String(Math.min(1, w.busted / 1.2));
      } else {
        busted.style.display = 'none';
      }
    }
    drawMinimap(G);
  }

  return { update, drawMinimap };
}
