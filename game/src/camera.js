// The third-person camera: it trails behind the player on foot and behind the car when
// driving, eases toward its target so it never snaps, and lets the mouse drag orbit it.
// The shot stager drives it directly for screenshots.
// Yaw is a world angle: 0 looks north (-z in three.js terms is 0 here by the
// sin/cos below), and it grows clockwise seen from above.

import * as THREE from 'three';

// Mouse-drag orbit feel: radians of yaw/pitch per pixel dragged.
const ORBIT_YAW_PER_PX = 0.005;
const ORBIT_PITCH_PER_PX = 0.004;

// How close/far the camera may ever sit: shared by the setter, orbit zoom and
// setDistance, so no caller can park it inside the player's head or a block away.
const MIN_DISTANCE = 6;
const MAX_DISTANCE = 20;
// Pitch limits: never level with the ground, never straight overhead.
const PITCH_MIN = 0.08;
const PITCH_MAX = 1.1;

export function createCamera(camera) {
  let yaw = Math.PI; // world angle the camera sits behind (0 = looking north)
  let pitch = 0.32;
  let distance = 11;
  let freeOrbit = false; // when true, driving never pulls the camera behind the car
  const target = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  return {
    get yaw() { return yaw; },
    set yaw(v) { yaw = v; },
    get pitch() { return pitch; },
    set pitch(v) { pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, v)); },
    get distance() { return distance; },
    // Clamp like orbit() does, so a scripted distance can never sit inside the
    // player's head or a block away.
    set distance(v) { distance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, v)); },
    set free(v) { freeOrbit = v; },
    /** Drag deltas orbit the camera; wheel zooms. */
    orbit(dx, dy, wheel) {
      yaw -= dx * ORBIT_YAW_PER_PX;
      pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch + dy * ORBIT_PITCH_PER_PX));
      if (wheel) distance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, distance + wheel * 0.01));
    },
    /** Snap behind a heading (used when entering a car or staging a shot). */
    snapBehind(heading) {
      yaw = heading;
    },
    // Same clamp as the setter: a scripted distance obeys the same limits.
    setDistance(d) { distance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, d)); },
    update(dt, focusPos, focusHeading, driving) {
      if (driving && !freeOrbit) {
        // Driving: the camera swings behind the car's heading unless the player orbits.
        const diff = ((focusHeading - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        yaw += diff * Math.min(1, dt * 1.6);
      }
      target.copy(focusPos);
      target.y += driving ? 1.6 : 1.4;
      const dist = driving ? distance + 2.5 : distance;
      const height = Math.sin(pitch) * dist;
      const flat = Math.cos(pitch) * dist;
      desired.set(
        target.x - Math.sin(yaw) * flat,
        target.y + height,
        target.z - Math.cos(yaw) * flat,
      );
      // Keep the camera out of the ground and ease toward the desired spot.
      desired.y = Math.max(desired.y, 1.2);
      const k = 1 - Math.exp(-dt * (driving ? 7 : 10));
      camera.position.lerp(desired, k);
      camera.lookAt(target);
      camera.up.copy(up);
    },
  };
}
