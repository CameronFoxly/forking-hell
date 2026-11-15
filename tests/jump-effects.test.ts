import { describe, expect, it } from 'vitest';
import { MAX_JUMP_PARTICLES, Simulation, STEP } from '../src/simulation';
import { DEFAULTS, JUMP_EFFECT_SECTIONS, parseTuning, tuningDocument } from '../src/tuning';

const idle = { move: 0, jump: false, branch: false, merge: false };
const held = { ...idle, jump: true };
const ticks = (game: Simulation, count: number, input = idle) => { for (let n = 0; n < count; n++) game.step(input); };

describe('one fresh-press air jump', () => {
  it.each([
    [DEFAULTS.physics.gravity, DEFAULTS.physics.jumpHeight, false],
    [DEFAULTS.physics.gravity, DEFAULTS.physics.jumpHeight, true],
    [150, 120, false], [1800, 12, true],
  ] as const)('measures the second launch envelope at gravity %i, height %i, falling=%s', (gravity, height, falling) => {
    const peaks = [];
    for (const hold of [1, 3, 6, 1000]) {
      const game = new Simulation();
      game.config.physics.gravity = gravity; game.config.physics.jumpHeight = height;
      game.step(held);
      if (falling) while (game.player.vy > 0) game.step(held);
      else ticks(game, 1, held);
      game.step();
      expect(game.player.grounded).toBe(false);
      const origin = game.playerWorldY;
      let peak = 0;
      for (let n = 0; n < 300; n++) {
        game.step(n < hold ? held : idle);
        peak = Math.max(peak, game.playerWorldY - origin);
      }
      expect(game.events.filter(event => event === 'jump')).toHaveLength(2);
      expect(Math.abs(peak - height / (hold === 1 ? 2 : 1))).toBeLessThan(hold === 1 || hold === 1000 ? .15 : height);
      peaks.push(peak);
    }
    expect(peaks).toEqual([...peaks].sort((a, b) => a - b));
  });

  it('ignores held/third jumps, preserves the spent air jump through forks/merges, and replenishes only on contact', () => {
    const game = new Simulation();
    ticks(game, 2, held); game.step(); game.step(held);
    expect(game.airJumpAvailable).toBe(false);
    game.branch(); while (game.transition) game.step(held);
    game.merge(); while (game.transition) game.step(held);
    expect(game.player.grounded).toBe(false);
    expect(game.airJumpAvailable).toBe(false);
    game.step(); game.step(held);
    expect(game.events.filter(event => event === 'jump')).toHaveLength(2);
    ticks(game, 180, held);
    expect(game.player.grounded).toBe(true);
    expect(game.airJumpAvailable).toBe(true);
    expect(game.events.filter(event => event === 'jump')).toHaveLength(2);
    game.step(); game.step(held);
    expect(game.events.filter(event => event === 'jump')).toHaveLength(3);
    expect(game.airJumpAvailable).toBe(true);
  });

  it('honors a release/repress between fixed ticks without treating held input as another press', () => {
    const game = new Simulation();
    game.step({ ...held, jumpPressed: true });
    game.step({ ...held, jumpPressed: false });
    expect(game.airJumpAvailable).toBe(true);
    game.step({ ...held, jumpPressed: true });
    expect(game.airJumpAvailable).toBe(false);
    game.setPaused(true); ticks(game, 60, held);
    expect(game.airJumpAvailable).toBe(false);
    game.setPaused(false); game.step(held);
    expect(game.events.filter(event => event === 'jump')).toHaveLength(2);
  });
});

describe('world-anchored jump particles', () => {
  it('captures launch origins, survives removed supports, and uses only forward unpaused lifetime', () => {
    const game = new Simulation();
    game.config.jumpTrail.rate = 0;
    for (const settings of [game.config.jumpBurst, game.config.doubleJumpBurst]) {
      settings.spread = 0; settings.speed = 0; settings.life = 1;
    }
    game.branch(); while (game.transition) game.step();
    const firstOrigin = game.playerWorldY;
    game.step(held);
    const first = game.jumpParticles.find(particle => particle.kind === 'first')!;
    expect(first.x).toBe(game.player.x); expect(first.y).toBe(firstOrigin + 1);
    game.step(); const secondOrigin = game.playerWorldY; game.step(held);
    expect(game.jumpParticles.filter(particle => particle.kind === 'second')).toHaveLength(DEFAULTS.doubleJumpBurst.count);
    expect(game.jumpParticles.find(particle => particle.kind === 'second')!.y).toBe(secondOrigin + 1);
    game.merge(); while (game.transition) game.step(held);
    expect(game.depth).toBe(0); expect(game.jumpParticles).toContain(first);
    expect(first.y).toBe(firstOrigin + 1);
    expect(game.jumpParticlePose(first).y).toBeCloseTo(first.y - 40 * (game.realTime - first.bornAt) ** 2);
    const before = game.jumpParticlePose(first);
    game.time -= 20; expect(game.jumpParticlePose(first)).toEqual(before);
    game.setPaused(true); ticks(game, 120);
    expect(game.jumpParticlePose(first)).toEqual(before);
    game.setPaused(false); ticks(game, 90);
    expect(game.jumpParticles).toHaveLength(0);
  });

  it('bounds dense repeated emission and supports independent zero/reduced settings', () => {
    const game = new Simulation();
    game.config.physics.gravity = 1800; game.config.physics.jumpHeight = 12;
    game.config.jumpBurst.count = 24; game.config.doubleJumpBurst.count = 24;
    game.config.jumpBurst.life = 1; game.config.doubleJumpBurst.life = 1;
    game.config.jumpTrail.rate = 60; game.config.jumpTrail.life = 1;
    let maximum = 0;
    for (let n = 0; n < 360; n++) {
      game.step(n % 2 ? idle : held);
      maximum = Math.max(maximum, game.jumpParticles.length);
      expect(game.jumpParticles.length).toBeLessThanOrEqual(MAX_JUMP_PARTICLES);
    }
    expect(maximum).toBe(MAX_JUMP_PARTICLES);
    game.config.jumpBurst.count = 0; game.config.doubleJumpBurst.size = 0; game.config.jumpTrail.rate = 0;
    game.step(); expect(game.jumpParticles).toHaveLength(0);
    for (let n = 0; n < 60; n++) game.step(n % 2 ? idle : held);
    expect(game.jumpParticles).toHaveLength(0);
    const reduced = new Simulation();
    for (let n = 0; n < 30; n++) reduced.step(n % 2 ? idle : held, STEP, true);
    expect(reduced.jumpParticles).toHaveLength(0);
    expect(reduced.events).toContain('jump');
  });
});

describe('jump-effect preset migration', () => {
  it('adds only new defaults to complete v2 presets and rejects partial/mixed schemas', () => {
    const old: Record<string, unknown> = structuredClone(DEFAULTS);
    for (const section of JUMP_EFFECT_SECTIONS) delete old[section];
    old.character = { ...DEFAULTS.character, speed: 135 };
    const source = { format: 'forking-hell-tuning', version: 2, values: old };
    const migrated = parseTuning(source);
    expect(migrated).toEqual({ ...old, jumpBurst: DEFAULTS.jumpBurst, doubleJumpBurst: DEFAULTS.doubleJumpBurst, jumpTrail: DEFAULTS.jumpTrail });
    expect(tuningDocument(migrated).version).toBe(3);
    expect(() => parseTuning({ ...source, values: { ...old, jumpTrail: DEFAULTS.jumpTrail } })).toThrow();
    expect(() => parseTuning({ ...source, version: 3 })).toThrow();
    expect(() => parseTuning(tuningDocument({ ...DEFAULTS, jumpBurst: { ...DEFAULTS.jumpBurst, count: 1.5 } }))).toThrow();
  });
});
