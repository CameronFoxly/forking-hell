import type { Tuning } from './tuning';

export type EffectView = {
  width: number; height: number; cssWidth: number; cssHeight: number;
  worldPixelPitch: number; mobile: boolean; reducedMotion: boolean; started: boolean;
};

export function monitorUniforms(config: Tuning['crt'], view: EffectView) {
  if ([view.width, view.height, view.cssWidth, view.cssHeight, view.worldPixelPitch].some(n => !Number.isFinite(n) || n <= 0)) {
    throw new Error('CRT viewport and pixel pitch must be positive finite values.');
  }
  const density = view.height / view.cssHeight;
  const optical = config.opticalEnabled ? (view.mobile ? config.opticalMobile : config.opticalDesktop) : 0;
  return {
    active: !!config.enabled && !!(config.scanlinesEnabled * config.scanlineStrength ||
      config.glowEnabled * config.glowStrength || config.curvatureEnabled * config.curvature || optical),
    resolution: [view.width, view.height], cssSize: [view.cssWidth, view.cssHeight],
    optical: view.reducedMotion ? Math.min(optical, 0.25) : optical,
    scanline: config.scanlinesEnabled ? config.scanlineStrength * (view.reducedMotion ? 0.5 : 1) : 0,
    scanPeriod: Math.max(3, Math.round(config.scanlinePeriod * density)),
    glow: config.glowEnabled ? Math.min(config.glowStrength, view.reducedMotion ? 0.08 : 0.25) : 0,
    glowRadius: Math.min(view.worldPixelPitch * config.glowRadius, density * 3),
    threshold: config.glowThreshold, curvature: config.curvatureEnabled && !view.reducedMotion ? config.curvature : 0,
    hud: config.hudStrength, splash: view.started ? 0 : 1,
  };
}

type Pose = { x: number; y: number; frame: number; time: number | undefined; fringe: Fringe };
export type MotionFrame = {
  seconds: number; zoom: number; cssWorldPixel: number; mobile: boolean;
  active: boolean; viewport: string; poseTime?: number;
};
export type Fringe = { x: number; y: number; alpha: number };
export const MAX_MOTION_OBJECTS = 512;
const ZERO: Fringe = { x: 0, y: 0, alpha: 0 };

export class MotionTracker {
  private poses = new Map<unknown, Pose>();
  private frame = 0;
  private context: MotionFrame | null = null;
  private settings: Tuning['motion'] | null = null;
  private accepted = 0;
  get size(): number { return this.poses.size; }
  reset(): void { this.poses.clear(); this.context = null; }
  forget(id: unknown): void { this.poses.delete(id); }

  begin(context: MotionFrame, settings: Tuning['motion']): void {
    const previous = this.context;
    if (!context.active || !settings.enabled || context.seconds <= 0 || context.seconds > 0.1 ||
      !Number.isFinite(context.seconds) || !Number.isFinite(context.zoom) || context.zoom <= 0 ||
      !Number.isFinite(context.cssWorldPixel) || context.cssWorldPixel <= 0 ||
      (previous && (previous.viewport !== context.viewport || Math.abs(Math.log(context.zoom / previous.zoom)) > 0.2))) this.reset();
    this.context = context; this.settings = settings; this.frame++; this.accepted = 0;
  }

  sample(id: unknown, x: number, y: number): Fringe {
    const context = this.context, settings = this.settings;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      this.forget(id); throw new Error('Motion pose must contain finite world coordinates.');
    }
    if (!context || !settings || !settings.enabled || !context.active ||
      context.seconds <= 0 || context.seconds > 0.1 || !Number.isFinite(context.seconds) ||
      !Number.isFinite(context.cssWorldPixel) || context.cssWorldPixel <= 0 ||
      !Number.isFinite(context.zoom) || context.zoom <= 0 || this.accepted++ >= MAX_MOTION_OBJECTS) return ZERO;
    const previous = this.poses.get(id);
    const pose: Pose = { x, y, frame: this.frame, time: context.poseTime, fringe: ZERO };
    this.poses.set(id, pose);
    if (!previous || previous.frame !== this.frame - 1) return ZERO;
    const dx = x - previous.x, dy = y - previous.y;
    const elapsed = context.poseTime !== undefined && previous.time !== undefined ? context.poseTime - previous.time : context.seconds;
    if (elapsed === 0 && dx === 0 && dy === 0) return pose.fringe = previous.fringe;
    if (!Number.isFinite(elapsed) || elapsed <= 0 || elapsed > 0.1) return ZERO;
    const distance = Math.hypot(dx, dy), speed = distance / elapsed;
    if (distance > 32 || speed > 1200 || distance === 0) return ZERO;
    const cap = Math.min(settings.maxWorldPixels, (context.mobile ? settings.maxMobileCss : settings.maxDesktopCss) / context.cssWorldPixel);
    const length = Math.min(cap, speed * settings.exposureMs / 1000);
    let sx = Math.round(dx / distance * length), sy = Math.round(dy / distance * length);
    while (Math.hypot(sx, sy) > cap) {
      if (Math.abs(sx) >= Math.abs(sy)) sx -= Math.sign(sx);
      else sy -= Math.sign(sy);
    }
    return pose.fringe = { x: sx, y: sy, alpha: (sx || sy) ? settings.strength * Math.min(1, speed / 90) : 0 };
  }
  end(): void { for (const [id, pose] of this.poses) if (pose.frame !== this.frame) this.poses.delete(id); }
}
