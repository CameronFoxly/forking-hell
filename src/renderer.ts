import Phaser from 'phaser';
import { COLORS as C, text, WIDTH } from './pixel';
import type { Simulation } from './simulation';
import type { CharacterFrame, Clip } from './character';
import { CameraRig } from './camera';
import { MotionFringes } from './motion-fringes';
import { connectorFringe, platformFringe } from './motion-geometry';

export type ViewState = { started: boolean; reducedMotion: boolean; best: number; touch: boolean; delta: number; effectDelta?: number };
const floorY = 184;
const WORLD_WIDTH = 1008, WORLD_HEIGHT = 572;

export class WorldRenderer {
  private g: Phaser.GameObjects.Graphics;
  private hud: Phaser.GameObjects.Graphics;
  private cat: Phaser.GameObjects.Sprite;
  private enemies: Phaser.GameObjects.Image[] = [];
  private usedEnemies = 0;
  readonly composition: Phaser.GameObjects.RenderTexture;
  readonly presentation: Phaser.GameObjects.RenderTexture;
  sourceLeft = 0;
  sourceTop = 0;
  private outputScale = 1;
  private density = 1;
  readonly motion: MotionFringes;
  private burstIds = new WeakMap<object, number>();
  private nextBurstId = 0;
  cameraX = 0;
  renderedHazards = 0;
  renderedShots = 0;
  highlightedCopies = 0;
  readonly camera = new CameraRig();
  private previousGame: Simulation | null = null;
  private visibleEncounters = new Set<string>();
  private readonly enemyPixels: ImageData;
  private readonly frameBounds = new Map<string, Phaser.Geom.Rectangle>();
  animation: { clip: Clip; index: number; facing: number } = { clip: 'Idle', index: 0, facing: 1 };
  get pixelScales(): number[] { return [this.cat.scaleX, ...this.enemies.slice(0, this.usedEnemies).map(enemy => enemy.scaleX)]; }

  constructor(private readonly scene: Phaser.Scene) {
    this.motion = new MotionFringes(scene);
    this.g = new Phaser.GameObjects.Graphics(scene);
    this.cat = new Phaser.GameObjects.Sprite(scene, 64, floorY, 'octocat').setOrigin(0.5, 1);
    scene.cameras.main.setRoundPixels(false);
    this.composition = new Phaser.GameObjects.RenderTexture(scene, 0, 0, WORLD_WIDTH, WORLD_HEIGHT).setOrigin(0).setVertexRoundMode('off');
    this.composition.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.presentation = scene.add.renderTexture(0, 0, WORLD_WIDTH, WORLD_HEIGHT).setOrigin(0).setVertexRoundMode('off');
    this.presentation.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.hud = scene.add.graphics().setDepth(3);
    const image = scene.textures.get('hazards').getSourceImage();
    if (!(image instanceof HTMLImageElement)) throw new Error('Hazard artwork must be a loaded image.');
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Hazard visibility needs a 2D image reader.');
    context.drawImage(image, 0, 0);
    this.enemyPixels = context.getImageData(0, 0, canvas.width, canvas.height);
    scene.events.once('shutdown', () => {
      this.g.destroy(); this.cat.destroy(); this.composition.destroy();
      this.motion.destroy();
      for (const enemy of this.enemies) enemy.destroy();
    });
  }

  resize(scale: number, density = 1): void {
    if (scale !== this.outputScale || density !== this.density) this.motion.reset();
    this.outputScale = scale; this.density = density; this.hud.setScale(scale);
  }

  forkTargets(game: Simulation): readonly string[] {
    return game === this.previousGame ? [...this.visibleEncounters] : [];
  }

  private opaqueBounds(frame: Phaser.Textures.Frame): Phaser.Geom.Rectangle {
    const key = String(frame.name), cached = this.frameBounds.get(key);
    if (cached) return cached;
    let left = frame.width, top = frame.height, right = 0, bottom = 0;
    for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
      if (this.enemyPixels.data[((frame.cutY + y) * this.enemyPixels.width + frame.cutX + x) * 4 + 3]) {
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
      }
    }
    if (right <= left || bottom <= top) throw new Error(`Hazard frame ${key} has no visible pixels.`);
    const bounds = new Phaser.Geom.Rectangle(left, top, right - left, bottom - top);
    this.frameBounds.set(key, bounds);
    return bounds;
  }

  private recordVisible(id: string, x: number, y: number, width: number, height: number, opaque?: (x: number, y: number) => boolean): void {
    if (this.visibleEncounters.has(id)) return;
    const scale = this.presentation.scaleX;
    const left = this.presentation.x + (x - this.sourceLeft) * scale;
    const top = this.presentation.y + (y + this.sourceTop) * scale;
    const right = left + width * scale, bottom = top + height * scale;
    // Match the final nearest-neighbor physical samples, excluding opaque HUD.
    const x0 = Math.max(0, Math.ceil(left - .5)), x1 = Math.min(this.scene.game.canvas.width, Math.ceil(right - .5));
    const y0 = Math.max(34 * this.outputScale, Math.ceil(top - .5)), y1 = Math.min(this.scene.game.canvas.height, Math.ceil(bottom - .5));
    for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) {
      if (px >= 120 * this.outputScale && px < 378 * this.outputScale && py >= 237 * this.outputScale && py < 259 * this.outputScale) continue;
      if (!opaque || opaque(Math.floor((px + .5 - left) / scale), Math.floor((py + .5 - top) / scale))) {
        this.visibleEncounters.add(id);
        return;
      }
    }
  }

  private ring(x: number, y: number, color: number, radius = 4): void {
    const g = this.g;
    g.lineStyle(2, color).strokeRect(Math.round(x - radius), Math.round(y - radius), radius * 2, radius * 2);
    g.fillStyle(color).fillRect(Math.round(x - radius - 4), Math.round(y - 1), 4, 2).fillRect(Math.round(x + radius), Math.round(y - 1), 4, 2);
  }

  draw(game: Simulation, view: ViewState, frame: CharacterFrame, clip: Clip, index: number): void {
    let g = this.g.clear();
    this.usedEnemies = 0;
    this.visibleEncounters.clear();
    if (game !== this.previousGame) { this.camera.reset(game.config.camera); this.motion.reset(); this.previousGame = game; }
    this.camera.update(game.paused || game.gameOver ? 0 : view.delta, {
      x: game.player.x, ground: game.playerWorldY - game.player.y,
      axis: game.axis, depth: game.depth, physicalDepth: game.currentDepth,
    }, game.config.camera);
    const effects = game.config.effects;
    const LANE = game.lane, UNIT = game.unit;
    const minimumZoom = Math.min(this.camera.zoom, game.config.camera.minZoom);
    const width = Math.ceil((480 / minimumZoom + 8) / 2) * 2;
    const height = Math.ceil((270 / minimumZoom + 8) / 2) * 2;
    if (width > this.composition.width || height > this.composition.height) {
      this.composition.resize(width, height);
      this.presentation.resize(width, height);
    }
    const worldWidth = this.composition.width, worldHeight = this.composition.height;
    const shake = !view.reducedMotion && game.shakeAge < effects.shakeDuration ? Math.round(Math.sin(game.shakeAge * effects.shakeFrequency) * effects.shakeAmount) : 0;
    this.cameraX = Math.floor(this.camera.left);
    this.sourceLeft = this.cameraX - 4;
    this.sourceTop = Math.ceil(this.camera.top) + 4;
    this.motion.begin({
      seconds: view.effectDelta ?? view.delta, zoom: this.camera.zoom, cssWorldPixel: this.camera.zoom * this.outputScale / this.density,
      mobile: view.touch || this.scene.game.canvas.width / this.density < 700,
      active: view.started && !game.paused && !game.gameOver && !view.reducedMotion,
      viewport: `${this.scene.game.canvas.width}:${this.scene.game.canvas.height}:${this.density}`, poseTime: game.realTime,
    }, game.config.motion, this.sourceLeft, this.sourceTop);
    this.composition.camera.setScroll(this.sourceLeft, -this.sourceTop);
    this.presentation.setScale(this.camera.zoom * this.outputScale).setPosition(
      Math.round(this.camera.originX * this.outputScale) + (this.sourceLeft + shake) * this.camera.zoom * this.outputScale,
      Math.round(this.camera.originY * this.outputScale) - this.sourceTop * this.camera.zoom * this.outputScale,
    );
    const right = Math.ceil(this.camera.right);
    const screenY = (worldY: number): number => -Math.round(worldY);
    const screenX = (x: number): number => Math.round(x);
    const lowest = Math.max(0, Math.floor((this.camera.bottom - 35) / LANE));
    const highest = Math.min(game.depth, Math.ceil((this.camera.top + 45) / LANE));
    const depths = new Set<number>([game.currentDepth]);
    for (let depth = lowest; depth <= highest; depth++) depths.add(depth);
    g.fillStyle(C.ink).fillRect(this.sourceLeft, -this.sourceTop, worldWidth, worldHeight);
    for (let x = Math.floor(this.sourceLeft / 48) * 48; x < this.sourceLeft + worldWidth; x += 48) {
      for (let y = Math.floor(-this.sourceTop / 32) * 32; y < -this.sourceTop + worldHeight; y += 32) g.fillStyle(C.deep).fillRect(x, y, 1, 1);
    }
    for (let i = 0; i < 8; i++) {
      const x = this.sourceLeft + ((i * 157 - Math.floor(this.cameraX / 8)) % worldWidth + worldWidth) % worldWidth;
      const y = -this.sourceTop + 180 + ((i * 51) % 150);
      g.lineStyle(1, C.deep).lineBetween(x, y, x + 45, y).lineBetween(x + 45, y, x + 65, y - 20);
      g.fillStyle(C.shadow).fillRect(x + 64, y - 21, 3, 3);
    }

    const hazards = game.nearby(this.cameraX - 45, right + 45);
    const staged = game.stagedLineages();
    this.renderedHazards = 0;
    this.highlightedCopies = 0;
    for (const depth of [...depths].sort((a, b) => a - b)) {
      const branch = game.branches[depth]!;
      const active = depth === game.currentDepth;
      const color = active ? C.cyan : C.muted;
      const start = Math.max(this.cameraX - 10, screenX(branch.forkX + (depth > 0 ? UNIT : 0)));
      if (depth > 0) {
        const x = screenX(branch.forkX);
        const baseY = screenY(game.surfaceAt(depth, branch.forkX).height);
        for (let px = Math.max(x, this.cameraX - 1); px < Math.min(x + UNIT, right + 1); px++) {
          const top = screenY(game.surfaceAt(depth, px).height);
          const next = screenY(game.surfaceAt(depth, px + 1).height);
          g.fillStyle(C.shadow).fillRect(px, Math.min(top, next), 1, Math.abs(top - next) + 7);
          g.fillStyle(C.cyan).fillRect(px, Math.min(top, next), 1, Math.abs(top - next) + 2);
        }
        // A two-row bright band is centered one pixel below its support edge.
        this.ring(x, baseY + 1, C.cyan, 3);
        connectorFringe(this.motion, branch.id, {
          ax: branch.forkX, ay: game.surfaceAt(depth, branch.forkX).height,
          bx: branch.forkX + UNIT, by: game.surfaceAt(depth, branch.forkX + UNIT).height, color: C.cyan,
        });
      }
      const origin = Math.max(0, branch.forkX + (depth ? UNIT : 0));
      const cuts = new Set([origin, Infinity]);
      const nextFork = game.branches[depth + 1];
      if (nextFork && nextFork.forkX > origin) cuts.add(nextFork.forkX);
      if (game.transition && depth === game.depth) for (const parent of game.branches.slice(1, depth)) {
        if (parent.forkX > origin) cuts.add(parent.forkX);
        if (parent.forkX + UNIT > origin) cuts.add(parent.forkX + UNIT);
      }
      const boundaries = [...cuts].sort((a, b) => a - b);
      for (let i = 0; i < boundaries.length - 1; i++) {
        const anchor = boundaries[i]!, end = boundaries[i + 1]!;
        const a = Math.max(start, anchor), b = Math.min(right + 10, end);
        if (b <= a) continue;
        const pathColor = game.surfaceAt(game.depth, (a + b) / 2).depth === depth ? C.cyan : C.muted;
        const ay = game.surfaceAt(depth, a).height, by = game.surfaceAt(depth, b).height;
        if (Math.abs(ay - by) < 1e-9) {
          const y = screenY(ay);
          g.fillStyle(C.shadow).fillRect(Math.round(a), y + 2, Math.round(b) - Math.round(a), 5);
          g.fillStyle(pathColor).fillRect(Math.round(a), y, Math.round(b) - Math.round(a), 2);
          platformFringe(this.motion, `${branch.id}:${anchor}`, {
            left: Math.round(a), right: Math.round(b), anchorX: anchor, supportY: ay, color: pathColor,
          });
        } else {
          for (let px = Math.round(a); px < Math.round(b); px++) {
            const y = screenY(game.surfaceAt(depth, px).height), next = screenY(game.surfaceAt(depth, px + 1).height);
            g.fillStyle(C.shadow).fillRect(px, Math.min(y, next), 1, Math.abs(next - y) + 7);
            g.fillStyle(pathColor).fillRect(px, Math.min(y, next), 1, Math.abs(next - y) + 2);
          }
          connectorFringe(this.motion, `platform:${branch.id}:${anchor}`, {
            ax: anchor, ay: game.surfaceAt(depth, anchor).height,
            bx: end, by: game.surfaceAt(depth, end).height, color: pathColor,
          });
        }
      }
      for (let x = Math.ceil(start / 48) * 48; x < right; x += 48) {
        const y = screenY(game.surfaceAt(depth, x).height);
        g.fillStyle(C.ink).fillRect(screenX(x) - 2, y - 1, 5, 4);
        g.fillStyle(color).fillRect(screenX(x) - 1, y, 3, 2);
        g.fillStyle(C.shadow).fillRect(screenX(x), y + 9, 1, 5);
      }
      for (const hazard of hazards) {
        if (hazard.x < branch.forkX || game.isConverted(depth, hazard.id)) continue;
        const pose = game.pose(hazard);
        const stagedDepth = staged.get(hazard.id);
        const activated = stagedDepth !== undefined && depth <= stagedDepth;
        this.renderedHazards++;
        if (game.isOrdinaryActive(depth, hazard)) {
          const normalFrame = hazard.kind === 'patrol' ? `patrol-${Math.sin(pose.angle) > 0 ? 1 : 0}` :
            hazard.kind === 'spinner' ? `spinner-${((Math.floor(pose.angle / (Math.PI / 8)) % 16) + 16) % 16}` :
            hazard.kind === 'gate' ? (pose.active ? 'gate-up' : 'gate-down') : 'shooter';
          const frame = `${activated ? 'activated-' : ''}${normalFrame}`;
          let enemy = this.enemies[this.usedEnemies];
          if (!enemy) {
            enemy = new Phaser.GameObjects.Image(this.scene, 0, 0, 'hazards', frame).setOrigin(0.5, 1);
            this.enemies.push(enemy);
          }
          this.usedEnemies++;
          const worldY = game.surfaceAt(depth, pose.x).height + pose.y - (hazard.kind === 'spinner' ? 8 : 0);
          enemy.setFrame(frame).setPosition(screenX(pose.x), screenY(worldY)).setVisible(true).setAlpha(active ? 1 : effects.inactiveOpacity);
          if (enemy.alpha > 0) {
            const bounds = this.opaqueBounds(enemy.frame);
            this.recordVisible(hazard.id, enemy.x - enemy.width / 2 + bounds.x, enemy.y - enemy.height + bounds.y, bounds.width, bounds.height,
              (x, y) => this.enemyPixels.data[((enemy.frame.cutY + bounds.y + y) * this.enemyPixels.width + enemy.frame.cutX + bounds.x + x) * 4 + 3]! > 0);
          }
          this.motion.sprite(`enemy:${branch.id}:${hazard.id}`, enemy, pose.x, worldY);
        }
        if (activated) {
          this.highlightedCopies++;
          const switchOnly = !game.isOrdinaryActive(depth, hazard);
          const sx = screenX(switchOnly ? hazard.x : pose.x);
          const y = screenY(game.surfaceAt(depth, switchOnly ? hazard.x : pose.x).height), sy = y - 15;
          const pulse = view.reducedMotion ? 1 : .75 + .25 * Math.sin(game.realTime * 5);
          const alpha = effects.highlightStrength * pulse;
          g.fillStyle(C.cyan, alpha * .2).fillRect(sx - 16, y - 30, 32, 32);
          g.fillStyle(C.cyan, alpha).fillRect(sx - 17, y - 31, 5, 2).fillRect(sx + 12, y - 31, 5, 2)
            .fillRect(sx - 17, y + 1, 5, 2).fillRect(sx + 12, y + 1, 5, 2);
          if (depth > 0) {
            const lower = screenY(game.surfaceAt(depth - 1, pose.x).height) - 15;
            for (let py = sy; py < lower; py++) {
              const px = Math.round(sx + (pose.x - sx) * (py - sy) / (lower - sy));
              g.fillStyle(C.cyan, alpha * .2).fillRect(px - 2, py, 5, 1);
              if ((py - sy) % 6 < 3) g.fillStyle(C.cyan, alpha).fillRect(px, py, 1, 1);
            }
          }
        }
        if (game.isSwitch(depth, hazard.id)) {
          const sx = screenX(hazard.x);
          const sy = screenY(game.surfaceAt(depth, hazard.x).height) - 15;
          const staged = branch.staged.has(hazard.id);
          if (staged) {
            const length = Math.max(0, screenY(game.surfaceAt(depth - 1, hazard.x).height) - 15 - sy - 7);
            for (let lineY = sy + 7; lineY < sy + 7 + length; lineY += 7) g.fillStyle(C.muted).fillRect(sx, lineY, 1, 3);
            if (length > 0) {
              const pulse = ((game.time * 22) % length + length) % length;
              g.fillStyle(C.cyan).fillRect(sx - 1, sy + 7 + Math.round(pulse), 3, 3);
            }
          }
          this.ring(sx, sy, staged ? C.cyan : C.gold, 5);
          for (const [x, y, w, h] of [[-6, -6, 2, 12], [4, -6, 2, 12], [-4, -6, 8, 2], [-4, 4, 8, 2], [-9, -1, 4, 2], [5, -1, 4, 2]]) {
            this.recordVisible(hazard.id, sx + x!, sy + y!, w!, h!);
          }
          this.motion.rect(`switch:${branch.id}:${hazard.id}`, hazard.x, game.surfaceAt(depth, hazard.x).height + 15, 10, 10, staged ? C.cyan : C.gold);
          if (staged) g.fillStyle(C.cyan).fillRect(sx - 2, sy - 2, 4, 4);
          else g.fillStyle(C.ink).fillRect(sx - 2, sy - 2, 4, 4);
        }
      }
    }

    const visibleBranches = new Map([...depths].map(depth => [game.branches[depth]!.id, depth]));
    for (const coin of game.coinsNear(this.cameraX - 20, right + 20)) {
      if (coin.collected) continue;
      const depth = visibleBranches.get(coin.branchId);
      if (depth === undefined) continue;
      const x = screenX(coin.x);
      const y = screenY(game.surfaceAt(depth, coin.x).height + game.coinY(coin));
      g.fillStyle(C.gold).fillRect(x - 3, y - 4, 6, 8).fillRect(x - 4, y - 2, 8, 4);
      g.fillStyle(C.ink).fillRect(x, y - 2, 1, 4);
      if (Math.abs(coin.vx) < 2 && coin.vy === 0) {
        const shimmer = view.reducedMotion ? .15 : Math.max(0, Math.sin(game.realTime * 3 + coin.bornAt * 7)) ** 8;
        g.fillStyle(C.white, shimmer * game.config.coins.shimmer).fillRect(x - 2, y - 3, 1, 3);
      }
      this.motion.rect(`coin:${coin.id}`, coin.x, game.surfaceAt(depth, coin.x).height + game.coinY(coin), 8, 8, C.gold);
    }
    this.renderedShots = 0;
    for (const shot of game.shotsNear(this.cameraX - 10, right + 10, this.camera.bottom - 10, this.camera.top + 10)) {
      const pos = game.shotPose(shot);
      if (!pos) continue;
      const x = screenX(pos.x), y = screenY(pos.y);
      if (x < this.cameraX - 6 || x > right + 6 || pos.y < this.camera.bottom - 6 || pos.y > this.camera.top + 6) continue;
      this.renderedShots++;
      g.fillStyle(C.danger).fillRect(x - 2, y - 2, 5, 5);
      g.fillStyle(C.gold).fillRect(x, y, 1, 1);
      g.fillStyle(C.muted).fillRect(Math.round(x - shot.vx * 0.04), Math.round(y + shot.vy * 0.04), 2, 2);
      this.motion.rect(`shot:${shot.id}`, pos.x, pos.y, 5, 5, C.danger);
    }
    for (const burst of game.bursts) {
      const depth = visibleBranches.get(burst.branchId);
      if (depth === undefined) continue;
      const x = screenX(burst.x), y = screenY(game.surfaceAt(depth, burst.x).height + 12);
      const color = burst.kind === 'hit' ? C.danger : burst.kind === 'coin' ? C.gold : C.cyan;
      if (burst.age > effects.particleLife) continue;
      if (!this.burstIds.has(burst)) this.burstIds.set(burst, this.nextBurstId++);
      for (let i = 0; i < effects.particles; i++) {
        const angle = i * 2.399;
        const radius = burst.age * (25 + i * 4) * effects.particleSpread * (view.reducedMotion ? .35 : 1);
        g.fillStyle(color).fillRect(Math.round(x + Math.cos(angle) * radius), Math.round(y + Math.sin(angle) * radius + burst.age * burst.age * 50), 2, 2);
        this.motion.rect(`burst:${this.burstIds.get(burst)}:${i}`, burst.x + Math.cos(angle) * radius + 1,
          game.surfaceAt(depth, burst.x).height + 11 - Math.sin(angle) * radius - burst.age * burst.age * 50, 2, 2, color);
      }
    }
    if (!view.reducedMotion) for (const particle of game.jumpParticles) {
      if (!game.jumpEffectEnabled(particle.kind)) continue;
      const pose = game.jumpParticlePose(particle);
      if (pose.x < this.cameraX - 8 || pose.x > right + 8 || pose.y < this.camera.bottom - 8 || pose.y > this.camera.top + 8) continue;
      const color = particle.kind === 'second' ? C.cyan : particle.kind === 'first' ? C.pale : C.violet;
      g.fillStyle(color, pose.alpha * (particle.kind === 'trail' ? .65 : .85))
        .fillRect(screenX(pose.x) - Math.floor(pose.size / 2), screenY(pose.y) - Math.floor(pose.size / 2), pose.size, pose.size);
      this.motion.rect(`jump-particle:${particle.id}`, pose.x, pose.y, pose.size, pose.size, color);
    }
    for (let i = this.usedEnemies; i < this.enemies.length; i++) this.enemies[i]!.setVisible(false);
    g = this.hud.clear();
    this.animation = { clip, index, facing: game.player.facing };
    this.cat.setFrame(frame.key).setPosition(screenX(game.player.x), screenY(game.playerWorldY)).setFlipX(game.player.facing < 0);
    this.cat.setVisible(view.reducedMotion || game.player.invulnerable <= 0 || Math.floor(game.realTime * 8) % 2 === 0);
    this.motion.sprite('player', this.cat, game.player.x, game.playerWorldY);
    this.composition.clear().draw([this.g, ...this.enemies.slice(0, this.usedEnemies), ...(this.cat.visible ? [this.cat] : [])]);
    this.composition.render();
    this.presentation.clear().draw(this.composition);
    this.motion.draw(this.presentation);
    this.presentation.render();
    if (view.started) {
      for (const depth of depths) {
        const y = Math.round(this.camera.y(depth * LANE)) + 10;
        if (y > 76 && y < 230) text(g, depth ? `FORK ${depth}` : 'MAIN', 12, y, depth === game.currentDepth ? C.cyan : C.muted);
      }
      g.fillStyle(C.ink).fillRect(0, 0, WIDTH, 34);
      text(g, 'LIFE', 12, 12, C.muted);
      for (let i = 0; i < 3; i++) {
        const x = 40 + i * 13;
        const color = i < game.player.health ? C.danger : C.shadow;
        g.fillStyle(color).fillRect(x, 12, 3, 5).fillRect(x + 4, 12, 3, 5).fillRect(x + 1, 14, 5, 5).fillRect(x + 2, 19, 3, 1).fillRect(x + 3, 20, 1, 1);
      }
      text(g, 'SCORE', 100, 12, C.muted);
      text(g, String(game.score).padStart(6, '0'), 137, 12, C.white);
      text(g, game.depth ? `FORK ${game.depth}` : 'MAIN', 237, 12, C.violet);
      text(g, `${game.top.staged.size} STAGED`, 330, 12, C.cyan);
      g.fillStyle(C.shadow).fillRect(12, 29, WIDTH - 24, 1);
      if (!game.gameOver) {
        const [heading, detail] = hint(game, view.touch);
        text(g, heading, 14, 44, C.white);
        text(g, detail, 14, 58, C.pale);
      }
      g.fillStyle(C.ink).fillRect(120, 237, 258, 22);
      const mode = game.paused ? 'PAUSED' : game.direction > 0 ? '> TIME FORWARD' : game.direction < 0 ? '< TIME REVERSED' : '= TIME HELD';
      text(g, mode, 162, 241, game.direction < 0 ? C.violet : C.cyan);
    } else {
      text(g, 'FORKING', 28, 36, C.white, 4);
      text(g, 'HELL', 28, 76, C.cyan, 4);
      text(g, 'FORK THE PATH.', 262, 44, C.pale);
      text(g, 'STAGE YOUR ESCAPE.', 262, 59, C.pale);
      text(g, 'MERGE THE CHAOS.', 262, 74, C.pale);
      text(g, 'ANY KEY TO START. TAB FOR MENUS.', 28, 122, C.violet);
      if (view.best) text(g, `PERSONAL BEST ${view.best}`, 262, 103, C.gold);
    }
  }
}

export function hint(game: Simulation, touch = false): [string, string] {
  const t = game.tutorial;
  if (!t.moved) return ['THE WORLD WAITS FOR YOU', touch ? 'HOLD RIGHT TO MOVE. RELEASE. HOLD LEFT TO REVERSE.' : 'A / D OR ARROWS: MOVE RIGHT. STOP. REVERSE LEFT.'];
  if (!t.jumped) return ['JUMP, THEN JUMP AGAIN', touch ? 'HOLD JUMP HIGHER. RELEASE AND TAP AGAIN IN AIR.' : 'HOLD SPACE HIGHER. RELEASE AND PRESS AGAIN IN AIR.'];
  if (!t.branched) return ['MAKE A DIFFERENT PATH', touch ? 'TAP FORK. VISIBLE ENEMIES BECOME SWITCHES.' : 'W / UP: FORK. VISIBLE ENEMIES BECOME SWITCHES.'];
  if (!t.staged) return ['STAGE YOUR ESCAPE', 'TOUCH A GOLD COMMIT RING. WATCH FOR SHOTS BELOW.'];
  if (!t.merged) return ['BRING IT HOME', touch ? 'TAP MERGE. STAGED DANGER BECOMES COINS BELOW.' : 'S / DOWN: MERGE ONE LEVEL. STAGED DANGER BECOMES COINS.'];
  if (!t.collected) return ['GO BACK FOR WHAT YOU MADE', 'REVERSE LEFT TO COLLECT. YOUR REWARDS STAY YOURS.'];
  return ['NEW ENEMIES. NEW FORKS.', 'NEW DANGER AHEAD? FORK AGAIN. STAGE. MERGE.'];
}
