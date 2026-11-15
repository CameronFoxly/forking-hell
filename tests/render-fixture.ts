import Phaser from 'phaser';
import { parseCharacterAtlas } from '../src/character';
import { applyPixelComposition } from '../src/pixel';
import { WorldRenderer } from '../src/renderer';
import { Simulation } from '../src/simulation';
import { attachCrt } from '../src/crt';

type ProbeResult = { native: string; filtered: string; screen: string; left: number; top: number; x: number; y: number; pitch: number; filter: number[] };
type JunctionResult = { image: string; left: number; top: number; forks: { x: number; y: number; end: number }[]; supports: number[]; depth: number; danger: boolean; converted: boolean };
declare global { interface Window {
  renderProbe: (zoom: number, pan: number, scale: number) => Promise<ProbeResult>;
  junctionProbe: (staged: boolean, merges: number, pan: number) => Promise<JunctionResult>;
  tweenProbe: (kind: 'branch' | 'merge', steps: number, nested: boolean | 'backtracked', zoom: number) => Promise<{ image: string; left: number; top: number; points: number[][]; end: number[]; foot: number[]; worldY: number }>;
  effectProbe: (enabled: boolean) => Promise<string>;
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
    window.effectProbe = async enabled => {
      const canvas = this.game.canvas, box = canvas.getBoundingClientRect();
      crt.update({ ...simulation.config.crt, enabled: Number(enabled) }, {
        width: canvas.width, height: canvas.height, cssWidth: box.width, cssHeight: box.height,
        worldPixelPitch: world.presentation.scaleX, mobile: false, reducedMotion: false, started: true,
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
    window.tweenProbe = async (kind, steps, nested, zoom) => {
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
