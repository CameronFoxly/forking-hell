import { describe, expect, it } from 'vitest';
import { ATTACK_RANGE, encounters, hazardPose, PLAYER_HEIGHT, PLAYER_WIDTH, SHOT_LIFE, shotPosition, Simulation, SPEED, STEP, sweptHit, UNIT } from '../src/simulation';
import type { Input } from '../src/simulation';

const idle: Input = { move: 0, jump: false, branch: false, merge: false };
function run(game: Simulation, seconds: number, input: Partial<Input> = {}): void {
  for (let i = 0; i < Math.round(seconds / STEP); i++) game.step({ ...idle, ...input });
}
function settle(game: Simulation): void { run(game, 0.4); }

describe('independent player and environmental clocks', () => {
  it('advances and reverses by actual controlled displacement, with live gravity while frozen', () => {
    const game = new Simulation();
    run(game, 0.5, { move: 1 });
    expect(game.time).toBeCloseTo(0.5);
    run(game, 0.5, { move: -1 });
    expect(game.time).toBeCloseTo(0);
    game.step({ ...idle, jump: true });
    expect(game.player.y).toBeGreaterThan(0);
    run(game, 1);
    expect(game.player.y).toBe(0);
    expect(game.time).toBeCloseTo(0);
    expect(game.distanceScore).toBe(5);
  });

  it('freezes at a blocked left boundary and pauses both clocks', () => {
    const game = new Simulation();
    game.player.x = PLAYER_WIDTH / 2;
    run(game, 1, { move: -1 });
    expect(game.time).toBe(0);
    game.setPaused(true);
    run(game, 1, { move: 1, jump: true });
    expect(game.realTime).toBeCloseTo(1);
    expect(game.player.x).toBe(PLAYER_WIDTH / 2);
  });

  it('freezes against a solid gate rather than advancing on held input', () => {
    const game = new Simulation();
    let gate;
    for (let c = 1; c < 30 && !gate; c++) gate = encounters(game.seed, c).find(h => h.kind === 'gate');
    if (!gate) throw new Error('Seed lacks a gate');
    game.time = (Math.PI / 2 - gate.phase) * gate.period / (2 * Math.PI);
    game.player.x = gate.x - 26;
    game.player.invulnerable = 100;
    const time = game.time;
    run(game, 1, { move: 1 });
    expect(game.time).toBe(time);
    expect(game.player.x).toBe(gate.x - 26);
    expect(game.direction).toBe(0);
  });

  it('does not advance environmental time for lift/collapse and allows airborne operations', () => {
    const game = new Simulation();
    game.step({ ...idle, jump: true, branch: true });
    expect(game.player.y).toBeGreaterThan(0);
    settle(game);
    expect(game.time).toBe(0);
    expect(game.merge()).toBe(true);
    settle(game);
    expect(game.time).toBe(0);
    expect(game.player.y).toBe(0);
  });

  it('can land on a stationary hazard and grants brief invulnerability', () => {
    const game = new Simulation();
    game.player.x = 232;
    game.player.y = 50;
    game.player.grounded = false;
    run(game, 0.5);
    expect(game.player.health).toBe(2);
    run(game, 0.5);
    expect(game.player.health).toBe(2);
    expect(game.time).toBe(0);
  });
});

describe('branch and permanent transaction loop', () => {
  it('forks one world unit behind, serializes transitions, and edge triggers held inputs', () => {
    const game = new Simulation();
    run(game, 1, { branch: true });
    expect(game.depth).toBe(1);
    expect(game.top.forkX).toBe(64 - UNIT);
    expect(game.branch()).toBe(true);
    expect(game.merge()).toBe(false);
  });

  it('keeps the exact one-unit offset even next to an existing fork', () => {
    const game = new Simulation();
    game.branch(); settle(game);
    game.player.x = game.top.forkX;
    const x = game.player.x;
    game.branch();
    expect(game.top.forkX).toBe(x - UNIT);
    settle(game);
    game.player.x = game.top.forkX;
    const time = game.time;
    game.merge(); settle(game);
    expect(game.time).toBe(time);
    expect(game.player.x).toBe(x - UNIT);
  });

  it('stages once and merges exactly one level, carrying the relationship toward main', () => {
    const game = new Simulation();
    game.branch(); settle(game);
    game.stage('0:1');
    game.branch(); settle(game);
    expect(game.stage('0:0')).toBe(true);
    expect(game.stage('0:0')).toBe(false);
    game.merge(); settle(game);
    expect(game.depth).toBe(1);
    expect(game.top.staged.has('0:0')).toBe(true);
    expect(game.top.staged.has('0:1')).toBe(true);
    expect(game.top.converted.has('0:0')).toBe(true);
    expect(game.branches[0]!.converted.size).toBe(0);
    game.merge(); settle(game);
    expect(game.branches[0]!.converted).toEqual(new Set(['0:0', '0:1']));
    expect(game.destructionScore).toBe(300);
    expect(game.coins.size).toBe(9);
    expect([...game.coins.values()].every(c => c.branchId === 0)).toBe(true);
  });

  it('keeps unstaged hazards dangerous and never resurrects converted targets or duplicates rewards', () => {
    const game = new Simulation();
    game.branch(); settle(game);
    game.stage('0:0'); game.merge(); settle(game);
    const target = encounters(game.seed, 0)[0]!;
    const unstaged = encounters(game.seed, 0)[1]!;
    expect(game.isOrdinaryActive(0, target)).toBe(false);
    expect(game.isOrdinaryActive(0, unstaged)).toBe(true);
    game.branch(); settle(game);
    expect(game.stage('0:0')).toBe(false);
    game.merge(); settle(game);
    expect(game.destructionScore).toBe(100);
  });

  it('awards each branch copy, not a lineage-wide budget', () => {
    const game = new Simulation();
    game.branch(); settle(game);
    game.branch(); settle(game);
    game.stage('0:0'); game.merge(); settle(game);
    expect(game.destructionScore).toBe(100);
    game.merge(); settle(game);
    expect(game.destructionScore).toBe(200);
  });

  it('permanently collects coins with forward-only drop motion under frozen/reversed environment', () => {
    const game = new Simulation();
    game.branch(); settle(game);
    game.stage('0:0'); game.merge();
    expect(game.coins.size).toBe(0);
    settle(game);
    const coin = [...game.coins.values()][0]!;
    run(game, 1);
    expect(game.coinY(coin)).toBe(5);
    game.player.x = coin.x;
    settle(game);
    const score = game.coinScore;
    expect(score).toBeGreaterThan(0);
    run(game, 0.2, { move: -1 }); run(game, 0.2, { move: 1 });
    expect(game.coinScore).toBe(score);
  });
});

describe('reversible hazards and stable projectile identities', () => {
  it('uses analytic poses and deterministic chunk reentry', () => {
    const def = encounters(123, 10);
    expect(def).toEqual(encounters(123, 10));
    expect(def).not.toEqual(encounters(124, 10));
    const hazard = def[0]!;
    expect(hazardPose(hazard, -2)).toEqual(hazardPose(hazard, -2));
    const game = new Simulation(123);
    const first = game.nearby(4800, 5280);
    for (let i = 30; i < 100; i++) game.nearby(i * 480, i * 480 + 480);
    expect(game.chunks.size).toBeLessThanOrEqual(24);
    expect(game.nearby(4800, 5280)).toEqual(first);
  });

  it('returns shots to the muzzle across birth and restores flight across expiry', () => {
    const shot = { id: '0/1:0/0', sourceId: '1:0', branchId: 0, birth: 2, x: 500, y: 12, vx: -86, vy: 0 };
    expect(shotPosition(shot, 2 - STEP)).toBeNull();
    expect(shotPosition(shot, 2)).toEqual({ x: 500, y: 12 });
    expect(shotPosition(shot, 2 + SHOT_LIFE)).toBeNull();
    expect(shotPosition(shot, 2 + SHOT_LIFE - STEP)).not.toBeNull();
    expect(sweptHit(-30, 0, 30, 0, 9, 11)).toBe(true);
    expect(sweptHit(30, 0, -30, 0, 9, 11)).toBe(true);
    expect(sweptHit(-30, 30, 30, 30, 9, 11)).toBe(false);
  });

  it('retains active shooters on all layers and stable history after conversion', () => {
    const game = new Simulation();
    const shooter = encounters(game.seed, 1)[0]!;
    game.player.x = shooter.x - ATTACK_RANGE + 60;
    game.branch(); settle(game);
    expect(game.isOrdinaryActive(1, shooter)).toBe(true);
    expect(game.isOrdinaryActive(0, shooter)).toBe(true);
    game.time = shooter.phase + 0.2;
    game.step();
    const ids = [...game.shots.keys()];
    expect(ids.length).toBeGreaterThan(0);
    run(game, 0.1, { move: -1 }); run(game, 0.1, { move: 1 });
    expect([...game.shots.keys()]).toEqual(ids);
    game.stage(shooter.id); game.merge(); settle(game);
    expect([...game.shots.values()].some(s => s.branchId === 0)).toBe(true);
  });

  it('aims lower-layer shots at the upper player and preserves their launch across reversal', () => {
    const game = new Simulation();
    const shooter = encounters(game.seed, 1)[0]!;
    game.player.x = shooter.x - 90;
    game.branch(); settle(game);
    game.time = shooter.phase;
    game.step();
    const shot = [...game.shots.values()].find(s => s.branchId === 0 && s.birth === shooter.phase)!;
    expect(shot.vy).toBeGreaterThan(0);
    const launch = { ...shot };
    const travel = Math.hypot(game.player.x - shot.x, game.playerWorldY + PLAYER_HEIGHT / 2 - shot.y) / 86;
    game.time = shot.birth + travel;
    game.step();
    expect(game.player.health).toBeLessThan(3);
    game.time = shot.birth - STEP;
    game.step();
    expect(game.shots.get(shot.id)).toEqual(launch);
  });

  it('does not grant renewable invulnerability from branch/merge transitions', () => {
    const game = new Simulation();
    for (let i = 0; i < 4; i++) {
      game.branch();
      expect(game.player.invulnerable).toBe(0);
      settle(game);
      game.merge();
      expect(game.player.invulnerable).toBe(0);
      settle(game);
    }
  });

  it('damages real lower-lane overlaps during a lift instead of using the destination lane', () => {
    const game = new Simulation();
    game.player.x = 232;
    game.branch();
    game.step();
    expect(game.currentDepth).toBe(1);
    expect(game.transition).not.toBeNull();
    expect(game.playerWorldY).toBeLessThan(17);
    expect(game.player.health).toBe(2);
  });

  it('checks the falling body, not an early destination overlap, during an unstaged merge', () => {
    const game = new Simulation();
    game.branch(); settle(game);
    game.player.x = 232;
    game.merge();
    run(game, 0.1);
    expect(game.player.health).toBe(3);
    run(game, 0.2);
    expect(game.transition).not.toBeNull();
    expect(game.player.health).toBe(3);
    game.step();
    expect(game.player.health).toBe(2);
  });

  it('keeps an overlapping source-lane gate solid and the clock frozen during a lift', () => {
    const game = new Simulation();
    let gate;
    for (let c = 1; c < 30 && !gate; c++) gate = encounters(game.seed, c).find(h => h.kind === 'gate');
    if (!gate) throw new Error('Seed lacks a gate');
    game.time = (Math.PI / 2 - gate.phase) * gate.period / (2 * Math.PI);
    game.player.x = gate.x - 26;
    const time = game.time;
    game.branch();
    run(game, 0.05, { move: 1 });
    expect(game.transition).not.toBeNull();
    expect(game.player.x).toBe(gate.x - 26);
    expect(game.time).toBe(time);
    expect(game.direction).toBe(0);
    run(game, 0.3, { move: 1 });
    expect(game.player.x).toBeGreaterThan(gate.x - 26);
    expect(game.time).toBeGreaterThan(time);
  });

  it('cannot avoid ordinary contact damage indefinitely by chaining branches and merges', () => {
    const game = new Simulation();
    game.time = 0.9;
    game.player.x = 256;
    for (let i = 0; i < 8 && !game.gameOver; i++) {
      game.branch(); settle(game);
      game.merge(); settle(game);
    }
    expect(game.player.health).toBe(0);
    expect(game.gameOver).toBe(true);
  });

  it('retains live shooter body collision during a lift without relying on projectile damage', () => {
    const game = new Simulation();
    game.chunks.set(0, [{ id: '0:0', kind: 'shooter', x: 232, phase: 50, period: 100 }]);
    game.player.x = 232;
    game.branch(); game.step();
    expect(game.shots.size).toBe(0);
    expect(game.transition).not.toBeNull();
    expect(game.player.health).toBe(2);
  });

  it('detects a reverse-moving projectile hitting the player through an active branch transition', () => {
    const game = new Simulation();
    const shooter = encounters(game.seed, 1)[0]!;
    game.player.x = shooter.x - 80;
    game.time = shooter.phase;
    game.step();
    const shot = [...game.shots.values()].find(s => s.birth === shooter.phase)!;
    const travel = 80 / 86;
    game.time = shot.birth + travel + STEP;
    game.branch();
    expect(game.transition).not.toBeNull();
    game.step({ ...idle, move: -1 });
    expect(game.player.health).toBe(2);
  });

  it('retains offscreen and expired logical shots without processing the entire journal nearby', () => {
    const game = new Simulation();
    game.player.invulnerable = 100;
    for (let c = 1; c < 60; c++) {
      const shooter = encounters(game.seed, c).find(h => h.kind === 'shooter');
      if (!shooter) continue;
      game.player.x = shooter.x - 100;
      game.time = (game.player.x - 64) / SPEED;
      game.step();
    }
    const retained = game.shots.size;
    expect(retained).toBeGreaterThan(15);
    game.player.x = 64; game.time = 0;
    game.step();
    expect(game.shots.size).toBe(retained);
    expect(game.shotsNear(40, 90, -20, 30).size).toBe(0);
  });

  it.each([8, 64, 256])('supports depth %i without a gameplay cap or recursive stack traversal', depth => {
    const game = new Simulation();
    for (let i = 0; i < depth; i++) { game.branch(); settle(game); }
    expect(game.depth).toBe(depth);
    game.stage('0:0');
    for (let i = 0; i < depth; i++) { game.merge(); settle(game); }
    expect(game.depth).toBe(0);
    expect(game.destructionScore).toBe(depth * 100);
    expect(game.coins.size + game.coinScore / 25).toBe(depth * 3);
    expect(game.coinPhysicsCount).toBeLessThanOrEqual(96);
    expect(game.coinPairChecks).toBeLessThanOrEqual(96 * 32);
  });

  it('rejects a negative engine timestep', () => {
    expect(() => new Simulation().step(idle, -STEP)).toThrow();
  });
});
