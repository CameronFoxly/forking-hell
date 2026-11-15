import Phaser from 'phaser';
import { COLORS as C, HEIGHT, text, WIDTH } from './pixel';
import { hazardPose, LANE, shotPosition, UNIT } from './simulation';
import type { Simulation } from './simulation';
import type { CharacterFrame, Clip } from './character';
import { CameraRig } from './camera';

export type ViewState = { started: boolean; reducedMotion: boolean; best: number; touch: boolean; delta: number };
const floorY = 184;

export class WorldRenderer {
  private g: Phaser.GameObjects.Graphics;
  private hud: Phaser.GameObjects.Graphics;
  private cat: Phaser.GameObjects.Sprite;
  private enemies: Phaser.GameObjects.Image[] = [];
  private usedEnemies = 0;
  cameraX = 0;
  renderedHazards = 0;
  renderedShots = 0;
  readonly camera = new CameraRig();
  private previousGame: Simulation | null = null;
  animation: { clip: Clip; index: number; facing: number } = { clip: 'Idle', index: 0, facing: 1 };
  get pixelScales(): number[] { return [this.cat.scaleX, ...this.enemies.slice(0, this.usedEnemies).map(enemy => enemy.scaleX)]; }

  constructor(private readonly scene: Phaser.Scene) {
    this.g = scene.add.graphics();
    this.cat = scene.add.sprite(64, floorY, 'octocat').setOrigin(0.5, 1).setDepth(2);
    this.hud = scene.add.graphics().setDepth(3);
  }

  private ring(x: number, y: number, color: number, radius = 4): void {
    const g = this.g;
    g.lineStyle(2, color).strokeRect(Math.round(x - radius), Math.round(y - radius), radius * 2, radius * 2);
    g.fillStyle(color).fillRect(Math.round(x - radius - 4), Math.round(y - 1), 4, 2).fillRect(Math.round(x + radius), Math.round(y - 1), 4, 2);
  }

  draw(game: Simulation, view: ViewState, frame: CharacterFrame, clip: Clip, index: number): void {
    let g = this.g.clear();
    this.usedEnemies = 0;
    if (game !== this.previousGame) { this.camera.reset(); this.previousGame = game; }
    this.camera.update(game.paused || game.gameOver ? 0 : view.delta, {
      x: game.player.x, ground: game.playerWorldY - game.player.y,
      axis: game.axis, depth: game.depth, physicalDepth: game.currentDepth,
    });
    const hit = game.bursts.find(b => b.kind === 'hit');
    const shake = !view.reducedMotion && hit && hit.age < 0.2 ? Math.round(Math.sin(hit.age * 120) * 2) : 0;
    this.cameraX = Math.floor(this.camera.left);
    const right = Math.ceil(this.camera.right);
    const screenY = (worldY: number): number => -Math.round(worldY);
    const screenX = (x: number): number => Math.round(x);
    const lowest = Math.max(0, Math.floor((this.camera.bottom - 35) / LANE));
    const highest = Math.min(game.depth, Math.ceil((this.camera.top + 45) / LANE));
    const depths = new Set<number>([game.currentDepth]);
    for (let depth = lowest; depth <= highest; depth++) depths.add(depth);
    g.fillStyle(C.ink).fillRect(0, 0, WIDTH, HEIGHT);
    for (let x = -((Math.floor(this.cameraX / 3)) % 48); x < WIDTH; x += 48) {
      for (let y = 18; y < HEIGHT; y += 32) g.fillStyle(C.shadow).fillRect(x, y, 1, 1);
    }
    for (let i = 0; i < 8; i++) {
      const x = ((i * 97 - Math.floor(this.cameraX / 8)) % 580 + 580) % 580 - 50;
      const y = 110 + ((i * 31) % 90);
      g.lineStyle(1, C.deep).lineBetween(x, y, x + 45, y).lineBetween(x + 45, y, x + 65, y - 20);
      g.fillStyle(C.shadow).fillRect(x + 64, y - 21, 3, 3);
    }

    g.save().translateCanvas(this.camera.originX + shake, this.camera.originY).scaleCanvas(this.camera.zoom, this.camera.zoom);
    const hazards = game.nearby(this.cameraX - 45, right + 45);
    this.renderedHazards = 0;
    for (const depth of [...depths].sort((a, b) => a - b)) {
      const branch = game.branches[depth]!;
      const active = depth === game.currentDepth;
      const y = screenY(depth * LANE);
      const color = active ? C.cyan : C.muted;
      const start = Math.max(this.cameraX - 10, screenX(branch.forkX + (depth > 0 ? UNIT : 0)));
      if (depth > 0) {
        const x = screenX(branch.forkX);
        const baseY = screenY(branch.forkBase);
        for (let px = Math.max(x, this.cameraX - 1); px <= Math.min(x + UNIT, right + 1); px++) {
          const top = Math.round(baseY + (y - baseY) * ((px - x) / UNIT));
          const next = Math.round(baseY + (y - baseY) * ((px + 1 - x) / UNIT));
          g.fillStyle(C.shadow).fillRect(px, Math.min(top, next), 1, Math.abs(top - next) + 7);
          g.fillStyle(C.cyan).fillRect(px, Math.min(top, next), 2, Math.abs(top - next) + 2);
        }
        this.ring(x, baseY, C.cyan, 3);
      }
      const nextFork = game.branches[depth + 1];
      const segments = nextFork ? [[start, Math.min(right + 10, nextFork.forkX)], [Math.max(start, nextFork.forkX + UNIT), right + 10]] : [[start, right + 10]];
      for (const [a, b] of segments) if (a !== undefined && b !== undefined && b > a) {
        const pathColor = game.surfaceAt(game.depth, (a + b) / 2).depth === depth ? C.cyan : C.muted;
        g.fillStyle(C.shadow).fillRect(a, y + 2, b - a, 5);
        g.fillStyle(pathColor).fillRect(a, y, b - a, 2);
      }
      for (let x = Math.ceil(start / 48) * 48; x < right; x += 48) {
        if (nextFork && x >= nextFork.forkX && x < nextFork.forkX + UNIT) continue;
        g.fillStyle(C.ink).fillRect(screenX(x) - 2, y - 1, 5, 4);
        g.fillStyle(color).fillRect(screenX(x) - 1, y, 3, 2);
        g.fillStyle(C.shadow).fillRect(screenX(x), y + 9, 1, 5);
      }
      for (const hazard of hazards) {
        if (hazard.x < branch.forkX || game.isConverted(depth, hazard.id)) continue;
        const pose = hazardPose(hazard, game.time);
        const y = screenY(game.surfaceAt(depth, pose.x).height);
        this.renderedHazards++;
        if (game.isOrdinaryActive(depth, hazard)) {
          const frame = hazard.kind === 'patrol' ? `patrol-${Math.sin(pose.angle) > 0 ? 1 : 0}` :
            hazard.kind === 'spinner' ? `spinner-${((Math.floor(pose.angle / (Math.PI / 8)) % 16) + 16) % 16}` :
            hazard.kind === 'gate' ? (pose.active ? 'gate-up' : 'gate-down') : 'shooter';
          let enemy = this.enemies[this.usedEnemies];
          if (!enemy) {
            enemy = this.scene.add.image(0, 0, 'hazards', frame).setOrigin(0.5, 1).setDepth(1);
            this.enemies.push(enemy);
          }
          this.usedEnemies++;
          const worldY = game.surfaceAt(depth, pose.x).height + pose.y - (hazard.kind === 'spinner' ? 8 : 0);
          enemy.setFrame(frame).setScale(this.camera.zoom).setPosition(this.camera.x(pose.x) + shake, this.camera.y(worldY)).setVisible(true).setAlpha(active ? 1 : 0.7);
        }
        if (depth === game.depth && depth > 0) {
          const sx = screenX(hazard.x);
          const sy = y - (hazard.kind === 'shooter' ? 43 : 15);
          const staged = branch.staged.has(hazard.id);
          if (staged) {
            for (let lineY = sy + 7; lineY < y + LANE - 15; lineY += 7) g.fillStyle(C.muted).fillRect(sx, lineY, 1, 3);
            const pulse = ((game.time * 22) % LANE + LANE) % LANE;
            g.fillStyle(C.cyan).fillRect(sx - 1, sy + Math.round(pulse), 3, 3);
          }
          this.ring(sx, sy, staged ? C.cyan : C.gold, 5);
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
    }
    this.renderedShots = 0;
    for (const shot of game.shotsNear(this.cameraX - 10, right + 10, this.camera.bottom - 10, this.camera.top + 10)) {
      const pos = shotPosition(shot, game.time);
      if (!pos) continue;
      const x = screenX(pos.x), y = screenY(pos.y);
      if (x < this.cameraX - 6 || x > right + 6 || pos.y < this.camera.bottom - 6 || pos.y > this.camera.top + 6) continue;
      this.renderedShots++;
      g.fillStyle(C.danger).fillRect(x - 2, y - 2, 5, 5);
      g.fillStyle(C.gold).fillRect(x, y, 1, 1);
      g.fillStyle(C.muted).fillRect(Math.round(x - shot.vx * 0.04), Math.round(y + shot.vy * 0.04), 2, 2);
    }
    for (const burst of game.bursts) {
      const depth = visibleBranches.get(burst.branchId);
      if (depth === undefined) continue;
      const x = screenX(burst.x), y = screenY(game.surfaceAt(depth, burst.x).height + 12);
      const color = burst.kind === 'hit' ? C.danger : burst.kind === 'coin' ? C.gold : C.cyan;
      for (let i = 0; i < 9; i++) {
        const angle = i * 2.399;
        const radius = burst.age * (25 + i * 4);
        g.fillStyle(color).fillRect(Math.round(x + Math.cos(angle) * radius), Math.round(y + Math.sin(angle) * radius + burst.age * burst.age * 50), 2, 2);
      }
    }
    g.restore();
    for (let i = this.usedEnemies; i < this.enemies.length; i++) this.enemies[i]!.setVisible(false);
    g = this.hud.clear();
    this.animation = { clip, index, facing: game.player.facing };
    this.cat.setFrame(frame.key).setScale(this.camera.zoom).setPosition(this.camera.x(game.player.x) + shake, this.camera.y(game.playerWorldY)).setFlipX(game.player.facing < 0);
    this.cat.setVisible(view.reducedMotion || game.player.invulnerable <= 0 || Math.floor(game.realTime * 8) % 2 === 0);
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
      text(g, 'YOU MOVE. TIME FOLLOWS.', 28, 122, C.violet);
      if (view.best) text(g, `PERSONAL BEST ${view.best}`, 262, 103, C.gold);
    }
  }
}

export function hint(game: Simulation, touch = false): [string, string] {
  const t = game.tutorial;
  if (!t.moved) return ['THE WORLD WAITS FOR YOU', touch ? 'HOLD RIGHT TO MOVE. RELEASE. HOLD LEFT TO REVERSE.' : 'A / D OR ARROWS: MOVE RIGHT. STOP. REVERSE LEFT.'];
  if (!t.jumped) return ['YOU CAN ALWAYS JUMP', touch ? 'TAP JUMP EVEN WHEN TIME IS STANDING STILL.' : 'SPACE: JUMP EVEN WHEN TIME IS STANDING STILL.'];
  if (!t.branched) return ['MAKE A DIFFERENT PATH', touch ? 'TAP FORK. ORDINARY DANGER BECOMES A SWITCH.' : 'W / UP: FORK. ORDINARY DANGER BECOMES A SWITCH.'];
  if (!t.staged) return ['STAGE YOUR ESCAPE', 'TOUCH A GOLD COMMIT RING. SHOOTERS STAY ACTIVE.'];
  if (!t.merged) return ['BRING IT HOME', touch ? 'TAP MERGE. STAGED DANGER BECOMES COINS BELOW.' : 'S / DOWN: MERGE ONE LEVEL. STAGED DANGER BECOMES COINS.'];
  if (!t.collected) return ['GO BACK FOR WHAT YOU MADE', 'REVERSE LEFT TO COLLECT. YOUR REWARDS STAY YOURS.'];
  return ['MORE BRANCHES. MORE CROSSFIRE.', 'FORK. STAGE. MERGE. HOW FAR CAN YOU TAKE IT?'];
}
