import { describe, expect, it } from 'vitest';
import { DEFAULTS, needsRestart, parseTuning, tuningDocument } from '../src/tuning';
import { Simulation, STEP, encounters, hazardPose } from '../src/simulation';
import { CameraRig } from '../src/camera';
import { mergePitch } from '../src/audio';
import { firstShooter } from './encounter-fixtures';

const idle = { move: 0, jump: false, branch: false, merge: false };
const tick = (game: Simulation, count: number, input = idle) => { for (let i = 0; i < count; i++) game.step(input); };
function branches(depth: number): Simulation {
  const game = new Simulation();
  for (let i = 0; i < depth; i++) { game.branch(); tick(game, 24); }
  game.events.length = 0;
  return game;
}

describe('complete versioned tuning', () => {
  it('round trips every effective value and owns an independent copy', () => {
    const config = structuredClone(DEFAULTS);
    config.character.speed = 120;
    const decoded = parseTuning(JSON.parse(JSON.stringify(tuningDocument(config))));
    expect(decoded).toEqual(config);
    decoded.camera.followDamping = 20;
    expect(config.camera.followDamping).toBe(DEFAULTS.camera.followDamping);
    expect(needsRestart(DEFAULTS, config)).toBe(false);
    config.enemies.shotSpeed = 100;
    expect(needsRestart(DEFAULTS, config)).toBe(true);
  });
  it('rejects incomplete, extra, incompatible, nonfinite and cross-field-invalid data', () => {
    const before = structuredClone(DEFAULTS);
    const invalid = [
      { ...tuningDocument(DEFAULTS), version: 99 },
      { ...tuningDocument(DEFAULTS), extra: true },
      { format: 'forking-hell-tuning', version: 1, values: {} },
      tuningDocument({ ...DEFAULTS, physics: { ...DEFAULTS.physics, gravity: NaN } }),
      tuningDocument({ ...DEFAULTS, effects: { ...DEFAULTS.effects, particles: 2.2 } }),
      { ...tuningDocument(DEFAULTS), values: { ...DEFAULTS, character: { ...DEFAULTS.character, speed: 'fast' } } },
      tuningDocument({ ...DEFAULTS, camera: { ...DEFAULTS.camera, minZoom: .8, startZoom: .6 } }),
      tuningDocument({ ...DEFAULTS, branches: { ...DEFAULTS.branches, holdDelay: -1 } }),
      tuningDocument({ ...DEFAULTS, enemies: { ...DEFAULTS.enemies, spinnerHeight: 10, spinnerBob: 20 } }),
    ];
    for (const document of invalid) expect(() => parseTuning(document)).toThrow();
    expect(DEFAULTS).toEqual(before);
  });
  it('applies movement, physics, enemy and camera values without tying time to frame count', () => {
    const config = structuredClone(DEFAULTS);
    config.character.speed = 120; config.physics.gravity = 400; config.physics.jumpHeight = 60;
    const game = new Simulation(123, config);
    tick(game, 30, { ...idle, move: 1 });
    expect(game.player.x).toBeCloseTo(124);
    expect(game.time).toBeCloseTo(.5);
    game.step({ ...idle, jump: true });
    expect(game.player.vy).toBeCloseTo(Math.sqrt(2 * 400 * 60) - 400 * STEP);
    const patrol = encounters(123, 0)[0]!;
    expect(hazardPose(patrol, .2, { ...config.enemies, patrolSpeed: 2 })).toEqual(hazardPose(patrol, .4, config.enemies));
    const shooter = firstShooter(123, { ...config.enemies, firingRate: 2 });
    expect(shooter.period).toBe(firstShooter(123, { ...config.enemies, firingRate: 1 }).period / 2);
    config.camera.startZoom = 1;
    const camera = new CameraRig(); camera.reset(config.camera);
    expect(camera.zoom).toBe(1);
    config.branches.height = 70; config.branches.length = 32;
    game.branch();
    expect(game.top.forkX).toBe(game.player.x - 32);
    expect(game.surfaceAt(1, game.player.x).height).toBe(0);
    tick(game, 24);
    expect(game.surfaceAt(1, game.player.x).height).toBe(70);
  });
});

describe('held merge and staged ancestry', () => {
  it.each([.34, .5])('starts each held merge on the first settled step of a %s second tween', duration => {
    const game = branches(4);
    game.config.branches.collapseDuration = duration;
    const starts: number[] = [];
    for (let i = 0; i < 150; i++) {
      const transition = game.transition;
      game.step({ ...idle, merge: true });
      if (!transition && game.transition?.kind === 'merge') starts.push(i);
    }
    expect(starts).toHaveLength(4);
    for (let i = 1; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBe(Math.ceil((duration - 1e-8) / STEP));
    const pending = new Simulation();
    pending.config.branches.liftDuration = duration;
    pending.config.branches.collapseDuration = duration;
    const steps = Math.ceil((duration - 1e-8) / STEP);
    pending.step({ ...idle, branch: true });
    tick(pending, steps - 1, { ...idle, merge: true });
    expect(pending.depth).toBe(1);
    expect(pending.transition).toBeNull();
    pending.step({ ...idle, merge: true });
    expect(pending.transition?.kind).toBe('merge');
    tick(pending, steps - 1, { ...idle, merge: true });
    expect(pending.depth).toBe(0);
  });
  it('a tap merges once; a hold serializes layers, pays each copy and flourishes exactly at four', () => {
    const game = branches(5); game.stage('0:0');
    game.step({ ...idle, merge: true }); tick(game, 30);
    expect(game.depth).toBe(4); expect(game.mergeCombo).toBe(0);
    game.events.length = 0;
    const counts: number[] = [];
    for (let i = 0; i < 120; i++) {
      const before = game.events.length;
      game.step({ ...idle, merge: true });
      if (game.events.slice(before).includes('combo')) counts.push(game.mergeCombo);
    }
    expect(counts).toEqual([4]);
    expect(game.depth).toBe(0);
    expect(game.destructionScore).toBe(500);
    expect(game.awarded.size).toBe(5);
    expect(game.time).toBe(0); expect(game.player.invulnerable).toBe(0);
    expect(game.events.filter(event => event === 'merge')).toHaveLength(4);
    expect(mergePitch(4, 2)).toBeGreaterThan(mergePitch(3, 2));
  });
  it('release, pause and a new branch terminate the combo and suppress continued held descent', () => {
    const game = branches(4);
    tick(game, 25, { ...idle, merge: true });
    expect(game.mergeCombo).toBeGreaterThan(0);
    game.step();
    expect(game.mergeCombo).toBe(0);
    game.setPaused(true); game.setPaused(false);
    tick(game, 25);
    const depth = game.depth;
    tick(game, 25, { ...idle, branch: true, merge: true });
    tick(game, 25, { ...idle, merge: true });
    expect(game.depth).toBe(depth + 1);
    expect(game.mergeCombo).toBe(0);
    game.step(); game.step({ ...idle, merge: true });
    expect(game.transition?.kind).toBe('merge');
    tick(game, 24);
    expect(game.depth).toBe(depth);
  });
  it('staged links retain lineage and ancestor coverage through nested propagation', () => {
    const game = branches(5);
    game.stage('0:0');
    expect(game.stagedLineages()).toEqual(new Map([['0:0', 5]]));
    game.merge(); tick(game, 24);
    expect(game.stagedLineages()).toEqual(new Map([['0:0', 4]]));
    expect(game.isConverted(4, '0:0')).toBe(true);
    expect(game.isConverted(0, '0:0')).toBe(false);
    expect(game.stagedLineages().has('0:1')).toBe(false);
  });
});
