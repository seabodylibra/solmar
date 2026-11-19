// Solmar itself: a procedural sun-soaked coastal city. A canvas-painted ground (roads,
// sidewalks, crosswalks, a park, beach sand), box buildings with lit-window textures,
// palms along the beachfront, beach umbrellas, and an animated sea to the south.
// Everything is generated from the seeded RNG, so the same seed builds the same city.

import * as THREE from 'three';
import { PITCH, ROAD_W, BLOCK, GRID, CITY_EDGE, BEACH_Z, SEA_Z, PALETTE } from './config.js';

const WORLD_W = 640; // ground plane width (x: -320..320)
const WORLD_D = 720; // ground plane depth (z: -320..400)
const GROUND_CZ = 40; // ground plane centre z

// Sea animation: texture scroll speed and the gentle bob of the water plane.
const SEA_SCROLL = 0.008;
const SEA_BOB = 0.06;
// Trees planted in the centre park block.
const PARK_TREES = 9;

// Lit windows come from the seeded RNG, not Math.random: the same seed must build
// the same city down to which windows are lit, or staged screenshots would drift.
function makeFacadeTexture(base, lit, rng) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(0, 0, 128, 10);
  for (let y = 16; y < 244; y += 30) {
    for (let x = 10; x < 118; x += 30) {
      const isLit = rng.next() < 0.25;
      // Dark slate windows read on any facade colour, even in full sun.
      g.fillStyle = isLit ? lit : '#33506e';
      g.fillRect(x, y, 20, 20);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGroundTexture(rng) {
  // The ground is one 2048x2304 canvas painted in world space: sx/sz map world
  // metres to canvas pixels, so roads, sidewalks and the beach line up exactly
  // with the 3D colliders and buildings. Anisotropy 8 keeps the painted road
  // markings sharp when the camera looks down a long boulevard.
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 2304;
  const g = c.getContext('2d');
  const sx = (x) => ((x + WORLD_W / 2) / WORLD_W) * c.width;
  const sz = (z) => ((z - (GROUND_CZ - WORLD_D / 2)) / WORLD_D) * c.height;
  // Asphalt everywhere, then sidewalks per block.
  g.fillStyle = '#484e55';
  g.fillRect(0, 0, c.width, c.height);
  const px = (w) => (w / WORLD_W) * c.width;
  // Sidewalk blocks.
  g.fillStyle = '#b3b9bc';
  for (let i = -GRID; i < GRID; i += 1) {
    for (let j = -GRID; j < GRID - 1; j += 1) {
      g.fillRect(sx(i * PITCH + ROAD_W / 2), sz(j * PITCH + ROAD_W / 2), px(BLOCK), px(BLOCK));
    }
  }
  // Park block at the city centre (block 0,0: x and z from ROAD_W/2 to ROAD_W/2+BLOCK):
  // grass with paths. It must line up with the block the buildings skip.
  g.fillStyle = '#5d9b4a';
  g.fillRect(sx(ROAD_W / 2), sz(ROAD_W / 2), px(BLOCK), px(BLOCK));
  g.fillStyle = '#c9b48a';
  g.fillRect(sx(ROAD_W / 2) + px(BLOCK) / 2 - 4, sz(ROAD_W / 2), 8, px(BLOCK));
  g.fillRect(sx(ROAD_W / 2), sz(ROAD_W / 2) + px(BLOCK) / 2 - 4, px(BLOCK), 8);
  // Road centre dashes (yellow) and crosswalks (white) at every intersection.
  g.fillStyle = '#e8c33c';
  for (let k = -GRID; k <= GRID; k += 1) {
    for (let d = -CITY_EDGE; d < CITY_EDGE; d += 18) {
      g.fillRect(sx(k * PITCH) - 2, sz(d), 4, 9);
      g.fillRect(sx(d), sz(k * PITCH) - 2, 9, 4);
    }
  }
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = -GRID; i <= GRID; i += 1) {
    for (let j = -GRID; j <= GRID; j += 1) {
      for (let s = -1; s <= 1; s += 1) {
        g.fillRect(sx(i * PITCH - 6 + s * 5), sz(j * PITCH - ROAD_W / 2), 3, 8);
        g.fillRect(sx(i * PITCH - 6 + s * 5), sz(j * PITCH + ROAD_W / 2) - 8, 3, 8);
        g.fillRect(sx(i * PITCH - ROAD_W / 2), sz(j * PITCH - 6 + s * 5), 8, 3);
        g.fillRect(sx(i * PITCH + ROAD_W / 2) - 8, sz(j * PITCH - 6 + s * 5), 8, 3);
      }
    }
  }
  // Beach sand south of the last road, with a wavy waterline.
  g.fillStyle = '#e8d29a';
  g.fillRect(0, sz(BEACH_Z), c.width, sz(SEA_Z) - sz(BEACH_Z));
  g.fillStyle = '#dcc27e';
  for (let x = 0; x < c.width; x += 90) {
    g.beginPath();
    g.ellipse(x + 40, sz(SEA_Z) - 6, 46, 5, 0, 0, Math.PI * 2);
    g.fill();
  }
  // A few palm shadows / towel dots on the sand for colour.
  const dots = ['#ff6b6b', '#4ecdc4', '#ffd23e', '#ff9ff3'];
  for (let n = 0; n < 26; n += 1) {
    g.fillStyle = dots[n % dots.length];
    g.fillRect(sx(rng.range(-300, 300)), sz(rng.range(BEACH_Z + 8, SEA_Z - 8)), 10, 7);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeSeaTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#2e7fb8';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(255,255,255,0.25)';
  for (let y = 0; y < 256; y += 32) g.fillRect(0, y, 256, 5);
  g.fillStyle = 'rgba(20,70,120,0.35)';
  for (let y = 16; y < 256; y += 32) g.fillRect(0, y, 256, 6);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCity(scene, rng) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = []; // {minX,maxX,minZ,maxZ} building footprints

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_W, WORLD_D),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture(rng) }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, GROUND_CZ);
  ground.receiveShadow = true;
  group.add(ground);

  // Sea, animated by scrolling its texture.
  const seaTex = makeSeaTexture();
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 560),
    new THREE.MeshLambertMaterial({ map: seaTex }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.15, SEA_Z + 280);
  group.add(sea);

  // Buildings: 1-3 per block, taller toward the centre; the centre block is the park.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const facadeTexs = [
    makeFacadeTexture('#d9c39a', '#ffd98a', rng),
    makeFacadeTexture('#9fb4c4', '#ffe9a8', rng),
    makeFacadeTexture('#c98f6a', '#ffd98a', rng),
  ];
  const facadeMats = facadeTexs.map((t) => new THREE.MeshLambertMaterial({ map: t }));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a5148 });
  let tallest = null;
  for (let i = -GRID; i < GRID; i += 1) {
    for (let j = -GRID; j < GRID - 1; j += 1) {
      if (i === 0 && j === 0) continue; // the park
      const cx = i * PITCH + PITCH / 2;
      const cz = j * PITCH + PITCH / 2;
      const dist = Math.hypot(cx, cz) / CITY_EDGE;
      const count = rng.next() < 0.45 ? 1 : 2;
      for (let b = 0; b < count; b += 1) {
        const w = rng.range(16, count === 1 ? 44 : 22);
        const d = rng.range(16, count === 1 ? 44 : 22);
        const h = Math.max(7, rng.range(10, 46) * (1.35 - dist * 0.8));
        const ox = count === 1 ? 0 : (b === 0 ? -1 : 1) * (BLOCK / 4 - w / 4);
        const oz = count === 1 ? 0 : (b === 0 ? -1 : 1) * (BLOCK / 4 - d / 4);
        // JS % keeps the sign, so wrap the index into 0..2 for negative blocks.
        const matIndex = (((i * 7 + j * 13 + b) % 3) + 3) % 3;
        const mesh = new THREE.Mesh(boxGeo, facadeMats[matIndex]);
        mesh.scale.set(w, h, d);
        mesh.position.set(cx + ox, h / 2, cz + oz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        const roof = new THREE.Mesh(boxGeo, roofMat);
        roof.scale.set(w + 0.6, 0.8, d + 0.6);
        roof.position.set(cx + ox, h + 0.4, cz + oz);
        group.add(roof);
        colliders.push({
          minX: cx + ox - w / 2, maxX: cx + ox + w / 2,
          minZ: cz + oz - d / 2, maxZ: cz + oz + d / 2,
        });
        if (!tallest || h > tallest.h) tallest = { x: cx + ox, z: cz + oz, h };
      }
    }
  }

  // Park trees (low-poly spheres on cylinders) in the centre block.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x4a8f3f });
  for (let n = 0; n < PARK_TREES; n += 1) {
    const x = rng.range(-24, 24);
    const z = rng.range(-24, 24);
    if (Math.abs(x) < 5 || Math.abs(z) < 5) continue;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 3.4, 6), trunkMat);
    trunk.position.set(x, 1.7, z);
    trunk.castShadow = true;
    group.add(trunk);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 0), leafMat);
    crown.position.set(x, 4.6, z);
    crown.scale.y = 0.8;
    crown.castShadow = true;
    group.add(crown);
  }

  // Palms along the beachfront boulevard and a few on main streets.
  const palmTrunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmTrunk });
  const palmLeafMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmLeaf });
  const palmPositions = [];
  for (let x = -280; x <= 280; x += 40) palmPositions.push([x + rng.range(-4, 4), BEACH_Z - 12]);
  for (let z = -200; z <= 200; z += 80) palmPositions.push([8, z]);
  for (const [x, z] of palmPositions) {
    const h = rng.range(5, 7.5);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, h, 6), palmTrunkMat);
    trunk.position.set(x, h / 2, z);
    trunk.rotation.z = rng.range(-0.08, 0.08);
    trunk.castShadow = true;
    group.add(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.2, 7), palmLeafMat);
    crown.position.set(x, h + 0.8, z);
    crown.scale.y = 0.55;
    crown.castShadow = true;
    group.add(crown);
  }

  // Beach umbrellas.
  const umbrellaCols = [0xff6b6b, 0x4ecdc4, 0xffd23e, 0xff9ff3];
  for (let n = 0; n < 10; n += 1) {
    const x = rng.range(-280, 280);
    const z = rng.range(BEACH_Z + 8, SEA_Z - 10);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 2.4, 5),
      new THREE.MeshLambertMaterial({ color: 0xf0ead8 }),
    );
    pole.position.set(x, 1.2, z);
    group.add(pole);
    const top = new THREE.Mesh(
      new THREE.ConeGeometry(2.1, 1.1, 8),
      new THREE.MeshLambertMaterial({ color: umbrellaCols[n % umbrellaCols.length] }),
    );
    top.position.set(x, 2.8, z);
    top.castShadow = true;
    group.add(top);
  }

  // A bright billboard on the boulevard so the skyline reads at a glance.
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(14, 6, 0.8),
    new THREE.MeshLambertMaterial({ color: 0xffd23e }),
  );
  board.position.set(-120, 12, 250);
  board.rotation.y = 0.4;
  group.add(board);

  return {
    colliders,
    landmarks: {
      marina: new THREE.Vector3(252, 0, 288),
      northTower: new THREE.Vector3(0, 0, -288),
      beach: new THREE.Vector3(-252, 0, 288),
      sprayShop: new THREE.Vector3(-216, 0, -216),
      park: new THREE.Vector3(0, 0, 0),
      northTowerTop: tallest ? new THREE.Vector3(tallest.x, tallest.h, tallest.z) : new THREE.Vector3(0, 30, -200),
    },
    update(dt, time) {
      seaTex.offset.y = (time * SEA_SCROLL) % 1;
      sea.position.y = 0.15 + Math.sin(time * 0.7) * SEA_BOB;
    },
  };
}
