// Drawing only: the world state in, pixels out. Top-down, sun-soaked: warm
// grass, grey asphalt with yellow dashes, sand and a turquoise ocean along
// the south edge, flat rooftops with shadows, palm fronds, and cars as
// rounded bodies with windshields. The camera transform puts the player in
// the middle; everything off-screen is skipped.

import { BEACH_Y, CAR, OCEAN_Y, PALETTE, ROAD, WORLD } from './config.js';

function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { x0: 0, y0: 0, x1: 0, y1: 0 };
  let dpr = 1;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
  }
  resize();
  window.addEventListener('resize', resize);

  function contains(x, y, pad) {
    return x > view.x0 - pad && x < view.x1 + pad && y > view.y0 - pad && y < view.y1 + pad;
  }
  view.contains = contains;

  function drawGround(G, time) {
    const cam = G.camera;
    const zoom = cam.zoom;
    // Grass base with a faint mow pattern.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
    ctx.fillStyle = PALETTE.grassDark;
    const cell = 128;
    const startX = Math.floor(view.x0 / cell) * cell;
    const startY = Math.floor(view.y0 / cell) * cell;
    for (let x = startX; x < view.x1; x += cell) {
      for (let y = startY; y < view.y1; y += cell) {
        if (((x + y) / cell) % 2 === 0) ctx.fillRect(x, y, cell, cell);
      }
    }
    // Beach sand and the ocean.
    if (view.y1 > BEACH_Y) {
      ctx.fillStyle = PALETTE.sand;
      ctx.fillRect(view.x0, BEACH_Y, view.x1 - view.x0, OCEAN_Y - BEACH_Y);
      ctx.fillStyle = PALETTE.sandWet;
      ctx.fillRect(view.x0, OCEAN_Y - 26, view.x1 - view.x0, 26);
      ctx.fillStyle = PALETTE.ocean;
      ctx.fillRect(view.x0, OCEAN_Y, view.x1 - view.x0, view.y1 - OCEAN_Y);
      // Rolling wave lines.
      ctx.strokeStyle = PALETTE.oceanFoam;
      ctx.lineWidth = 2;
      for (let row = 0; row < 3; row += 1) {
        const wy = OCEAN_Y + 18 + row * 26 + Math.sin(time * 0.9 + row * 2) * 4;
        ctx.beginPath();
        for (let x = view.x0; x <= view.x1; x += 42) {
          const y = wy + Math.sin(x * 0.02 + time * 1.3 + row) * 3;
          if (x === view.x0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // Foam at the waterline.
      ctx.fillStyle = 'rgba(191, 232, 242, 0.85)';
      for (let x = Math.floor(view.x0 / 46) * 46; x < view.x1; x += 46) {
        const wob = Math.sin(time * 1.6 + x * 0.05) * 5;
        ctx.fillRect(x, OCEAN_Y - 4 + wob, 26, 4);
      }
    }
    // Sidewalks (a pale band) then asphalt on top, road by road.
    const half = ROAD.width / 2;
    ctx.fillStyle = PALETTE.sidewalk;
    for (const vx of ROAD.vertical) {
      if (vx + half + 14 < view.x0 || vx - half - 14 > view.x1) continue;
      ctx.fillRect(vx - half - 14, view.y0, ROAD.width + 28, view.y1 - view.y0);
    }
    for (const hy of ROAD.horizontal) {
      if (hy + half + 14 < view.y0 || hy - half - 14 > view.y1) continue;
      ctx.fillRect(view.x0, hy - half - 14, view.x1 - view.x0, ROAD.width + 28);
    }
    ctx.fillStyle = PALETTE.asphalt;
    for (const vx of ROAD.vertical) {
      if (vx + half < view.x0 || vx - half > view.x1) continue;
      ctx.fillRect(vx - half, view.y0, ROAD.width, view.y1 - view.y0);
    }
    for (const hy of ROAD.horizontal) {
      if (hy + half < view.y0 || hy - half > view.y1) continue;
      ctx.fillRect(view.x0, hy - half, view.x1 - view.x0, ROAD.width);
    }
    // Centre dashes.
    ctx.fillStyle = PALETTE.asphaltLine;
    for (const vx of ROAD.vertical) {
      if (vx < view.x0 || vx > view.x1) continue;
      for (let y = Math.floor(view.y0 / 44) * 44; y < view.y1; y += 44) {
        ctx.fillRect(vx - 2, y, 4, 22);
      }
    }
    for (const hy of ROAD.horizontal) {
      if (hy < view.y0 || hy > view.y1) continue;
      for (let x = Math.floor(view.x0 / 44) * 44; x < view.x1; x += 44) {
        ctx.fillRect(x, hy - 2, 22, 4);
      }
    }
    // Crosswalk stripes at every intersection.
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const vx of ROAD.vertical) {
      for (const hy of ROAD.horizontal) {
        if (!contains(vx, hy, 80)) continue;
        for (let i = -2; i <= 2; i += 1) {
          ctx.fillRect(vx + i * 12 - 4, hy - half - 12, 8, 10);
          ctx.fillRect(vx + i * 12 - 4, hy + half + 2, 8, 10);
        }
      }
    }
  }

  function drawBuildings(G) {
    for (const b of G.city.buildings) {
      if (b.x > view.x1 || b.x + b.w < view.x0 || b.y > view.y1 || b.y + b.h < view.y0) continue;
      // Long afternoon shadow.
      ctx.fillStyle = 'rgba(30, 30, 40, 0.28)';
      ctx.fillRect(b.x + b.height * 0.7, b.y + b.height * 0.9, b.w, b.h);
      // Walls and roof.
      ctx.fillStyle = b.color;
      ctx.globalAlpha = b.shade;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.globalAlpha = 1;
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      // Rooftop units.
      ctx.fillStyle = 'rgba(90, 90, 100, 0.6)';
      const n = b.units;
      for (let i = 0; i < n; i += 1) {
        const ux = b.x + 14 + ((i * 37) % Math.max(20, b.w - 40));
        const uy = b.y + 14 + ((i * 53) % Math.max(20, b.h - 40));
        ctx.fillRect(ux, uy, 12, 9);
      }
      ctx.strokeStyle = 'rgba(40, 40, 50, 0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    }
  }

  function drawProps(G, time) {
    // Palm trees: trunk, then a crown of fronds.
    for (const palm of G.city.palms) {
      if (!contains(palm.x, palm.y, 40)) continue;
      const s = palm.s;
      ctx.strokeStyle = PALETTE.palmTrunk;
      ctx.lineWidth = 5 * s;
      ctx.beginPath();
      ctx.moveTo(palm.x, palm.y);
      ctx.lineTo(palm.x + palm.lean * 30, palm.y - 26 * s);
      ctx.stroke();
      const cx = palm.x + palm.lean * 30;
      const cy = palm.y - 26 * s;
      ctx.fillStyle = PALETTE.palm;
      for (let i = 0; i < 7; i += 1) {
        const a = (i / 7) * Math.PI * 2 + Math.sin(time * 0.7 + palm.x) * 0.06;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.ellipse(13 * s, 0, 14 * s, 4.5 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(30, 30, 40, 0.22)';
      ctx.beginPath();
      ctx.ellipse(palm.x + 8, palm.y + 4, 12 * s, 5 * s, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Street lamps.
    ctx.fillStyle = '#3a3f46';
    for (const lamp of G.city.lamps) {
      if (!contains(lamp.x, lamp.y, 12)) continue;
      ctx.fillRect(lamp.x - 1.5, lamp.y - 3, 3, 12);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillRect(lamp.x - 3, lamp.y - 5, 6, 4);
      ctx.fillStyle = '#3a3f46';
    }
  }

  function drawPickups(G, time) {
    for (const pk of G.pickups) {
      if (!contains(pk.x, pk.y, 30)) continue;
      const bob = Math.sin(pk.bob) * 3;
      const y = pk.y + bob;
      ctx.save();
      ctx.translate(pk.x, y);
      if (pk.kind === 'health') {
        ctx.fillStyle = '#ffffff';
        rr(ctx, -11, -11, 22, 22, 4);
        ctx.fill();
        ctx.fillStyle = '#37b24d';
        ctx.fillRect(-3, -8, 6, 16);
        ctx.fillRect(-8, -3, 16, 6);
      } else if (pk.kind === 'ammo') {
        ctx.fillStyle = '#2b2f36';
        rr(ctx, -11, -9, 22, 18, 3);
        ctx.fill();
        ctx.fillStyle = '#ffd94a';
        ctx.fillRect(-7, -4, 4, 9);
        ctx.fillRect(-1, -4, 4, 9);
        ctx.fillRect(5, -4, 4, 9);
      } else {
        ctx.fillStyle = '#2f9e44';
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', 0, 1);
      }
      ctx.restore();
    }
  }

  function drawCar(G, car, time) {
    if (!contains(car.x, car.y, 60)) return;
    const L = CAR.length;
    const W = CAR.width;
    ctx.save();
    ctx.translate(car.x, car.y);
    // Shadow.
    ctx.fillStyle = 'rgba(20, 20, 28, 0.3)';
    rr(ctx, -L / 2 + 4, -W / 2 + 6, L, W, 8);
    ctx.fill();
    ctx.rotate(car.angle);
    // Body.
    ctx.fillStyle = car.color;
    rr(ctx, -L / 2, -W / 2, L, W, 8);
    ctx.fill();
    // Darker lower edge for depth.
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    rr(ctx, -L / 2, W / 2 - 6, L, 6, 3);
    ctx.fill();
    // Windshield and rear window.
    ctx.fillStyle = '#1c2733';
    rr(ctx, L / 2 - 16, -W / 2 + 3, 10, W - 6, 3);
    ctx.fill();
    rr(ctx, -L / 2 + 4, -W / 2 + 3, 7, W - 6, 3);
    ctx.fill();
    // Roof.
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    rr(ctx, -8, -W / 2 + 4, 16, W - 8, 4);
    ctx.fill();
    // Wheels.
    ctx.fillStyle = '#15161a';
    ctx.fillRect(L / 2 - 12, -W / 2 - 3, 10, 5);
    ctx.fillRect(L / 2 - 12, W / 2 - 2, 10, 5);
    ctx.fillRect(-L / 2 + 2, -W / 2 - 3, 10, 5);
    ctx.fillRect(-L / 2 + 2, W / 2 - 2, 10, 5);
    // Headlights.
    ctx.fillStyle = '#fff6c8';
    ctx.fillRect(L / 2 - 2, -W / 2 + 2, 3, 4);
    ctx.fillRect(L / 2 - 2, W / 2 - 6, 3, 4);
    if (car.kind === 'taxi') {
      ctx.fillStyle = '#222';
      for (let i = 0; i < 5; i += 1) ctx.fillRect(-10 + i * 5, -2, 4, 4);
    }
    if (car.kind === 'police') {
      // White doors and a flashing light bar.
      ctx.fillStyle = '#f2f2f2';
      rr(ctx, -6, -W / 2 + 2, 12, W - 4, 3);
      ctx.fill();
      const flash = Math.floor(time * 5) % 2 === 0;
      ctx.fillStyle = flash ? '#ff3b30' : '#2b5fd9';
      ctx.fillRect(-4, -W / 2 - 1, 8, 5);
      ctx.fillStyle = flash ? '#2b5fd9' : '#ff3b30';
      ctx.fillRect(-4, W / 2 - 4, 8, 5);
    }
    if (car.health < 40) {
      ctx.fillStyle = 'rgba(20,20,20,0.5)';
      ctx.beginPath();
      ctx.arc(-L / 4, 0, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawWalker(G, x, y, angle, color, phase, down, isCop) {
    if (!contains(x, y, 30)) return;
    ctx.save();
    ctx.translate(x, y);
    if (down > 0) {
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillStyle = color;
      rr(ctx, -11, -6, 22, 12, 6);
      ctx.fill();
      ctx.fillStyle = '#e8b88a';
      ctx.beginPath();
      ctx.arc(13, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    const bob = Math.sin(phase) * 1.5;
    ctx.rotate(angle);
    // Shadow.
    ctx.fillStyle = 'rgba(20,20,28,0.25)';
    ctx.beginPath();
    ctx.ellipse(1, 3, 9, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Body and head.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b88a';
    ctx.beginPath();
    ctx.arc(3, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    if (isCop) {
      ctx.fillStyle = '#1a3a8a';
      ctx.beginPath();
      ctx.arc(3, 0, 5.5, Math.PI, 0);
      ctx.fill();
    }
    // Facing tick.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(8, -1.5 + bob * 0.3, 5, 3);
    ctx.restore();
  }

  function drawPlayer(G, time) {
    const p = G.player;
    if (p.inCar || p.health <= 0) return;
    if (!contains(p.x, p.y, 40)) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = 'rgba(20,20,28,0.3)';
    ctx.beginPath();
    ctx.ellipse(1, 4, 11, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Lena: red jacket, dark jeans, hair.
    ctx.fillStyle = '#ff5a3c';
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2f36';
    ctx.fillRect(-11, -7, 7, 14);
    ctx.fillStyle = '#3a2a1a';
    ctx.beginPath();
    ctx.arc(-2, 0, 6.5, 0, Math.PI * 2);
    ctx.fill();
    // Pistol in hand when armed.
    if (p.weapon === 'pistol') {
      ctx.fillStyle = '#22242a';
      ctx.fillRect(8, -2, 10, 4);
    }
    // Punch swing.
    if (p.punchAnim > 0) {
      ctx.fillStyle = '#e8b88a';
      ctx.beginPath();
      ctx.arc(20, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Hurt flash.
    if (p.hurtFlash > 0) {
      ctx.globalAlpha = Math.min(0.6, p.hurtFlash * 2);
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // Reload ring.
    if (p.reloading > 0) {
      ctx.strokeStyle = '#ffd94a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 20, -Math.PI / 2, -Math.PI / 2 + (1 - p.reloading / 1.1) * Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawBullets(G) {
    ctx.strokeStyle = '#ffe98a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (const b of G.bullets) {
      if (!contains(b.x, b.y, 30)) continue;
      ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }

  function drawWaypoint(G, time) {
    const target = G.mission && G.mission.target ? G.mission.target
      : G.job && G.job.target ? G.job.target : null;
    if (!target) return;
    const pulse = 1 + Math.sin(time * 5) * 0.12;
    // Marker in the world.
    ctx.save();
    ctx.translate(target.x, target.y);
    ctx.strokeStyle = PALETTE.waypoint;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 26 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PALETTE.waypoint;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(10, 0);
    ctx.lineTo(0, 14);
    ctx.lineTo(-10, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Edge arrow when the target is off-screen.
    const s = G.camera.worldToScreen(target.x, target.y, G.viewW, G.viewH);
    const margin = 46;
    if (s.x < margin || s.x > G.viewW - margin || s.y < margin || s.y > G.viewH - margin) {
      const cx = G.viewW / 2;
      const cy = G.viewH / 2;
      const ang = Math.atan2(s.y - cy, s.x - cx);
      const ax = cx + Math.cos(ang) * (Math.min(G.viewW, G.viewH) / 2 - 70);
      const ay = cy + Math.sin(ang) * (Math.min(G.viewW, G.viewH) / 2 - 70);
      const dist = Math.round(Math.hypot(target.x - G.player.x, target.y - G.player.y));
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      ctx.fillStyle = PALETTE.waypoint;
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-10, -11);
      ctx.lineTo(-10, 11);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${dist}m`, ax, ay + 26);
    }
  }

  function draw(G, tint) {
    const cam = G.camera;
    const viewW = G.viewW;
    const viewH = G.viewH;
    const zoom = cam.zoom;
    view.x0 = cam.x - viewW / 2 / zoom;
    view.y0 = cam.y - viewH / 2 / zoom;
    view.x1 = cam.x + viewW / 2 / zoom;
    view.y1 = cam.y + viewH / 2 / zoom;
    const time = G.time;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0e1420';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * (viewW / 2 - cam.x * zoom), dpr * (viewH / 2 - cam.y * zoom));

    drawGround(G, time);
    drawBuildings(G);
    drawProps(G, time);
    drawPickups(G, time);
    G.effects.draw(ctx, view);
    for (const car of G.cars) if (!car.dead) drawCar(G, car, time);
    for (const ped of G.peds) drawWalker(G, ped.x, ped.y, ped.angle, ped.color, ped.walkPhase, ped.down, false);
    for (const cop of G.cops) {
      if (cop.down >= 900) continue;
      drawWalker(G, cop.x, cop.y, cop.angle, '#2b5fd9', cop.walkPhase, cop.down, true);
    }
    drawPlayer(G, time);
    drawBullets(G);
    drawWaypoint(G, time);

    // Sun tint and vignette, in screen space.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (tint) {
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, viewW, viewH);
    }
    const grad = ctx.createRadialGradient(viewW / 2, viewH / 2, Math.min(viewW, viewH) * 0.42, viewW / 2, viewH / 2, Math.max(viewW, viewH) * 0.72);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(10, 12, 30, 0.28)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewW, viewH);
  }

  return { draw, resize, view };
}
