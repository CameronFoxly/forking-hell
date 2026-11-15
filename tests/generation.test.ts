import { describe, expect, it } from 'vitest';
import { CHUNK, encounters, Simulation } from '../src/simulation';
import { DEFAULTS } from '../src/tuning';
import type { Encounter } from '../src/simulation';

const seeds = [1, 7, 19, 42, 73, 123, 456, 789, 1024, 4096, 8191, 65535, 100003, 123456, 987654, 0xffffffff];
const radius = (hazard: Encounter, patrolRange = 24): number => 13 + (hazard.kind === 'patrol' ? patrolRange : 0);
const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

function windowStats(start: number, end: number) {
  const gaps: number[] = [], clearances: number[] = [], counts = new Set<number>();
  let total = 0, shooters = 0;
  for (const seed of seeds) {
    const list = Array.from({ length: end - start }, (_, i) => {
      const chunk = encounters(seed, start + i);
      counts.add(chunk.length);
      return chunk;
    }).flat();
    total += list.length; shooters += list.filter(hazard => hazard.kind === 'shooter').length;
    for (let i = 1; i < list.length; i++) {
      const previous = list[i - 1]!, current = list[i]!;
      gaps.push(current.x - previous.x);
      clearances.push(current.x - previous.x - radius(previous) - radius(current));
    }
  }
  gaps.sort((a, b) => a - b);
  return {
    density: total / seeds.length / (end - start),
    shooterShare: shooters / total,
    centerGap: mean(gaps),
    edgeGap: mean(clearances),
    interquartileGap: gaps[Math.floor(gaps.length * .75)]! - gaps[Math.floor(gaps.length * .25)]!,
    counts,
  };
}

describe('distance-based encounter progression', () => {
  it('realizes a spacious, low-shooter opening and progressively denser, shooter-heavier windows', () => {
    const early = windowStats(0, 8), middle = windowStats(12, 20), late = windowStats(40, 48);
    expect(early.density).toBeLessThan(1.9);
    expect(early.shooterShare).toBeLessThan(.13);
    expect(middle.density).toBeGreaterThan(early.density * 1.35);
    expect(late.density).toBeGreaterThan(middle.density * 1.1);
    expect(middle.shooterShare).toBeGreaterThan(early.shooterShare * 2);
    expect(late.shooterShare).toBeGreaterThan(middle.shooterShare * 1.3);
    expect(late.shooterShare).toBeGreaterThan(.38);
    expect(early.centerGap).toBeGreaterThan(middle.centerGap * 1.25);
    expect(middle.centerGap).toBeGreaterThan(late.centerGap * 1.1);
    expect(early.edgeGap).toBeGreaterThan(late.edgeGap * 1.6);
    for (const window of [early, middle, late]) {
      expect(window.counts.size).toBeGreaterThan(1);
      expect(window.interquartileGap).toBeGreaterThan(50);
    }
    expect(seeds.filter(seed => encounters(seed, 1)[0]!.kind === 'shooter').length).toBeLessThan(4);
  });

  it.each([0, 24, 60])('preserves full motion-envelope clearance inside and across chunks at patrol radius %i', patrolRange => {
    const settings = { ...DEFAULTS.enemies, patrolRange };
    for (const seed of seeds) {
      let previous: Encounter | undefined;
      for (let chunk = 0; chunk < 80; chunk++) {
        const list = encounters(seed, chunk, settings);
        expect(list.length).toBeGreaterThanOrEqual(1);
        expect(list.length).toBeLessThanOrEqual(4);
        for (const hazard of list) {
          expect(hazard.x - radius(hazard, patrolRange)).toBeGreaterThanOrEqual(chunk * CHUNK + 20);
          expect(hazard.x + radius(hazard, patrolRange)).toBeLessThanOrEqual((chunk + 1) * CHUNK - 20);
          if (previous) {
            expect(hazard.x - previous.x - radius(hazard, patrolRange) - radius(previous, patrolRange)).toBeGreaterThanOrEqual(40);
            expect(hazard.x - previous.x).toBeLessThanOrEqual(640);
          }
          previous = hazard;
        }
      }
    }
  });

  it('regenerates exact identities after distant queries, rewind and recursive branch actions', () => {
    const game = new Simulation(123);
    const first = game.nearby(6 * CHUNK, 9 * CHUNK);
    for (let chunk = 40; chunk < 80; chunk++) game.nearby(chunk * CHUNK, (chunk + 1) * CHUNK);
    expect(game.chunks.size).toBeLessThanOrEqual(24);
    game.player.x = 7 * CHUNK;
    game.branch(); while (game.transition) game.step();
    game.branch(); while (game.transition) game.step();
    game.merge(); while (game.transition) game.step();
    for (let n = 0; n < 90; n++) game.step({ move: -1, jump: false, branch: false, merge: false });
    expect(game.nearby(6 * CHUNK, 9 * CHUNK)).toEqual(first);
    expect(encounters(123, 12)).not.toEqual(encounters(456, 12));
    expect(encounters(123, -1)).toEqual([]);
  });
});
