// Particles and flashes: one pooled THREE.Points cloud for bursts (sparks, smoke,
// muzzle puffs, explosions) and a reusable point light for muzzle flashes and blasts.
// The pool is fixed at 400: bursts reuse dead particles instead of allocating, so
// a firefight never grows the scene's memory.

import * as THREE from 'three';

const MAX = 400;
// Muzzle-flash brightness in three.js physical light units; it decays to 0
// over the flash duration, so the flash reads as a pop rather than a glow.
const FLASH_INTENSITY = 60;

export function createEffects(scene) {
  const positions = new Float32Array(MAX * 3);
  const colors = new Float32Array(MAX * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size: 0.35, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  const parts = [];
  for (let i = 0; i < MAX; i += 1) {
    parts.push({ alive: false, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, gravity: 0, r: 1, g: 1, b: 1 });
    positions[i * 3 + 1] = -999;
  }
  const flash = new THREE.PointLight(0xffffff, 0, 18);
  scene.add(flash);
  let flashTime = 0;
  const color = new THREE.Color();

  return {
    // Spawns up to `count` particles; returns how many actually spawned
    // (fewer when the pool is busy, so callers can tell a burst was throttled).
    burst(pos, hex, count, speed, life, gravity) {
      color.setHex(hex);
      let spawned = 0;
      for (const p of parts) {
        if (spawned >= count) break;
        if (p.alive) continue;
        p.alive = true;
        p.x = pos.x; p.y = pos.y; p.z = pos.z;
        const a = Math.random() * Math.PI * 2;
        const up = (Math.random() - 0.3) * speed;
        p.vx = Math.sin(a) * speed * (0.4 + Math.random() * 0.6);
        p.vz = Math.cos(a) * speed * (0.4 + Math.random() * 0.6);
        p.vy = up;
        p.life = life * (0.6 + Math.random() * 0.7);
        p.maxLife = p.life;
        p.gravity = gravity;
        p.r = color.r; p.g = color.g; p.b = color.b;
        spawned += 1;
      }
      return spawned;
    },
    flash(pos, hex, dur) {
      flash.position.copy(pos);
      flash.color.setHex(hex);
      flash.intensity = FLASH_INTENSITY;
      flashTime = dur;
    },
    // How many particles are alive right now (handy for tuning burst sizes).
    aliveCount() {
      let n = 0;
      for (const p of parts) if (p.alive) n += 1;
      return n;
    },
    update(dt) {
      for (let i = 0; i < MAX; i += 1) {
        const p = parts[i];
        if (!p.alive) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.alive = false;
          positions[i * 3 + 1] = -999;
          continue;
        }
        p.vy -= p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.3; }
        positions[i * 3] = p.x;
        positions[i * 3 + 1] = p.y;
        positions[i * 3 + 2] = p.z;
        const fade = p.life / p.maxLife;
        colors[i * 3] = p.r * fade;
        colors[i * 3 + 1] = p.g * fade;
        colors[i * 3 + 2] = p.b * fade;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      if (flashTime > 0) {
        flashTime -= dt;
        flash.intensity = Math.max(0, flash.intensity - dt * 600);
      } else {
        flash.intensity = 0;
      }
    },
  };
}
