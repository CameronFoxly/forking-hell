import { describe, expect, it } from 'vitest';
import { Simulation, encounters } from '../src/simulation';
import { DEFAULTS, JUMP_EFFECT_SECTIONS, parseTuning, tuningDocument } from '../src/tuning';

const idle = { move: 0, jump: false, branch: false, merge: false };
const ticks = (game: Simulation, count: number, input = idle) => { for (let n = 0; n < count; n++) game.step(input); };
const settle = (game: Simulation) => { while (game.transition && !game.gameOver) game.step(); };

describe('variable jump energy', () => {
  it.each([[DEFAULTS.physics.gravity, DEFAULTS.physics.jumpHeight], [150, 120], [1800, 12]])('measures a 2:1 apex envelope at gravity %i and full height %i', (gravity, height) => {
    const peaks = [];
    for (const hold of [1, 3, 6, 1000]) {
      const game = new Simulation();
      game.config.physics.gravity = gravity; game.config.physics.jumpHeight = height;
      let peak = 0;
      for (let n = 0; n < 240; n++) {
        game.step({ ...idle, jump: n < hold });
        peak = Math.max(peak, game.player.y);
      }
      expect(game.events.filter(event => event === 'jump')).toHaveLength(1);
      expect(game.events.filter(event => event === 'land')).toHaveLength(1);
      peaks.push(peak);
    }
    expect(Math.abs(peaks[0]! - height / 2)).toBeLessThan(.15);
    expect(Math.abs(peaks.at(-1)! - height)).toBeLessThan(.15);
    expect(peaks).toEqual([...peaks].sort((a, b) => a - b));
  });
  it('keeps lift motion out of jump energy and freezes hold progression during explicit pause', () => {
    for (const hold of [1, 1000]) {
      const game = new Simulation();
      game.branch();
      let peak = 0;
      for (let n = 0; n < 90; n++) { game.step({ ...idle, jump: n < hold }); peak = Math.max(peak, game.player.y); }
      expect(Math.abs(peak - game.config.physics.jumpHeight / (hold === 1 ? 2 : 1))).toBeLessThan(.15);
      expect(game.time).toBe(0);
    }
    const game = new Simulation(); ticks(game, 4, { ...idle, jump: true, move: -1 });
    game.setPaused(true); const before = structuredClone(game.player); ticks(game, 60);
    expect(game.player).toEqual(before);
    game.setPaused(false); ticks(game, 90);
    expect(game.player.grounded).toBe(true);
    expect(game.events.filter(event => event === 'jump')).toHaveLength(1);
  });
});

describe('merge landing feedback', () => {
  it.each([0, 2])('starts one pulse only at completion with %i staged targets', targets => {
    const game = new Simulation(123);
    game.branch(['0:0', '0:1']); settle(game);
    for (let i = 0; i < targets; i++) game.stage(`0:${i}`);
    game.merge();
    const steps = Math.ceil(game.config.branches.collapseDuration * 60);
    expect(game.shakeAge).toBe(Infinity);
    ticks(game, steps - 1);
    expect(game.shakeAge).toBe(Infinity);
    game.step();
    expect(game.shakeAge).toBe(0);
    expect(game.events.filter(event => event === 'merge')).toHaveLength(1);
    expect(game.events.filter(event => event === 'destroy')).toHaveLength(targets);
    game.step();
    const age = game.shakeAge;
    expect(age).toBeCloseTo(1 / 60);
    game.setPaused(true); ticks(game, 30);
    expect(game.shakeAge).toBe(age);
    game.setPaused(false); ticks(game, 30);
    expect(game.shakeAge).toBeGreaterThan(game.config.effects.shakeDuration);
    expect(game.time).toBe(0);
    expect(new Simulation().shakeAge).toBe(Infinity);
  });
  it('pulses each held landing but release stops new merges, not the accepted collapse', () => {
    const game = new Simulation();
    for (let i = 0; i < 3; i++) { game.branch(); settle(game); }
    const steps = Math.ceil(game.config.branches.collapseDuration * 60);
    ticks(game, steps, { ...idle, merge: true });
    expect(game.shakeAge).toBe(0); expect(game.depth).toBe(2);
    game.step({ ...idle, merge: true });
    game.endMergeHold(); game.step();
    expect(game.transition?.kind).toBe('merge');
    settle(game);
    expect(game.shakeAge).toBe(0); expect(game.depth).toBe(1);
    ticks(game, 60);
    expect(game.events.filter(event => event === 'merge')).toHaveLength(2);
    expect(game.depth).toBe(1);
  });
});

describe('timing and migration', () => {
  it('uses an 0.8-second physical lift and independent 0.2-second held collapses', () => {
    const game = new Simulation();
    game.config.branches.liftDuration = .8; game.config.branches.collapseDuration = .2;
    game.branch(); ticks(game, 24);
    expect(game.transition?.kind).toBe('branch');
    expect(game.playerWorldY).toBeCloseTo(58 * .875);
    game.setPaused(true); ticks(game, 60); expect(game.playerWorldY).toBeCloseTo(58 * .875);
    game.setPaused(false); ticks(game, 24);
    expect(game.transition).toBeNull();
    game.branch(); ticks(game, 48);
    const starts = [];
    for (let n = 0; n < 24; n++) {
      const before = game.transition;
      game.step({ ...idle, merge: true });
      if (!before && game.transition) starts.push(n);
    }
    expect(starts).toEqual([0, 12]); expect(game.depth).toBe(0);
  });
  it.each([false, true])('strictly migrates the historical v1 shape with easing=%s', eased => {
    const old: Record<string, unknown> = structuredClone(DEFAULTS);
    delete old.crt; delete old.motion; delete old.coins;
    for (const section of JUMP_EFFECT_SECTIONS) delete old[section];
    old.branches = { length: 24, height: 58, transition: .8, holdDelay: .1, ...(eased ? { liftEase: 4, collapseEase: 2 } : {}) };
    const migrated = parseTuning({ format: 'forking-hell-tuning', version: 1, values: old });
    expect(migrated.branches.liftDuration).toBe(.8);
    expect(migrated.branches.collapseDuration).toBe(.8);
    expect(migrated.branches.liftEase).toBe(eased ? 4 : 3);
    expect(migrated.crt.enabled).toBe(0); expect(migrated.motion.enabled).toBe(0);
    expect(parseTuning(tuningDocument(migrated))).toEqual(migrated);
    expect(() => parseTuning({ format: 'forking-hell-tuning', version: 1, values: { ...old, crt: DEFAULTS.crt } })).toThrow();
    expect(() => parseTuning({ format: 'forking-hell-tuning', version: 1, values: { ...old, branches: { transition: .8 } } })).toThrow();
  });
});

describe('landing rewards and local coin physics', () => {
  it('bounces on a retained parent ramp and transfers coins crossing its foot onto main', () => {
    const game = new Simulation();
    game.player.x = 240; game.branch(['0:0']); settle(game); game.branch(['0:0']); settle(game);
    game.stage('0:0'); game.player.x = 320; game.merge(); settle(game);
    expect(game.depth).toBe(1);
    ticks(game, 360);
    const coins = [...game.coins.values()];
    expect(coins).toHaveLength(3);
    expect(coins.every(coin => coin.y >= 5 && Number.isFinite(coin.vy))).toBe(true);
    const returned = coins.find(coin => coin.branchId === 0);
    expect(returned).toBeDefined();
    expect(returned!.x).toBeLessThan(game.top.forkX);
    game.player.x = returned!.x; ticks(game, 2);
    expect(game.coins.has(returned!.id)).toBe(false);
    expect(game.coinScore).toBeGreaterThan(0);
  });
  it('converts once on geometric impact, not at merge start or midair, then bounces and separates copies', () => {
    const game = new Simulation();
    for (let d = 0; d < 4; d++) { game.branch(['0:0']); settle(game); }
    game.stage('0:0');
    const receivingDepth = game.depth - 1;
    game.merge(); ticks(game, 10);
    expect(game.destructionScore).toBe(0); expect(game.coins.size).toBe(0);
    for (let n = 0; n < 30 && !game.coins.size; n++) game.step();
    expect(game.coins.size).toBeGreaterThan(0);
    const target = game.pose(encounters(game.seed, 0)[0]!);
    expect(game.surfaceAt(game.depth, target.x).height).toBeLessThanOrEqual(game.surfaceAt(receivingDepth, target.x).height + 17);
    expect(game.events.filter(event => event === 'destroy')).toHaveLength(1);
    settle(game);
    ticks(game, 80, { ...idle, merge: true });
    expect(game.depth).toBe(0); expect(game.destructionScore).toBe(400); expect(game.awarded.size).toBe(4);
    const before = [...game.coins.values()].map(coin => ({ ...coin }));
    game.setPaused(true); ticks(game, 60);
    expect([...game.coins.values()]).toEqual(before);
    game.setPaused(false); ticks(game, 180);
    const coins = [...game.coins.values()];
    expect(coins).toHaveLength(12);
    expect(new Set(coins.map(coin => Math.round(coin.x))).size).toBeGreaterThan(6);
    for (let i = 0; i < coins.length; i++) for (let j = i + 1; j < coins.length; j++) {
      expect(Math.hypot(coins[i]!.x - coins[j]!.x, coins[i]!.y - coins[j]!.y)).toBeGreaterThan(7.7);
    }
    expect(game.coinPhysicsCount).toBeLessThanOrEqual(96);
    expect(game.coinPairChecks).toBeLessThanOrEqual(96 * 32);
    game.player.x = coins[0]!.x; ticks(game, 30);
    const score = game.coinScore; expect(score).toBeGreaterThan(0);
    ticks(game, 20, { ...idle, move: -1 }); ticks(game, 20, { ...idle, move: 1 });
    expect(game.coinScore).toBeGreaterThanOrEqual(score);
    expect(game.awarded.size).toBe(4);
  });
});
