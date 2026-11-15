import Phaser from 'phaser';
import { AudioEngine } from './audio';
import { CharacterAnimation, parseCharacterAtlas } from './character';
import { Controls } from './input';
import { applyPixelComposition, fitCanvas, HEIGHT, WIDTH } from './pixel';
import { hint, WorldRenderer } from './renderer';
import { Simulation, STEP } from './simulation';
import { loadPreferences, savePreferences } from './preferences';
import type { Preferences } from './preferences';
import './style.css';

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing interface element: ${id}`);
  return node as T;
}

let simulation = new Simulation();
let started = false;
let viewportFits = true;
const touch = window.matchMedia('(pointer: coarse)').matches;
let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let best = 0;
let controls: Controls;
let character: CharacterAnimation | null = null;
const viewport = element('game');
const status = element('status');
const panel = element('pause-panel');
const startButton = element<HTMLButtonElement>('start');
const pauseButton = element<HTMLButtonElement>('pause');
const reducedInput = element<HTMLInputElement>('reduced');
const soundInput = element<HTMLInputElement>('sound');
const musicInput = element<HTMLInputElement>('music');
const audio = new AudioEngine(notify);
let storageAvailable = true;
try {
  const saved = loadPreferences(window.localStorage, reducedMotion);
  reducedMotion = saved.reducedMotion; best = saved.best;
  audio.sound = saved.sound; audio.music = saved.music;
} catch (error) {
  storageAvailable = false;
  notify(`Local saves are unavailable. This run still works, but settings and best scores will not persist. ${error instanceof Error ? error.message : ''}`);
}
function notify(message: string): void {
  element('notice').hidden = false;
  element('notice-message').textContent = message;
  console.warn(message);
}
function persist(): void {
  if (!storageAvailable) return;
  const preferences: Preferences = { reducedMotion, best, sound: audio.sound, music: audio.music };
  try { savePreferences(window.localStorage, preferences); }
  catch {
    storageAvailable = false;
    notify('Local storage is full or blocked. This run still works, but scores and settings cannot be saved.');
  }
}
reducedInput.checked = reducedMotion;
soundInput.checked = audio.sound; musicInput.checked = audio.music;
reducedInput.addEventListener('change', () => { reducedMotion = reducedInput.checked; persist(); });
soundInput.addEventListener('change', () => { audio.sound = soundInput.checked; persist(); });
musicInput.addEventListener('change', () => { audio.music = musicInput.checked; audio.updateAmbient(); persist(); });
element('dismiss-notice').addEventListener('click', () => { element('notice').hidden = true; });

function pause(): void {
  if (!started || simulation.gameOver) return;
  simulation.setPaused(true);
  audio.setPaused(true);
  document.body.dataset.state = 'paused';
  controls.clear();
  panel.hidden = false;
  element<HTMLButtonElement>('resume').focus({ preventScroll: true });
}
function resume(): void {
  if (!started || simulation.gameOver || !viewportFits) return;
  controls.clear();
  simulation.setPaused(false);
  audio.setPaused(false);
  document.body.dataset.state = 'playing';
  panel.hidden = true;
  viewport.focus({ preventScroll: true });
}
function restart(): void {
  if (!viewportFits) return;
  const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
  simulation = new Simulation(seed);
  character?.reset();
  started = true;
  controls.clear();
  startButton.hidden = true;
  panel.hidden = true;
  element('game-over').hidden = true;
  pauseButton.disabled = false;
  document.body.dataset.state = 'playing';
  audio.setPaused(false);
  void audio.unlock();
  viewport.focus({ preventScroll: true });
}
controls = new Controls(() => simulation.paused ? resume() : pause(), () => { void audio.unlock(); });
startButton.addEventListener('click', restart);
element('restart').addEventListener('click', restart);
element('again').addEventListener('click', restart);
pauseButton.addEventListener('click', pause);
element('resume').addEventListener('click', resume);
window.addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('pagehide', e => {
  if (e.persisted) pause();
  else { audio.destroy(); controls.destroy(); }
});
document.addEventListener('keydown', e => {
  const overlay = !panel.hidden ? panel : !element('game-over').hidden ? element('game-over') : null;
  if (!overlay || e.code !== 'Tab') return;
  const focusable = [...overlay.querySelectorAll<HTMLElement>('button:not(:disabled), input')];
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
});
element('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    notify('Fullscreen is unavailable here. You can keep playing in this window.');
  }
});

class GameScene extends Phaser.Scene {
  private world!: WorldRenderer;
  private accumulator = 0;
  private palette!: ReturnType<typeof applyPixelComposition>;
  private frameTimes: number[] = [];
  private lastHint = '';
  private presentation = { scale: 1, dpr: 1, fits: true };

  preload(): void {
    this.load.image('octocat', `${import.meta.env.BASE_URL}assets/octocat.png`);
    this.load.json('octocat-atlas', `${import.meta.env.BASE_URL}assets/octocat.json`);
    this.load.atlas('hazards', `${import.meta.env.BASE_URL}assets/hazards.png`, `${import.meta.env.BASE_URL}assets/hazards.json`);
    this.load.on('loaderror', () => showError('The game artwork could not load. Reload the page to try again.'));
  }

  create(): void {
    const texture = this.textures.get('octocat');
    const image = texture.getSourceImage();
    let atlas: ReturnType<typeof parseCharacterAtlas>;
    try { atlas = parseCharacterAtlas(this.cache.json.get('octocat-atlas'), image.width, image.height); }
    catch (error) { showError(error instanceof Error ? error.message : 'The character atlas could not load.'); return; }
    for (const frames of Object.values(atlas)) {
      for (const frame of frames) texture.add(frame.key, 0, frame.x, frame.y, frame.w, frame.h);
    }
    character = new CharacterAnimation(atlas);
    this.palette = applyPixelComposition(this);
    this.world = new WorldRenderer(this);
    const canvas = this.game.canvas;
    canvas.setAttribute('aria-label', 'Forking Hell pixel game. Keyboard controls are described below.');
    const resize = (): void => {
      this.presentation = fitCanvas(canvas, viewport);
      viewportFits = this.presentation.fits;
      element('size-warning').hidden = viewportFits;
      if (!viewportFits) pause();
      if (!started) startButton.disabled = !viewportFits;
      const ui = element('canvas-ui');
      for (const property of ['width', 'height', 'left', 'top'] as const) ui.style[property] = canvas.style[property];
      viewport.scrollTo(0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    window.addEventListener('resize', resize);
    this.events.once('shutdown', () => { observer.disconnect(); window.removeEventListener('resize', resize); });
    resize();
    status.textContent = 'Ready. Move right to advance time, stop to freeze, left to reverse.';
    startButton.disabled = !viewportFits;
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); pause(); showError('Graphics connection lost. Reload to restore the pixel renderer.'); });
    Object.assign(window, { forkingHell: {
      snapshot: () => ({
        x: simulation.player.x, y: simulation.player.y, time: simulation.time, depth: simulation.depth,
        health: simulation.player.health, score: simulation.score, paused: simulation.paused,
        staged: [...simulation.top.staged], converted: simulation.awarded.size,
        coins: simulation.coinScore, started, gameOver: simulation.gameOver,
        transition: simulation.transition?.kind ?? null, animation: this.world.animation,
      }),
      diagnostics: () => ({
        engine: Phaser.VERSION, shaderPasses: this.palette.runs, logical: [WIDTH, HEIGHT],
        physicalPixelScale: this.presentation.scale, dpr: this.presentation.dpr,
        cameraX: this.world.cameraX, visibleHazards: this.world.renderedHazards,
        zoom: this.world.camera.zoom, cameraOrigin: [this.world.camera.originX, this.world.camera.originY],
        worldPixelScales: this.world.pixelScales,
        visibleShots: this.world.renderedShots, retainedShots: simulation.shots.size,
        retainedCoins: simulation.coins.size, activeBranches: simulation.branches.length,
        averageFrameMs: this.frameTimes.reduce((sum, n) => sum + n, 0) / Math.max(1, this.frameTimes.length),
      }),
    } });
  }

  update(_time: number, delta: number): void {
    if (!this.world || !character) return;
    this.frameTimes.push(delta);
    if (this.frameTimes.length > 240) this.frameTimes.shift();
    if (started && !simulation.paused && !simulation.gameOver) {
      this.accumulator += Math.min(delta / 1000, 0.1);
      while (this.accumulator >= STEP) {
        const firstEvent = simulation.events.length;
        simulation.step(controls.sample());
        for (const event of simulation.events.slice(firstEvent)) {
          if (event === 'jump') character.jumped();
          if (event === 'land') character.landed();
        }
        this.accumulator -= STEP;
      }
    } else this.accumulator = 0;
    if (!simulation.paused && !simulation.gameOver) character.update(delta / 1000, simulation.player.grounded, simulation.player.vy, simulation.axis);
    for (const event of new Set(simulation.events)) audio.play(event);
    simulation.events.length = 0;
    this.world.draw(simulation, { started, reducedMotion, best, touch, delta: Math.min(0.1, delta / 1000) }, character.frame, character.clip, character.index);
    if (!simulation.paused && !simulation.gameOver) character.afterDraw();
    const nextHint = hint(simulation, touch).join('. ');
    if (started && this.lastHint !== nextHint) { status.textContent = nextHint; this.lastHint = nextHint; }
    if (simulation.gameOver && element('game-over').hidden) {
      best = Math.max(best, simulation.score);
      persist();
      audio.setPaused(true);
      document.body.dataset.state = 'over';
      element('game-over').hidden = false;
      element('score-total').textContent = String(simulation.score);
      element('score-breakdown').textContent = `Distance ${simulation.distanceScore} + destruction ${simulation.destructionScore} + coins ${simulation.coinScore}`;
      controls.clear();
      element<HTMLButtonElement>('again').focus();
    }
  }
}

function showError(message: string): void {
  element('error').hidden = false;
  element('error-message').textContent = message;
  startButton.disabled = true;
  console.error(message);
}

try {
  const canvas = document.createElement('canvas');
  if (!canvas.getContext('webgl2') && !canvas.getContext('webgl')) throw new Error('WebGL is unavailable. Enable hardware acceleration or use a WebGL-capable browser. This game needs its shared pixel shader.');
  new Phaser.Game({
    type: Phaser.WEBGL, width: WIDTH, height: HEIGHT, parent: viewport, backgroundColor: '#14102b',
    pixelArt: true, antialias: false, roundPixels: true, banner: false, scene: GameScene,
    scale: { mode: Phaser.Scale.NONE },
    input: { keyboard: false, mouse: false, touch: false },
    render: { preserveDrawingBuffer: true },
  });
} catch (error) {
  showError(error instanceof Error ? error.message : 'The game could not start. Please reload.');
}
