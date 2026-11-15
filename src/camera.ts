import { DEFAULTS } from './tuning';
import type { Tuning } from './tuning';

export type CameraTarget = { x: number; ground: number; axis: number; depth: number; physicalDepth: number };
const WIDTH = 480, HEIGHT = 270;

export class CameraRig {
  zoom = 0.88;
  centerX = 64 + WIDTH * 0.12 / this.zoom;
  centerY = (184 - HEIGHT / 2) / this.zoom;
  lookAhead = 0;
  get left(): number { return this.centerX - WIDTH / (2 * this.zoom); }
  get right(): number { return this.centerX + WIDTH / (2 * this.zoom); }
  get bottom(): number { return this.centerY - HEIGHT / (2 * this.zoom); }
  get top(): number { return this.centerY + HEIGHT / (2 * this.zoom); }
  get originX(): number { return WIDTH / 2 - this.centerX * this.zoom; }
  get originY(): number { return HEIGHT / 2 + this.centerY * this.zoom; }
  x(worldX: number): number { return this.originX + Math.round(worldX) * this.zoom; }
  y(worldY: number): number { return this.originY - Math.round(worldY) * this.zoom; }

  reset(settings = DEFAULTS.camera): void {
    this.zoom = settings.startZoom; this.centerX = 64 + WIDTH * 0.12 / this.zoom;
    this.centerY = (184 - HEIGHT / 2) / this.zoom; this.lookAhead = 0;
  }

  update(seconds: number, target: CameraTarget, settings: Tuning['camera'] = DEFAULTS.camera): void {
    const dt = Math.max(0, Math.min(0.1, seconds));
    const zoomTarget = Math.max(settings.minZoom, settings.startZoom / Math.sqrt(1 + target.depth * settings.depthZoom));
    this.zoom += (zoomTarget - this.zoom) * (1 - Math.exp(-settings.zoomDamping * dt));
    const ahead = target.axis * WIDTH * settings.lookAhead / this.zoom;
    this.lookAhead += (ahead - this.lookAhead) * (1 - Math.exp(-settings.lookDamping * dt));
    const focus = target.x + this.lookAhead;
    const halfDeadzone = WIDTH * settings.deadzone / this.zoom;
    let desired = this.centerX;
    if (focus > desired + halfDeadzone) desired = focus - halfDeadzone;
    else if (focus < desired - halfDeadzone) desired = focus + halfDeadzone;
    this.centerX += (desired - this.centerX) * (1 - Math.exp(-settings.followDamping * dt));
    const anchor = 184 - Math.min(target.physicalDepth, 4) * 19;
    const desiredY = target.ground + (anchor - HEIGHT / 2) / this.zoom;
    this.centerY += (desiredY - this.centerY) * (1 - Math.exp(-settings.verticalDamping * dt));
  }
}
