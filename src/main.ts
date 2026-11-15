import Phaser from 'phaser';
import { AudioEngine } from './audio';
import { CharacterAnimation, parseCharacterAtlas } from './character';
import { Controls, isIntroStartKey, preservesNativeKey } from './input';
import { installControlIcons } from './control-icons';
import { attachCrt } from './crt';
import { applyPixelComposition, fitCanvas, HEIGHT, WIDTH } from './pixel';
import { hint, WorldRenderer } from './renderer';
import { Simulation, STEP } from './simulation';
import { loadPreferences, savePreferences } from './preferences';
import type { Preferences } from './preferences';
import './style.css';
import { DEFAULTS, tuningDocument } from './tuning';
import { mountTuningPanel } from './tuning-panel';

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing interface element: ${id}`);
  return node as T;
}

let tuning = structuredClone(DEFAULTS);
let simulation = new Simulation(undefined, tuning);
let started = false;
let ready = false;
let viewportFits = true;
const touch = window.matchMedia('(pointer: coarse)').matches;
let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let best = 0;
let controls: Controls;
let character: CharacterAnimation | null = null;
const viewport = element('game');
const status = element('status');
const panel = element('pause-panel');
const results = element('game-over');
const errorPanel = element('error');
const sizeWarning = element('size-warning');
const tune = element('tuning-panel');
const notice = element('notice');
let noticeReturn: HTMLElement | null = null;
let blockedStartActivation: KeyboardEvent | null = null;
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
function clearNotice(message: string): void {
  if (element('notice-message').textContent === message) dismissNotice();
}
function visibleAction(node: HTMLElement): boolean {
  const closed = node.closest('details:not([open])');
  return !node.matches(':disabled, [hidden]') && !!node.getClientRects().length &&
    getComputedStyle(node).visibility !== 'hidden' && (!closed || node.matches('summary') && node.parentElement === closed);
}
function menuContext(): { root: HTMLElement; modal: boolean } | null {
  const blocked = !errorPanel.hidden ? errorPanel : !sizeWarning.hidden ? sizeWarning : !panel.hidden ? panel : !results.hidden ? results : null;
  if (!tune.hidden && errorPanel.hidden) return { root: tune, modal: !!blocked };
  return blocked ? { root: blocked, modal: true } : null;
}
function focusMenu(): void {
  const root = menuContext()?.root;
  const preferred = root === panel ? element('resume') : root === results ? element('again') :
    root === errorPanel ? element('reload') : root === sizeWarning ? element('size-fullscreen') :
      root === tune ? tune.querySelector<HTMLElement>('summary') : started ? viewport : startButton;
  if (preferred && visibleAction(preferred)) preferred.focus();
}
function dismissNotice(): void {
  const focused = notice.contains(document.activeElement);
  notice.hidden = true;
  if (focused) {
    const root = menuContext();
    if (noticeReturn && visibleAction(noticeReturn) && (!root?.modal || root.root.contains(noticeReturn))) noticeReturn.focus();
    else focusMenu();
  }
  noticeReturn = null;
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
element('dismiss-notice').addEventListener('click', dismissNotice);
for (const control of document.querySelectorAll<HTMLElement>('button, input, a[href]')) control.tabIndex = 0;

function pause(): void {
  if (!started || simulation.gameOver) return;
  simulation.setPaused(true);
  audio.setPaused(true);
  document.body.dataset.state = 'paused';
  controls.clear();
  panel.hidden = false;
  if (tune.hidden || !tune.contains(document.activeElement)) focusMenu();
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
function restart(focusGame = true): void {
  if (!ready || !viewportFits || !errorPanel.hidden) return;
  const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
  simulation = new Simulation(seed, tuning);
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
  if (focusGame) viewport.focus({ preventScroll: true });
}
installControlIcons();
controls = new Controls(() => { void audio.unlock(); }, () => ready && started && !simulation.paused && !simulation.gameOver && viewportFits && errorPanel.hidden);
function introReady(): boolean {
  return ready && !started && viewportFits && tune.hidden && errorPanel.hidden && sizeWarning.hidden;
}
startButton.addEventListener('click', event => {
  if (introReady() && !event.ctrlKey && !event.metaKey && !event.altKey && (event.detail !== 0 || !blockedStartActivation)) restart();
});
element('restart').addEventListener('click', () => restart());
element('again').addEventListener('click', () => restart());
const tuningPanel = mountTuningPanel(() => tuning, (next, newRun) => {
  if (newRun && !ready) throw new Error('Wait for the game to load, or reload after an error, before applying a new run.');
  if (newRun && !viewportFits) throw new Error('Enlarge the game viewport before applying a new run. Your pending values are unchanged.');
  tuning = next;
  simulation.config = next;
  if (character) character.settings = next.character;
  if (newRun) restart(false);
}, () => { controls.clear(); simulation.endMergeHold(); }, () => {
  if (menuContext()?.modal) focusMenu();
  else element('tuning-toggle').focus({ preventScroll: true });
});
pauseButton.addEventListener('click', pause);
element('resume').addEventListener('click', resume);
window.addEventListener('blur', () => { blockedStartActivation = null; pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('pagehide', e => {
  if (e.persisted) pause();
  else { audio.destroy(); controls.destroy(); }
});
document.addEventListener('focusin', event => {
  if (notice.contains(event.target as Node) && !notice.contains(event.relatedTarget as Node | null)) {
    noticeReturn = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null;
  }
});
document.addEventListener('keydown', event => {
  // Native button clicks can omit modifiers, including after modifier release.
  if (!event.repeat && event.target === startButton && ['Enter', ' '].includes(event.key)) {
    blockedStartActivation = preservesNativeKey(event) ? event : null;
  }
  if (event.defaultPrevented || preservesNativeKey(event)) return;
  const target = event.target instanceof HTMLElement ? event.target : null;
  const consume = (): void => { event.preventDefault(); event.stopPropagation(); };
  const context = menuContext();
  if (event.repeat && ['Enter', ' '].includes(event.key) && target?.matches('button, summary, a[href], input[type="checkbox"]')) { consume(); return; }
  if (event.key === 'Escape') {
    if (event.repeat) return;
    consume();
    if (target && notice.contains(target)) dismissNotice();
    else if (!errorPanel.hidden || !sizeWarning.hidden && tune.hidden) focusMenu();
    else if (!tune.hidden) {
      tuningPanel.close();
    } else if (!panel.hidden) resume();
    else if (!results.hidden) focusMenu();
    else if (started) pause();
    else focusMenu();
    return;
  }
  const tab = event.key === 'Tab' && context?.modal;
  const arrows = ['ArrowUp', 'ArrowDown'].includes(event.key) &&
    (context?.modal || !started || target?.matches('button, summary, a, input[type="checkbox"]'));
  if (tab || arrows) {
    if (arrows && target?.matches('input:not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable="true"]')) return;
    const owner = target?.closest<HTMLElement>('#tuning-panel, #notice');
    const root = context?.modal ? context.root : owner ?? document.body;
    const roots = context?.modal && !notice.hidden && root !== notice ? [root, notice] : [root];
    const selector = 'button, input:not([type="hidden"]), select, textarea, a[href], summary';
    const actions = roots.flatMap(node => [...node.querySelectorAll<HTMLElement>(selector)]).filter(visibleAction);
    const options = tab ? actions : actions.filter(node => node.matches('button, summary, a, input[type="checkbox"], input[type="radio"]'));
    const index = options.indexOf(document.activeElement as HTMLElement);
    const backwards = tab ? event.shiftKey : event.key === 'ArrowUp';
    consume();
    if (options.length) {
      const next = index < 0 ? backwards ? options.length - 1 : 0 : (index + (backwards ? -1 : 1) + options.length) % options.length;
      options[next]!.focus();
    }
    return;
  }
  if (event.key === 'Enter' && target?.matches('input[type="checkbox"]')) { consume(); target.click(); return; }
  if (introReady() && isIntroStartKey(event) && (target === startButton || target === viewport || target === document.body || target === document.documentElement || target instanceof HTMLCanvasElement)) {
    consume(); restart();
  }
}, true);
document.addEventListener('keyup', event => {
  const activation = blockedStartActivation;
  if (activation?.code === event.code) {
    // Space activates after keyup dispatch; expire only after that default action.
    setTimeout(() => { if (blockedStartActivation === activation) blockedStartActivation = null; }, 0);
  }
}, true);
async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    notify('Fullscreen is unavailable here. You can keep playing in this window.');
  }
}
element('fullscreen').addEventListener('click', toggleFullscreen);
element('size-fullscreen').addEventListener('click', toggleFullscreen);

class GameScene extends Phaser.Scene {
  private world!: WorldRenderer;
  private accumulator = 0;
  private palette!: ReturnType<typeof applyPixelComposition>;
  private crt!: ReturnType<typeof attachCrt>;
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
    if (!errorPanel.hidden) return;
    const texture = this.textures.get('octocat');
    const image = texture.getSourceImage();
    let atlas: ReturnType<typeof parseCharacterAtlas>;
    try { atlas = parseCharacterAtlas(this.cache.json.get('octocat-atlas'), image.width, image.height); }
    catch (error) { showError(error instanceof Error ? error.message : 'The character atlas could not load.'); return; }
    for (const frames of Object.values(atlas)) {
      for (const frame of frames) texture.add(frame.key, 0, frame.x, frame.y, frame.w, frame.h);
    }
    character = new CharacterAnimation(atlas, tuning.character);
    this.world = new WorldRenderer(this);
    this.palette = applyPixelComposition(this, this.world.composition);
    this.crt = attachCrt(this, notify, clearNotice);
    const canvas = this.game.canvas;
    canvas.setAttribute('aria-label', 'Forking Hell pixel game. Keyboard controls are described below.');
    const resize = (): void => {
      const warningFocused = sizeWarning.contains(document.activeElement);
      this.presentation = fitCanvas(this.game, viewport);
      this.world.resize(this.presentation.scale, this.presentation.dpr);
      viewportFits = this.presentation.fits;
      sizeWarning.hidden = viewportFits;
      if (!viewportFits) {
        pause();
        if (tune.hidden) focusMenu();
      }
      if (!started) startButton.disabled = !ready || !viewportFits;
      if (viewportFits && warningFocused) focusMenu();
      const ui = element('canvas-ui');
      for (const property of ['width', 'height', 'left', 'top'] as const) ui.style[property] = canvas.style[property];
      viewport.scrollTo(0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    window.addEventListener('resize', resize);
    this.events.once('shutdown', () => { observer.disconnect(); window.removeEventListener('resize', resize); });
    ready = true;
    resize();
    status.textContent = 'Ready. Press Enter, Space, an arrow to the left or right, or a typing key to enter. Tab and Up/Down navigate menus.';
    startButton.disabled = !viewportFits;
    if (!started && document.activeElement === document.body && viewportFits) startButton.focus({ preventScroll: true });
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.world.motion.reset(); this.crt.suspend(); pause(); showError('Graphics connection lost. Reload to restore the pixel renderer.'); });
    Object.assign(window, { forkingHell: {
      snapshot: () => ({
        x: simulation.player.x, y: simulation.player.y, time: simulation.time, depth: simulation.depth,
        health: simulation.player.health, score: simulation.score, paused: simulation.paused,
        staged: [...simulation.top.staged], converted: simulation.awarded.size,
        coins: simulation.coinScore, started, gameOver: simulation.gameOver,
        transition: simulation.transition?.kind ?? null, animation: this.world.animation,
        mergeCombo: simulation.mergeCombo,
        airJumpAvailable: simulation.airJumpAvailable,
        covered: [...simulation.top.covered],
      }),
      diagnostics: () => ({
        engine: Phaser.VERSION, shaderPasses: this.palette.runs, logical: [WIDTH, HEIGHT],
        physicalPixelScale: this.presentation.scale, dpr: this.presentation.dpr,
        cameraX: this.world.cameraX, visibleHazards: this.world.renderedHazards,
        visibleEncounters: this.world.forkTargets(simulation),
        zoom: this.world.camera.zoom, cameraOrigin: [this.world.camera.originX, this.world.camera.originY],
        worldPixelScales: this.world.pixelScales,
        highlightedCopies: this.world.highlightedCopies, tuning: tuningDocument(tuning),
        worldTarget: [this.world.composition.width, this.world.composition.height], filterResolution: this.palette.resolution,
        outputResolution: [canvas.width, canvas.height], worldPixelPitch: this.world.camera.zoom * this.presentation.scale,
        crtActive: this.crt.active, crtUniforms: this.crt.uniforms, crtBudgetBlocked: this.crt.budgetBlocked, reducedMotion,
        motionDraws: this.world.motion.draws,
        jumpParticles: simulation.jumpParticles.length,
        visibleShots: this.world.renderedShots, retainedShots: simulation.shots.size,
        retainedCoins: simulation.coins.size, activeBranches: simulation.branches.length,
        averageFrameMs: this.frameTimes.reduce((sum, n) => sum + n, 0) / Math.max(1, this.frameTimes.length),
      }),
      projectiles: () => ({
        time: simulation.time,
        sources: simulation.nearby(simulation.player.x - 350, simulation.player.x + 350)
          .filter(hazard => hazard.kind === 'shooter').flatMap(hazard => simulation.branches.map((branch, depth) => ({
            id: `${branch.id}/${hazard.id}`, branchId: branch.id, sourceId: hazard.id,
            muzzle: simulation.shooterMuzzle(depth, hazard), converted: simulation.isConverted(depth, hazard.id),
            active: simulation.isOrdinaryActive(depth, hazard),
          }))),
        shots: [...simulation.shotsNear(simulation.player.x - 350, simulation.player.x + 350, simulation.playerWorldY - 300, simulation.playerWorldY + 300)]
          .flatMap(shot => { const pose = simulation.shotPose(shot); return pose ? [{ ...shot, pose }] : []; }),
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
        const input = controls.sample();
        if (input.branch) input.forkTargets = this.world.forkTargets(simulation);
        simulation.step(input, STEP, reducedMotion);
        for (const event of simulation.events.slice(firstEvent)) {
          if (event === 'jump') character.jumped();
          if (event === 'land') character.landed();
        }
        this.accumulator -= STEP;
      }
    } else this.accumulator = 0;
    if (!simulation.paused && !simulation.gameOver) character.update(delta / 1000, simulation.player.grounded, simulation.player.vy, simulation.axis);
    for (const event of simulation.events) audio.play(event, simulation.mergeCombo, tuning.audio);
    simulation.events.length = 0;
    this.palette.strength = tuning.effects.paletteStrength;
    this.world.draw(simulation, { started, reducedMotion, best, touch, delta: Math.min(0.1, delta / 1000), effectDelta: delta / 1000 }, character.frame, character.clip, character.index);
    const canvas = this.game.canvas;
    this.crt.update(tuning.crt, {
      width: canvas.width, height: canvas.height,
      cssWidth: canvas.width / this.presentation.dpr, cssHeight: canvas.height / this.presentation.dpr,
      worldPixelPitch: this.world.camera.zoom * this.presentation.scale,
      mobile: touch || canvas.width / this.presentation.dpr < 700, reducedMotion, started,
    });
    tuningPanel.updateCrtStatus({
      active: this.crt.active, budgetBlocked: this.crt.budgetBlocked, reduced: reducedMotion,
      mobile: touch || canvas.width / this.presentation.dpr < 700, started,
    });
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
      element<HTMLButtonElement>('again').focus({ preventScroll: true });
    }
  }
}

function showError(message: string): void {
  ready = false;
  simulation.setPaused(true);
  controls.clear(); audio.setPaused(true);
  tuningPanel.close(false);
  element('error').hidden = false;
  element('error-message').textContent = message;
  startButton.disabled = true;
  focusMenu();
  console.error(message);
}

try {
  const canvas = document.createElement('canvas');
  if (!canvas.getContext('webgl2') && !canvas.getContext('webgl')) throw new Error('WebGL is unavailable. Enable hardware acceleration or use a WebGL-capable browser. This game needs its shared pixel shader.');
  new Phaser.Game({
    type: Phaser.WEBGL, width: WIDTH, height: HEIGHT, parent: viewport, backgroundColor: '#08060f',
    pixelArt: true, antialias: false, roundPixels: false, banner: false, scene: GameScene,
    scale: { mode: Phaser.Scale.NONE },
    input: { keyboard: false, mouse: false, touch: false },
    render: { preserveDrawingBuffer: true },
  });
} catch (error) {
  showError(error instanceof Error ? error.message : 'The game could not start. Please reload.');
}
