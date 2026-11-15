import Phaser from 'phaser';
import { parseCharacterAtlas } from '../src/character';
import { applyPixelComposition } from '../src/pixel';
import { WorldRenderer } from '../src/renderer';
import { Simulation, STEP } from '../src/simulation';
import { firstShooter, SHOOTER_SEED } from './encounter-fixtures';
import { attachCrt } from '../src/crt';
import type { Tuning } from '../src/tuning';

type ProbeResult = { native: string; filtered: string; screen: string; left: number; top: number; x: number; y: number; pitch: number; filter: number[] };
type JunctionResult = { image: string; left: number; top: number; forks: { x: number; y: number; end: number }[]; supports: number[]; depth: number; danger: boolean; converted: boolean };
declare global { interface Window {
  renderProbe: (zoom: number, pan: number, scale: number) => Promise<ProbeResult>;
  junctionProbe: (staged: boolean, merges: number, pan: number) => Promise<JunctionResult>;
  tweenProbe: (kind: 'branch' | 'merge', progress: number, nested: boolean | 'backtracked', zoom: number) => Promise<{ image: string; left: number; top: number; points: number[][]; end: number[]; foot: number[]; worldY: number }>;
  effectProbe: (enabled: boolean, config?: Partial<Tuning['crt']>, started?: boolean, mobile?: boolean) => Promise<string>;
  muzzleProbe: (kind: 'branch' | 'merge') => Promise<{ image: string; left: number; top: number; points: { x: number; y: number }[] }>;
  shakeProbe: () => Promise<{ before: number; midair: number; landed: number; pulse: number; paused: number; reduced: number; expired: number; restarted: number; motion: number; time: number }>;
} }
class Probe extends Phaser.Scene {
  preload(): void {
    this.load.image('octocat', '/assets/octocat.png');
    this.load.json('octocat-atlas', '/assets/octocat.json');
    this.load.atlas('hazards', '/assets/hazards.png', '/assets/hazards.json');
  }
  create(): void {
    const atlas = parseCharacterAtlas(this.cache.json.get('octocat-atlas'), 130, 135);
    for (const frames of Object.values(atlas)) for (const f of frames) this.textures.get('octocat').add(f.key, 0, f.x, f.y, f.w, f.h);
    let simulation = new Simulation();
    simulation.player.x = 160;
    simulation.paused = true;
    const world = new WorldRenderer(this);
    const palette = applyPixelComposition(this, world.composition);
    const crt = attachCrt(this);
    const frame = atlas.Idle[0]!;
    const draw = (): void => world.draw(simulation, { started: true, reducedMotion: true, best: 0, touch: false, delta: 0 }, frame, 'Idle', 0);
    draw();
    window.shakeProbe = async () => {
      simulation = new Simulation();
      simulation.branch(); while (simulation.transition) simulation.step();
      world.resize(3);
      const offset = (reducedMotion = false): number => {
        world.draw(simulation, { started: true, reducedMotion, best: 0, touch: false, delta: 0, effectDelta: STEP }, frame, 'Idle', 0);
        const base = Math.round(world.camera.originX * 3) + world.sourceLeft * world.presentation.scaleX;
        return (world.presentation.x - base) / world.presentation.scaleX;
      };
      const before = offset();
      simulation.merge();
      const steps = Math.ceil(simulation.transitionDuration / STEP);
      for (let n = 0; n < steps - 1; n++) simulation.step();
      const midair = offset();
      simulation.step(); const landed = offset();
      simulation.step(); const pulse = offset(), motion = world.motion.draws;
      simulation.setPaused(true); simulation.step(); const paused = offset(), reduced = offset(true);
      simulation.setPaused(false);
      for (let n = 0; n < 31; n++) simulation.step();
      const expired = offset(), time = simulation.time;
      simulation = new Simulation(); const restarted = offset();
      await new Promise<void>(resolve => this.game.events.once('postrender', resolve));
      return { before, midair, landed, pulse, paused, reduced, expired, restarted, motion, time };
    };
    window.muzzleProbe = async kind => {
      simulation = new Simulation(SHOOTER_SEED);
      simulation.config.branches.liftDuration = .8; simulation.config.branches.collapseDuration = .2;
      const shooter = firstShooter();
      simulation.player.x = shooter.x - 100;
      for (let n = 0; n < 2; n++) { simulation.branch(); while (simulation.transition) simulation.step(); }
      if (kind === 'branch') simulation.branch(); else simulation.merge();
      for (let n = 0; n < 5; n++) simulation.step();
      const birthAge = simulation.transition!.age + STEP / 2;
      simulation.time = shooter.phase - STEP / 2;
      simulation.step({ move: 1, jump: false, branch: false, merge: false });
      simulation.time += .25;
      simulation.paused = true;
      draw();
      world.resize(3); world.camera.zoom = .65; world.camera.centerX = shooter.x - 60; world.camera.centerY = 58;
      draw();
      await new Promise<void>(resolve => this.game.events.once('postrender', resolve));
      const image = await new Promise<string>((resolve, reject) => {
        world.composition.snapshot(value => value instanceof HTMLImageElement ? resolve(value.src) : reject(new Error('Muzzle snapshot failed')));
      });
      return {
        image, left: world.sourceLeft, top: world.sourceTop,
        points: simulation.branches.flatMap((branch, depth) => {
          if (!simulation.isOrdinaryActive(depth, shooter)) return [];
          const muzzle = simulation.shooterMuzzle(depth, shooter, shooter.phase, birthAge);
          const shot = [...simulation.shots.values()].find(shot => shot.branchId === branch.id && shot.birth === shooter.phase)!;
          return { x: muzzle.x + shot.vx * (simulation.time - shot.birth), y: muzzle.y + shot.vy * (simulation.time - shot.birth) };
        }),
      };
    };
    window.effectProbe = async (enabled, config = {}, started = true, mobile = false) => {
      world.resize(this.game.canvas.width / 480);
      world.draw(simulation, { started, reducedMotion: true, best: 0, touch: mobile, delta: 0 }, frame, 'Idle', 0);
      const canvas = this.game.canvas, box = canvas.getBoundingClientRect();
      crt.update({ ...simulation.config.crt, ...config, enabled: Number(enabled) }, {
        width: canvas.width, height: canvas.height, cssWidth: box.width, cssHeight: box.height,
        worldPixelPitch: world.presentation.scaleX, mobile, reducedMotion: false, started,
      });
      await new Promise<void>(resolve => this.game.events.once('postrender', resolve));
      return canvas.toDataURL();
    };
    window.renderProbe = async (zoom, pan, scale) => {
      this.scale.resize(480 * scale, 270 * scale);
      world.resize(scale);
      world.camera.zoom = zoom;
      world.camera.centerX = 200 + pan;
      world.camera.centerY = 0;
      draw();
      await new Promise<void>(resolve => this.game.events.once('postrender', resolve));
      const native = await new Promise<string>((resolve, reject) => {
        world.composition.snapshot(image => image instanceof HTMLImageElement ? resolve(image.src) : reject(new Error('Native snapshot failed')));
      });
      const filtered = await new Promise<string>((resolve, reject) => {
        world.presentation.snapshot(image => image instanceof HTMLImageElement ? resolve(image.src) : reject(new Error('Filtered snapshot failed')));
      });
      return {
        native, filtered, screen: this.game.canvas.toDataURL(), left: world.sourceLeft, top: world.sourceTop,
        x: world.presentation.x, y: world.presentation.y, pitch: world.presentation.scaleX, filter: palette.resolution,
      };
    };
    window.junctionProbe = async (staged, merges, pan) => {
      simulation = new Simulation(123);
      simulation.config.effects.inactiveOpacity = 1;
      simulation.config.effects.highlightStrength = 0;
      for (let i = 0; i < 2; i++) {
        simulation.player.x = 104 + i * 56;
        simulation.branch();
        for (let step = 0; step < 24; step++) simulation.step();
      }
      if (staged) simulation.stage('0:0');
      for (let i = 0; i < merges; i++) {
        simulation.merge();
        for (let step = 0; step < 24; step++) simulation.step();
      }
      simulation.player.x = 320;
      simulation.paused = true;
      draw();
      world.camera.zoom = .65;
      world.camera.centerX = 200 + pan;
      world.camera.centerY = 0;
      draw();
      await new Promise<void>(resolve => this.game.events.once('postrender', resolve));
      const image = await new Promise<string>((resolve, reject) => {
        world.composition.snapshot(value => value instanceof HTMLImageElement ? resolve(value.src) : reject(new Error('Junction snapshot failed')));
      });
      return {
        image, left: world.sourceLeft, top: world.sourceTop,
        forks: [{ x: 80, y: 0, end: 104 }, { x: 136, y: -58, end: 160 }].slice(0, simulation.depth),
        supports: [simulation.surfaceAt(0, 96).height, simulation.surfaceAt(Math.min(1, simulation.depth), 152).height],
        depth: simulation.depth, danger: simulation.isOrdinaryActive(0, simulation.nearby(220, 250)[0]!),
        converted: simulation.isConverted(0, '0:0'),
      };
    };
    window.tweenProbe = async (kind, progress, nested, zoom) => {
      simulation = new Simulation(123);
      simulation.player.x = 104;
      if (nested) {
        simulation.branch();
        for (let n = 0; n < 24; n++) simulation.step();
        simulation.player.x = nested === 'backtracked' ? 64 : 160;
      }
      simulation.branch();
      if (kind === 'merge') {
        for (let n = 0; n < 24; n++) simulation.step();
        simulation.merge();
      }
      const branch = simulation.top;
      const steps = Math.floor(progress * simulation.transitionDuration / STEP);
      for (let n = 0; n < steps; n++) simulation.step();
      simulation.paused = true;
      draw();
      world.camera.zoom = zoom;
      world.camera.centerX = 200;
      draw();
      await new Promise<void>(resolve => this.game.events.once('postrender', resolve));
      const image = await new Promise<string>((resolve, reject) => {
        world.composition.snapshot(value => value instanceof HTMLImageElement ? resolve(value.src) : reject(new Error('Tween snapshot failed')));
      });
      const point = (x: number): number[] => [x, -Math.round(simulation.surfaceAt(simulation.depth, x).height)];
      return {
        image, left: world.sourceLeft, top: world.sourceTop,
        points: [branch.forkX + 12, nested === 'backtracked' ? 92 : branch.forkX + 35].map(point),
        end: point(branch.forkX + 24), foot: point(branch.forkX),
        worldY: simulation.playerWorldY,
      };
    };
  }
}
new Phaser.Game({
  type: Phaser.WEBGL, width: 1440, height: 810, scene: Probe, banner: false,
  pixelArt: true, antialias: false, roundPixels: false, render: { preserveDrawingBuffer: true },
});
