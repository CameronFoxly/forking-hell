import { describe, expect, it } from 'vitest';
import { Simulation, STEP } from '../src/simulation';
import { firstShooter, SHOOTER_SEED } from './encounter-fixtures';

const right = { move: 1, jump: false, branch: false, merge: false };
function settle(game: Simulation): void {
  for (let n = 0; n < 120 && game.transition; n++) game.step();
  expect(game.transition).toBeNull();
}
function scene(depth: number) {
  const game = new Simulation(SHOOTER_SEED), shooter = firstShooter();
  game.player.x = shooter.x - 100;
  game.player.invulnerable = 100;
  for (let d = 0; d < depth; d++) { game.branch([shooter.id]); settle(game); }
  return { game, shooter };
}
function emit(game: Simulation, birth: number): void {
  game.time = birth - STEP / 2; game.step(right);
}

describe('projectile emission and permanent source lifetime', () => {
  it('does not backfill pre-existing flight when a copy is forked while time is held', () => {
    const { game, shooter } = scene(1);
    game.time = shooter.phase + .5;
    game.branch([shooter.id]); const copy = game.top.id; settle(game);
    expect([...game.shots.values()].filter(shot => shot.branchId === copy)).toEqual([]);
  });

  it.each(['branch', 'merge'] as const)('records lower-copy muzzles during a nested %s, not the moving top lane', kind => {
    const { game, shooter } = scene(2);
    if (kind === 'branch') game.branch([shooter.id]); else game.merge();
    for (let n = 0; n < 5; n++) game.step();
    const depth = game.depth - 1, copy = game.branches[depth]!.id;
    const eventAge = game.transition!.age + STEP / 2;
    const expected = game.surfaceAt(depth, shooter.x, eventAge).height + 12;
    emit(game, shooter.phase);
    const shot = [...game.shots.values()].find(s => s.branchId === copy && s.birth === shooter.phase)!;
    expect(shot.x).toBe(shooter.x); expect(shot.y).toBeCloseTo(expected, 8);
    const launch = { ...shot };
    game.step();
    expect(shot).toEqual(launch);
  });

  it.each(['crossing', 'boundary'])('re-emits a living copy at the birth %s from its new muzzle, with the same identity and direction', boundary => {
    const { game, shooter } = scene(1);
    game.branch([shooter.id]); game.step();
    const copy = game.branches[1]!.id;
    emit(game, shooter.phase);
    const shot = [...game.shots.values()].find(s => s.branchId === copy && s.birth === shooter.phase)!;
    const launch = { ...shot };
    settle(game);
    expect(shot).toEqual(launch);
    const count = game.shots.size;
    game.time = boundary === 'crossing' ? shooter.phase - STEP : shooter.phase; game.step();
    if (boundary === 'crossing') emit(game, shooter.phase); else game.step(right);
    expect(game.shots.size).toBe(count);
    expect(game.shots.get(shot.id)!.y).toBeCloseTo(game.surfaceAt(1, shooter.x).height + 12);
    expect(game.shots.get(shot.id)!.vx).toBe(launch.vx);
    expect(game.shots.get(shot.id)!.vy).toBe(launch.vy);
  });

  it.each(['birth', 'expiry'])('keeps converted-source flight only until %s, without ghost replay or affecting main', boundary => {
    const { game, shooter } = scene(2);
    emit(game, shooter.phase);
    const parent = [...game.shots.values()].find(s => s.branchId === game.branches[1]!.id && s.birth === shooter.phase)!;
    const main = [...game.shots.values()].find(s => s.branchId === 0 && s.birth === shooter.phase)!;
    game.stage(shooter.id); game.merge(); settle(game);
    expect(game.shotPose(parent)).not.toBeNull();
    game.time = boundary === 'birth' ? shooter.phase : shooter.phase + game.config.enemies.shotLife; game.step();
    game.time = shooter.phase + .2; game.step();
    expect(game.shotPose(parent)).toBeNull();
    expect(game.shotsNear(shooter.x - 300, shooter.x + 300, -300, 300).has(parent)).toBe(false);
    expect(game.shotPose(main)).not.toBeNull();
    game.player.x = parent.x + parent.vx * .2;
    game.player.invulnerable = 0; const health = game.player.health;
    game.step({ ...right, move: -1 }); expect(game.player.health).toBe(health);
    for (let c = 30; c < 70; c++) game.nearby(c * 480, (c + 1) * 480);
    const count = game.shots.size;
    emit(game, shooter.phase + shooter.period);
    expect(game.shots.size).toBe(count + 1);
    expect([...game.shots.values()].filter(s => s.birth === shooter.phase + shooter.period).map(s => s.branchId)).toEqual([0]);
  });

  it('does not revive shots that had already expired when their source was destroyed', () => {
    const { game, shooter } = scene(2);
    emit(game, shooter.phase);
    const shot = [...game.shots.values()].find(s => s.branchId === game.branches[1]!.id && s.birth === shooter.phase)!;
    game.time = shooter.phase + game.config.enemies.shotLife + .2;
    game.stage(shooter.id); game.merge(); settle(game);
    game.time = shot.birth + game.config.enemies.shotLife - .1; game.step();
    expect(game.shotPose(shot)).toBeNull();
  });

  it('keeps top copies absent, stages at ordinary switch height, and keeps main dangerous', () => {
    const { game, shooter } = scene(1);
    expect(game.isOrdinaryActive(1, shooter)).toBe(false);
    expect(game.isOrdinaryActive(0, shooter)).toBe(true);
    emit(game, shooter.phase);
    expect([...game.shots.values()].map(shot => shot.branchId)).toEqual([0]);
    game.player.x = shooter.x; game.player.invulnerable = 0;
    game.step();
    expect(game.top.staged.has(shooter.id)).toBe(true);
    expect(game.player.health).toBe(3);
    const main = scene(0).game;
    main.player.x = shooter.x; main.player.invulnerable = 0; main.step();
    expect(main.player.health).toBe(2);
  });

  it('retires absent-top replay without converting the living copy and re-enables it only on a genuine lower-source crossing', () => {
    const { game, shooter } = scene(2);
    emit(game, shooter.phase);
    const parent = game.branches[1]!.id;
    const shot = [...game.shots.values()].find(shot => shot.branchId === parent)!;
    game.merge(); settle(game);
    expect(game.isConverted(1, shooter.id)).toBe(false);
    expect(game.shotPose(shot)).not.toBeNull();
    emit(game, shooter.phase + shooter.period);
    expect([...game.shots.values()].filter(shot => shot.birth === shooter.phase + shooter.period).map(shot => shot.branchId)).toEqual([0]);
    game.time = shooter.phase; game.step();
    expect(game.shotPose(shot)).toBeNull();
    emit(game, shooter.phase);
    expect(game.shotPose(shot)).toBeNull();
    game.branch([shooter.id]); settle(game);
    expect(game.shotPose(shot)).toBeNull();
    emit(game, shooter.phase);
    expect(game.shots.get(shot.id)).toBe(shot);
    expect(game.shotPose(shot)).not.toBeNull();
    expect([...game.shots.values()].some(shot => shot.branchId === game.top.id)).toBe(false);
  });

  it('lets removed-copy airborne flight finish, then clears every index without reusing its owner', () => {
    const { game, shooter } = scene(2);
    emit(game, shooter.phase); const removed = game.branches[1]!.id;
    const shot = [...game.shots.values()].find(shot => shot.branchId === removed)!;
    game.merge(); settle(game); game.merge(); settle(game);
    expect(game.depth).toBe(0);
    expect(game.shotPose(shot)).not.toBeNull();
    game.time = shooter.phase + game.config.enemies.shotLife; game.step();
    expect([...game.shots.values()].some(s => s.branchId === removed)).toBe(false);
    expect([...game.shotsNear(shooter.x - 300, shooter.x + 300, -300, 300)].some(s => s.branchId === removed)).toBe(false);
    game.branch([shooter.id]); settle(game);
    expect(game.top.id).not.toBe(removed);
    expect([...game.shots.values()].some(s => s.branchId === game.top.id)).toBe(false);
    emit(game, shooter.phase + shooter.period);
    expect([...game.shots.values()].some(s => s.branchId === game.top.id)).toBe(false);
    expect([...game.shots.values()].some(s => s.branchId === 0 && s.birth === shooter.phase + shooter.period)).toBe(true);
  });
});
