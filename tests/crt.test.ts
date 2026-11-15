import { describe, expect, it } from 'vitest';
import { monitorUniforms, MotionTracker, MAX_MOTION_OBJECTS } from '../src/crt-math';
import { platformFringe, connectorFringe } from '../src/motion-geometry';
import { DEFAULTS, parseTuning, tuningDocument } from '../src/tuning';
import type { MotionFrame, Fringe } from '../src/crt-math';
import type { MotionFringes } from '../src/motion-fringes';

const frame: MotionFrame = { seconds: 1 / 60, zoom: .88, cssWorldPixel: 1.76, mobile: false, active: true, viewport: '960:540:2' };
function sample(tracker: MotionTracker, x: number, y = 0, context = frame) {
  tracker.begin(context, DEFAULTS.motion);
  const value = tracker.sample('actor', x, y);
  tracker.end(); return value;
}
describe('cosmetic motion without camera coupling', () => {
  it('measures real vertical/reverse translation and retains samples between fixed ticks', () => {
    const tracker = new MotionTracker();
    sample(tracker, 0, 0, { ...frame, poseTime: 0 });
    const moving = sample(tracker, 0, 2, { ...frame, poseTime: 1 / 60 });
    expect(moving.y).toBe(1);
    expect(sample(tracker, 0, 2, { ...frame, seconds: 1 / 120, poseTime: 1 / 60 })).toEqual(moving);
    expect(sample(tracker, 0, 0, { ...frame, poseTime: 2 / 60 }).y).toBe(-1);
    expect(sample(tracker, 0, 0, { ...frame, zoom: .87, poseTime: 3 / 60 }).alpha).toBe(0);
  });
  it('bounds CSS/world fringes and clears pause, gaps, viewport changes and teleports', () => {
    const tracker = new MotionTracker();
    for (const mobile of [false, true]) for (const cssWorldPixel of [.3, 1, 4]) {
      tracker.reset(); const context = { ...frame, mobile, cssWorldPixel };
      sample(tracker, 0, 0, context);
      const fringe = sample(tracker, 3, 3, context), length = Math.hypot(fringe.x, fringe.y);
      expect(length).toBeLessThanOrEqual(DEFAULTS.motion.maxWorldPixels);
      expect(length * cssWorldPixel).toBeLessThanOrEqual(mobile ? DEFAULTS.motion.maxMobileCss : DEFAULTS.motion.maxDesktopCss);
    }
    expect(sample(tracker, 100).alpha).toBe(0);
    expect(sample(tracker, 102).alpha).toBeGreaterThan(0);
    expect(sample(tracker, 104, 0, { ...frame, active: false }).alpha).toBe(0);
    expect(sample(tracker, 106).alpha).toBe(0);
    expect(sample(tracker, 108, 0, { ...frame, seconds: .2 }).alpha).toBe(0);
    expect(sample(tracker, 110, 0, { ...frame, viewport: 'new' }).alpha).toBe(0);
    tracker.begin(frame, DEFAULTS.motion);
    for (let n = 0; n < 1000; n++) tracker.sample(n, n, 0);
    tracker.end(); expect(tracker.size).toBe(MAX_MOTION_OBJECTS);
  });
  it('uses independent actual endpoints and stable platform anchors under viewport clipping', () => {
    const tracker = new MotionTracker(), values: Fringe[] = [];
    const sink: Pick<MotionFringes, 'rect' | 'segment'> = {
      rect: (id, x, y, _w, _h, _color, pose = { x, y }) => { values.push(tracker.sample(id, pose.x, pose.y)); },
      segment: (a, b, ax, ay, bx, by) => { values.push(tracker.sample(a, ax, ay), tracker.sample(b, bx, by)); },
    };
    for (const step of [0, 1]) {
      tracker.begin(frame, DEFAULTS.motion); values.length = 0;
      platformFringe(sink, 1, { left: step * 50, right: 200 + step * 50, supportY: 0, anchorX: 24, color: 0xffffff });
      connectorFringe(sink, 1, { ax: 0, ay: 0, bx: 24, by: step * 2, color: 0xffffff });
      tracker.end();
    }
    expect(values[0]!.alpha).toBe(0); expect(values[1]!.alpha).toBe(0); expect(values[2]!.y).toBe(1);
  });
});
describe('static monitor treatment', () => {
  const view = { width: 1920, height: 1080, cssWidth: 960, cssHeight: 540, worldPixelPitch: 3.52, mobile: false, reducedMotion: false, started: true };
  it('retains CSS-space optics and integer scanline periods at multiple densities', () => {
    const a = monitorUniforms(DEFAULTS.crt, view);
    const b = monitorUniforms(DEFAULTS.crt, { ...view, width: 2880, height: 1620 });
    expect(a.optical).toBe(b.optical); expect(a.scanPeriod / 2).toBe(b.scanPeriod / 3);
    expect(monitorUniforms(DEFAULTS.crt, { ...view, mobile: true }).optical).toBe(DEFAULTS.crt.opticalMobile);
    expect(() => monitorUniforms(DEFAULTS.crt, { ...view, cssWidth: 0 })).toThrow();
  });
  it('honors separate disable and reduced-effects paths', () => {
    const reduced = monitorUniforms(DEFAULTS.crt, { ...view, reducedMotion: true });
    expect(reduced.curvature).toBe(0); expect(reduced.glow).toBeLessThanOrEqual(.08);
    expect(reduced.scanline).toBe(DEFAULTS.crt.scanlineStrength / 2);
    expect(monitorUniforms({ ...DEFAULTS.crt, enabled: 0 }, view).active).toBe(false);
    expect(monitorUniforms({ ...DEFAULTS.crt, opticalEnabled: 0 }, view).optical).toBe(0);
  });
  it('passes strong normal settings through unchanged, including beyond the former hidden glow caps', () => {
    const crt = {
      ...DEFAULTS.crt, opticalDesktop: 18, opticalMobile: 12, scanlineStrength: .85, scanlinePeriod: 24,
      glowStrength: 2, glowRadius: 16, glowThreshold: 0, curvature: .25, hudStrength: 1,
    };
    expect(parseTuning(tuningDocument({ ...DEFAULTS, crt })).crt).toEqual(crt);
    for (const mobile of [false, true]) {
      const u = monitorUniforms(crt, { ...view, mobile });
      expect(u.optical).toBe(mobile ? 12 : 18); expect(u.scanline).toBe(.85);
      expect(u.scanPeriod).toBe(48); expect(u.glow).toBe(2); expect(u.glowRadius).toBe(16 * view.worldPixelPitch);
      expect(u.curvature).toBe(.25); expect(u.hud).toBe(1);
    }
    const reduced = monitorUniforms(crt, { ...view, reducedMotion: true });
    expect(reduced.optical).toBe(.25); expect(reduced.scanline).toBe(.125);
    expect(reduced.glow).toBe(.08); expect(reduced.glowRadius).toBe(6); expect(reduced.curvature).toBe(0);
    expect(monitorUniforms({ ...crt, glowThreshold: 1 }, view).glow).toBe(0);
  });
});
