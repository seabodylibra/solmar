// Particles and skid marks. Everything here is cosmetic: short-lived dots
// with velocity and gravity, and dark tyre marks that fade slowly. The game
// spawns them; this module integrates and draws them.

export function createEffects() {
  const particles = [];
  const skids = [];

  function burst(x, y, opt) {
    const count = opt.count ?? 10;
    const speed = opt.speed ?? 160;
    const size = opt.size ?? 4;
    const life = opt.life ?? 0.6;
    const colors = Array.isArray(opt.color) ? opt.color : [opt.color ?? '#ffffff'];
    for (let i = 0; i < count; i += 1) {
      if (particles.length > 420) return;
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      particles.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: life * (0.6 + Math.random() * 0.7),
        max: life,
        size: size * (0.6 + Math.random() * 0.8),
        color: colors[(Math.random() * colors.length) | 0],
        grav: opt.grav ?? 0,
        drag: opt.drag ?? 0.9,
      });
    }
  }

  function smoke(x, y) {
    if (particles.length > 420) return;
    particles.push({
      x: x + (Math.random() - 0.5) * 8,
      y: y + (Math.random() - 0.5) * 8,
      vx: (Math.random() - 0.5) * 14,
      vy: -26 - Math.random() * 22,
      life: 1.1 + Math.random() * 0.5,
      max: 1.6,
      size: 7 + Math.random() * 6,
      color: '#555a60',
      grav: -14,
      drag: 0.96,
    });
  }

  function flame(x, y) {
    burst(x, y, { count: 14, color: ['#ff9a3c', '#ff5a2a', '#ffd94a'], speed: 200, size: 5, life: 0.5, grav: -40 });
  }

  function skid(x, y, angle) {
    if (skids.length > 500) skids.shift();
    skids.push({ x, y, angle, life: 9 });
  }

  function blood(x, y) {
    burst(x, y, { count: 8, color: ['#c22a2a', '#8f1d1d'], speed: 120, size: 3, life: 0.5 });
  }

  function update(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.vy += p.grav * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = skids.length - 1; i >= 0; i -= 1) {
      skids[i].life -= dt;
      if (skids[i].life <= 0) skids.splice(i, 1);
    }
  }

  function draw(ctx, view) {
    // Skid marks first (under everything that moves).
    ctx.fillStyle = 'rgba(20, 20, 24, 0.5)';
    for (const s of skids) {
      if (!view.contains(s.x, s.y, 30)) continue;
      ctx.save();
      ctx.globalAlpha = Math.min(0.55, s.life / 9);
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.fillRect(-7, -2.5, 14, 5);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    for (const p of particles) {
      if (!view.contains(p.x, p.y, 30)) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  return { particles, skids, burst, smoke, flame, skid, blood, update, draw };
}
