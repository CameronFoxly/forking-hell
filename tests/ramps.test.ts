import { describe, expect, it } from 'vitest';
import { LANE, Simulation, SPEED, STEP, UNIT } from '../src/simulation';

const input = (move: number, jump = false) => ({ move, jump, branch: false, merge: false });
function settle(game: Simulation): void { for (let i = 0; i < 24; i++) game.step(); }

describe('one-unit collidable fork surfaces', () => {
  it('continuously joins the parent and child at both endpoints, with no horizontal support inside the ramp', () => {
    const game = new Simulation();
    game.branch(); settle(game);
    const x = game.top.forkX;
    expect(game.surfaceAt(1, x - 0.001).height).toBe(0);
    expect(game.surfaceAt(1, x).height).toBe(0);
    expect(game.surfaceAt(1, x + UNIT / 2).height).toBe(LANE / 2);
    expect(game.surfaceAt(1, x + UNIT).height).toBe(LANE);
    expect(game.surfaceAt(1, x + UNIT + 0.001).height).toBe(LANE);
  });
  it('walks down and up the actual diagonal without losing contact or pinning at the fork', () => {
    const game = new Simulation();
    game.branch(); settle(game);
    const initial = game.player.x;
    for (let i = 0; i < 20; i++) {
      game.step(input(-1));
      expect(game.playerWorldY).toBeCloseTo(game.surfaceAt(1, game.player.x).height);
      expect(game.player.grounded).toBe(true);
    }
    expect(game.currentDepth).toBe(0);
    for (let i = 0; i < 20; i++) game.step(input(1));
    expect(game.player.x).toBeCloseTo(initial);
    expect(game.playerWorldY).toBeCloseTo(LANE);
    expect(game.time).toBeCloseTo(0);
  });
  it.each([-1, 1])('jumps and lands on the slope while moving %i', direction => {
    const game = new Simulation();
    game.branch(); settle(game);
    game.player.x = game.top.forkX + UNIT / 2;
    game.step(input(direction, true));
    expect(game.player.grounded).toBe(false);
    game.step(input(direction));
    for (let i = 0; i < 70; i++) game.step();
    expect(game.player.grounded).toBe(true);
    expect(game.playerWorldY).toBeCloseTo(game.surfaceAt(1, game.player.x).height);
    expect(game.events.filter(e => e === 'land')).toHaveLength(1);
  });
  it('removes a collapsed ramp and preserves nested junctions without stale colliders', () => {
    const game = new Simulation();
    game.branch(); settle(game);
    game.branch(); settle(game);
    const x = game.top.forkX;
    expect(game.surfaceAt(2, x).height).toBe(game.surfaceAt(1, x).height);
    game.player.x = x + UNIT / 2;
    const time = game.time;
    game.merge(); settle(game);
    expect(game.surfaceAt(1, game.player.x).height).toBe(LANE / 2);
    expect(game.playerWorldY).toBe(LANE / 2);
    expect(game.time).toBe(time);
    game.merge(); settle(game);
    expect(game.playerWorldY).toBe(0);
    game.step(input(1));
    expect(game.player.x).toBeCloseTo(x + UNIT / 2 + SPEED * STEP);
  });
});
