// The follow camera. It chases the player (or the player's car) with a soft
// spring, keeps the view inside the map, and converts between world and
// screen coordinates for the renderer and the mouse aim.

export function createCamera() {
  const cam = { x: 0, y: 0, zoom: 0.92, tx: 0, ty: 0 };

  cam.follow = function follow(targetX, targetY, dt) {
    cam.tx = targetX;
    cam.ty = targetY;
    // Soft spring: fast enough to feel attached, loose enough to feel smooth.
    const k = 1 - Math.exp(-6 * dt);
    cam.x += (cam.tx - cam.x) * k;
    cam.y += (cam.ty - cam.y) * k;
  };

  cam.snap = function snap(targetX, targetY) {
    cam.x = targetX;
    cam.y = targetY;
    cam.tx = targetX;
    cam.ty = targetY;
  };

  /** Clamp the view so it never shows past the map edge. */
  cam.clamp = function clamp(viewW, viewH) {
    const halfW = viewW / 2 / cam.zoom;
    const halfH = viewH / 2 / cam.zoom;
    cam.x = Math.max(halfW, Math.min(2560 - halfW, cam.x));
    cam.y = Math.max(halfH, Math.min(1920 - halfH, cam.y));
  };

  cam.worldToScreen = function worldToScreen(wx, wy, viewW, viewH) {
    return {
      x: (wx - cam.x) * cam.zoom + viewW / 2,
      y: (wy - cam.y) * cam.zoom + viewH / 2,
    };
  };

  cam.screenToWorld = function screenToWorld(sx, sy, viewW, viewH) {
    return {
      x: (sx - viewW / 2) / cam.zoom + cam.x,
      y: (sy - viewH / 2) / cam.zoom + cam.y,
    };
  };

  return cam;
}
