import { describe, expect, it } from 'vitest';
import { CHUNK, Simulation, STEP } from '../src/simulation';
import { firstShooter, SHOOTER_SEED } from './encounter-fixtures';

const right = { move: 1, jump: false, branch: false, merge: false };
function settle(game: Simulation): void {
  for (let n = 0; n < 120 && game.transition; n++) game.step();
  expect(game.transition).toBeNull();
}
function fire(game: Simulation, birth: number): void {
  game.time = birth - STEP / 2; game.step(right);
}

describe('immutable per-fork encounter coverage', () => {
  it('copies only the accepted visible IDs, never cache/lookahead, later queries or a rejected fork', () => {
    const game = new Simulation(123);
    const distant = game.nearby(2 * CHUNK, 6 * CHUNK);
    const visible = ['0:0'];
    game.step({ ...right, move: 0, branch: true, forkTargets: visible });
    const branch = game.top;
    visible.push(distant[0]!.id);
    expect(game.branch(distant.map(hazard => hazard.id))).toBe(false);
    settle(game);
    for (let chunk = 30; chunk < 70; chunk++) game.nearby(chunk * CHUNK, (chunk + 1) * CHUNK);
    game.time = -30; game.player.x = distant[0]!.x; game.step();
    expect([...branch.covered]).toEqual(['0:0']);
    expect(game.nearby(2 * CHUNK, 6 * CHUNK)).toEqual(distant);
    for (const hazard of distant) {
      expect(game.isOrdinaryActive(1, hazard)).toBe(true);
      expect(game.stage(hazard.id)).toBe(false);
    }
    expect(game.stage('0:0')).toBe(true);
    game.branch(); settle(game);
    expect(game.top.covered.size).toBe(0);
    expect(game.stage('0:0')).toBe(false);
  });

  it.each(['patrol', 'shooter'] as const)('keeps an uncovered top %s dangerous and unstageable', kind => {
    const game = new Simulation(SHOOTER_SEED);
    game.branch(['0:0']); settle(game);
    const target = game.nearby(CHUNK, 8 * CHUNK).find(hazard => hazard.kind === kind)!;
    game.player.x = game.pose(target).x;
    game.step();
    expect(game.currentDepth).toBe(1);
    expect(game.player.health).toBe(2);
    expect(game.isOrdinaryActive(1, target)).toBe(true);
    expect(game.top.staged.has(target.id)).toBe(false);
    expect(game.stage(target.id)).toBe(false);
  });

  it('lets a later visible fork stage and convert a formerly uncovered shooter, then carry its reward toward main', () => {
    const game = new Simulation(SHOOTER_SEED), shooter = firstShooter();
    game.branch(['0:0']); settle(game);
    const oldBranch = game.top;
    game.player.x = shooter.x - 90;
    fire(game, shooter.phase);
    expect([...game.shots.values()].filter(shot => shot.sourceId === shooter.id).map(shot => shot.branchId)).toEqual([0, oldBranch.id]);
    game.branch([shooter.id]); settle(game);
    expect(game.isSwitch(2, shooter.id)).toBe(true);
    expect(game.isOrdinaryActive(1, shooter)).toBe(true);
    const birth = shooter.phase + shooter.period;
    fire(game, birth);
    expect([...game.shots.values()].some(shot => shot.branchId === game.top.id)).toBe(false);
    game.player.x = shooter.x; game.step();
    expect(game.top.staged.has(shooter.id)).toBe(true);
    game.merge(); settle(game);
    expect(game.top).toBe(oldBranch);
    expect(oldBranch.covered.has(shooter.id)).toBe(false);
    expect(oldBranch.staged.has(shooter.id)).toBe(true);
    expect(game.isConverted(1, shooter.id)).toBe(true);
    game.player.x = shooter.x - 90;
    game.merge(); settle(game);
    expect(game.isConverted(0, shooter.id)).toBe(true);
    expect(game.destructionScore).toBe(200);
    expect(game.awarded.size).toBe(2);
  });

  it('restores an uncovered receiving top as dangerous without retiring its independent replay history', () => {
    const game = new Simulation(SHOOTER_SEED), shooter = firstShooter();
    game.branch(['0:0']); settle(game);
    const original = game.top;
    game.player.x = shooter.x - 90;
    fire(game, shooter.phase);
    const shot = [...game.shots.values()].find(shot => shot.branchId === original.id)!;
    game.branch([shooter.id]); settle(game);
    game.merge(); settle(game);
    expect(game.top).toBe(original);
    expect(game.isOrdinaryActive(1, shooter)).toBe(true);
    expect(game.stage(shooter.id)).toBe(false);
    game.time = shot.birth + game.config.enemies.shotLife; game.step();
    game.time = shot.birth + .2; game.step();
    expect(game.shotPose(shot)).not.toBeNull();
    expect(game.shotsNear(shooter.x - 300, shooter.x + 300, 0, 300).has(shot)).toBe(true);
    fire(game, shooter.phase + shooter.period);
    expect([...game.shots.values()].some(shot => shot.branchId === original.id && shot.birth === shooter.phase + shooter.period)).toBe(true);
  });

  it('keeps removed uncovered-top flight only until its next boundary and never reuses its source owner', () => {
    const game = new Simulation(SHOOTER_SEED), shooter = firstShooter();
    game.player.x = shooter.x - 90;
    game.branch(); settle(game);
    const removed = game.top.id;
    fire(game, shooter.phase);
    const shot = [...game.shots.values()].find(shot => shot.branchId === removed)!;
    game.merge(); settle(game);
    expect(game.shotPose(shot)).not.toBeNull();
    game.time = shot.birth; game.step();
    game.time = shot.birth + .2; game.step();
    expect(game.shotPose(shot)).toBeNull();
    expect(game.shots.has(shot.id)).toBe(false);
    game.branch([shooter.id]); settle(game);
    expect(game.top.id).not.toBe(removed);
    fire(game, shooter.phase + shooter.period);
    expect([...game.shots.values()].some(shot => shot.branchId !== 0)).toBe(false);
  });
});
