import Phaser from 'phaser';
import { MotionTracker } from './crt-math';
import type { MotionFrame } from './crt-math';
import type { Tuning } from './tuning';

const RED = 0xff0000, BLUE = 0x0080ff;

export class MotionFringes {
  readonly tracker = new MotionTracker();
  private images: Phaser.GameObjects.Image[] = [];
  private graphics: Phaser.GameObjects.Graphics;
  private used = 0;
  private rects = 0;
  private segments = 0;
  private left = 0;
  private top = 0;
  get draws(): number { return this.used + (this.rects + this.segments) * 2; }
  constructor(private readonly scene: Phaser.Scene) {
    this.graphics = new Phaser.GameObjects.Graphics(scene).setBlendMode(Phaser.BlendModes.ADD);
  }
  begin(context: MotionFrame, settings: Tuning['motion'], left: number, top: number): void {
    this.tracker.begin(context, settings);
    this.graphics.clear(); this.used = 0; this.rects = 0; this.segments = 0;
    this.left = left; this.top = top;
  }
  sprite(id: unknown, source: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image, worldX: number, worldY: number): void {
    const fringe = this.tracker.sample(id, worldX, worldY);
    if (!fringe.alpha || !source.visible || this.used >= 256) return;
    for (const direction of [-1, 1]) {
      let image = this.images[this.used];
      if (!image) {
        image = new Phaser.GameObjects.Image(this.scene, 0, 0, source.texture).setBlendMode(Phaser.BlendModes.ADD);
        this.images.push(image);
      }
      this.used++;
      image.setTexture(source.texture.key, source.frame.name).setOrigin(source.originX, source.originY)
        .setFlip(source.flipX, source.flipY).setScale(source.scaleX, source.scaleY).setRotation(source.rotation)
        .setPosition(source.x - this.left + direction * fringe.x, source.y + this.top - direction * fringe.y)
        .setTint(direction > 0 ? RED : BLUE).setAlpha(fringe.alpha * source.alpha);
    }
  }
  rect(id: unknown, worldX: number, worldY: number, width: number, height: number, color: number, pose = { x: worldX, y: worldY }): void {
    const fringe = this.tracker.sample(id, pose.x, pose.y);
    if (!fringe.alpha || this.rects >= 384) return;
    this.rects++;
    for (const direction of [-1, 1]) {
      this.graphics.fillStyle(color & (direction > 0 ? RED : BLUE), fringe.alpha).fillRect(
        Math.round(worldX) - this.left - Math.floor(width / 2) + direction * fringe.x,
        -Math.round(worldY) + this.top - Math.floor(height / 2) - direction * fringe.y, width, height);
    }
  }
  segment(startId: unknown, endId: unknown, ax: number, ay: number, bx: number, by: number, width: number, color: number): void {
    const a = this.tracker.sample(startId, ax, ay), b = this.tracker.sample(endId, bx, by);
    if ((!a.alpha && !b.alpha) || this.segments >= 64) return;
    this.segments++;
    for (const direction of [-1, 1]) {
      this.graphics.lineStyle(width, color & (direction > 0 ? RED : BLUE), Math.max(a.alpha, b.alpha)).lineBetween(
        Math.round(ax) - this.left + direction * a.x, -Math.round(ay) + this.top - direction * a.y,
        Math.round(bx) - this.left + direction * b.x, -Math.round(by) + this.top - direction * b.y);
    }
  }
  draw(target: Phaser.GameObjects.RenderTexture): void {
    this.tracker.end();
    if (this.rects || this.segments) target.draw(this.graphics);
    if (this.used) target.draw(this.images.slice(0, this.used));
  }
  reset(): void { this.tracker.reset(); this.graphics.clear(); this.used = 0; this.rects = 0; this.segments = 0; }
  destroy(): void { this.reset(); this.graphics.destroy(); for (const image of this.images) image.destroy(); }
}
