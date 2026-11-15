import { describe, expect, it } from 'vitest';
import { encounters, Simulation, STEP } from '../src/simulation';

const right = { move: 1, jump: false, branch: false, merge: false };
function settle(game: Simulation): void { while (game.transition) game.step(); }
function scene(depth: number) {
  const game = new Simulation(123), shooter = encounters(123, 1)[0]!;
  game.player.x = shooter.x - 100;
  game.player.invulnerable = 100;
  for (let d = 0; d < depth; d++) { game.branch(); settle(game); }
  return { game, shooter };
}
function emit(game: Simulation, birth: number): void {
  game.time = birth - STEP / 2; game.step(right);
}

describe('projectile emission and permanent source lifetime', () => {
  it('does not backfill pre-existing flight when a copy is forked while time is held', () => {
    const { game, shooter } = scene(1);
    game.time = shooter.phase + .5;
    game.branch(); const copy = game.top.id; settle(game);
    expect([...game.shots.values()].filter(shot => shot.branchId === copy)).toEqual([]);
  });

  it.each(['branch', 'merge'] as const)('records the actual fractional muzzle on a nested %s and leaves airborne shots independent', kind => {
    const { game, shooter } = scene(2);
    if (kind === 'branch') game.branch(); else game.merge();
    for (let n = 0; n < 5; n++) game.step();
    const copy = game.top.id;
    const eventAge = game.transition!.age + STEP / 2;
    const expected = game.surfaceAt(game.depth, shooter.x, eventAge).height + 12;
    emit(game, shooter.phase);
    const shot = [...game.shots.values()].find(s => s.branchId === copy && s.birth === shooter.phase)!;
    expect(shot.x).toBe(shooter.x); expect(shot.y).toBeCloseTo(expected, 8);
    const launch = { ...shot };
    game.step();
    expect(shot).toEqual(launch);
  });

  it.each(['crossing', 'boundary'])('re-emits a living copy at the birth %s from its new muzzle, with the same identity and direction', boundary => {
    const { game, shooter } = scene(1);
    game.branch(); game.step();
    const copy = game.top.id;
    emit(game, shooter.phase);
    const shot = [...game.shots.values()].find(s => s.branchId === copy && s.birth === shooter.phase)!;
    const launch = { ...shot };
    settle(game);
    expect(shot).toEqual(launch);
    const count = game.shots.size;
    game.time = boundary === 'crossing' ? shooter.phase - STEP : shooter.phase; game.step();
    if (boundary === 'crossing') emit(game, shooter.phase); else game.step(right);
    expect(game.shots.size).toBe(count);
    expect(game.shots.get(shot.id)!.y).toBeCloseTo(game.surfaceAt(2, shooter.x).height + 12);
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

  it('removes a collapsed copy from all query indexes without reusing its depth as a new owner', () => {
    const { game, shooter } = scene(2);
    emit(game, shooter.phase); const removed = game.top.id;
    game.merge(); settle(game);
    expect([...game.shots.values()].some(s => s.branchId === removed)).toBe(false);
    expect([...game.shotsNear(shooter.x - 300, shooter.x + 300, -300, 300)].some(s => s.branchId === removed)).toBe(false);
    game.branch(); settle(game);
    expect(game.top.id).not.toBe(removed);
    expect([...game.shots.values()].some(s => s.branchId === game.top.id)).toBe(false);
    emit(game, shooter.phase + shooter.period);
    expect([...game.shots.values()].some(s => s.branchId === game.top.id)).toBe(true);
  });
});
