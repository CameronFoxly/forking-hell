import { describe, expect, it } from 'vitest';
import { CameraRig } from '../src/camera';
import { Simulation } from '../src/simulation';

describe('deadzone, look-ahead and branch framing', () => {
  it('does not pin the player or drift for idle movement inside the central deadzone', () => {
    const camera = new CameraRig();
    const initial = camera.centerX;
    for (let i = 0; i < 60; i++) camera.update(1 / 60, { x: 84, ground: 0, axis: 0, depth: 0, physicalDepth: 0 });
    expect(camera.centerX).toBe(initial);
    expect(camera.zoom).toBeLessThan(1);
  });
  it('damps edge pushes and reverses look-ahead rather than snapping screen position', () => {
    const camera = new CameraRig();
    const initial = camera.centerX;
    const target = { x: 300, ground: 0, axis: 1, depth: 0, physicalDepth: 0 };
    camera.update(1 / 60, target);
    expect(camera.centerX).toBeGreaterThan(initial);
    expect(camera.centerX).toBeLessThan(300);
    for (let i = 0; i < 120; i++) camera.update(1 / 60, target);
    const right = camera.centerX;
    target.axis = -1;
    camera.update(1 / 60, target);
    expect(Math.abs(camera.centerX - right)).toBeLessThan(5);
    for (let i = 0; i < 120; i++) camera.update(1 / 60, target);
    expect(camera.centerX).toBeLessThan(right - 50);
    expect(camera.lookAhead).toBeLessThan(0);
  });
  it('zooms out progressively without rounding away subpixel camera motion', () => {
    const camera = new CameraRig();
    let previous = camera.zoom;
    for (const depth of [1, 2, 4, 8]) {
      for (let i = 0; i < 120; i++) camera.update(1 / 60, { x: 300, ground: depth * 58, axis: 1, depth, physicalDepth: depth });
      expect(camera.zoom).toBeLessThan(previous);
      previous = camera.zoom;
      expect(camera.originX).toBeCloseTo(240 - camera.centerX * camera.zoom);
      expect(camera.originY).toBeCloseTo(135 + camera.centerY * camera.zoom);
    }
  });
  it('camera motion and zoom never advance the environmental clock', () => {
    const game = new Simulation();
    const camera = new CameraRig();
    for (let i = 0; i < 120; i++) {
      camera.update(1 / 60, { x: 200, ground: 116, axis: 1, depth: 2, physicalDepth: 2 });
      game.step();
    }
    expect(game.time).toBe(0);
    const position = [camera.centerX, camera.centerY, camera.zoom];
    camera.update(0, { x: 0, ground: 0, axis: -1, depth: 0, physicalDepth: 0 });
    expect([camera.centerX, camera.centerY, camera.zoom]).toEqual(position);
  });
});
