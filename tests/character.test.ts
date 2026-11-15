import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CharacterAnimation, parseCharacterAtlas } from '../src/character';
import { JUMP_HEIGHT, Simulation, STEP } from '../src/simulation';

const raw = JSON.parse(readFileSync(new URL('../public/assets/octocat.json', import.meta.url), 'utf8'));
const atlas = parseCharacterAtlas(raw, 130, 135);

describe('sprite-tester character contract', () => {
  it('uses named, untrimmed atlas clips and their durations rather than frameTags or alpha bounds', () => {
    expect(atlas.Walk[0]).toMatchObject({ x: 0, y: 27, w: 26, h: 27, duration: 60 });
    expect(atlas.Idle[0]!.duration).toBe(200);
    expect(atlas.Jump_Up[0]!.y).toBe(54);
    expect(atlas.JumpDown[0]!.y).toBe(81);
    expect(atlas.Land[0]!.y).toBe(108);
    expect(() => parseCharacterAtlas(raw, 140, 120)).toThrow();
    const missing = structuredClone(raw);
    delete missing.frames['GameSet_01 #Land.aseprite'];
    expect(() => parseCharacterAtlas(missing, 130, 135)).toThrow('Land');
    const bad = structuredClone(raw);
    bad.frames['GameSet_01 #Walk 0.aseprite'].duration = 0;
    expect(() => parseCharacterAtlas(bad, 130, 135)).toThrow();
  });

  it('shows launch once, loops the last two ascent/descent frames, and holds landing for 1/15s', () => {
    const animation = new CharacterAnimation(atlas);
    animation.jumped();
    animation.update(0.1, false, 200, 1);
    expect([animation.clip, animation.index]).toEqual(['Jump_Up', 0]);
    animation.afterDraw();
    expect(animation.index).toBe(1);
    for (const expected of [2, 3, 2, 3]) {
      animation.update(0.06, false, 100, 1);
      expect(animation.index).toBe(expected);
      animation.afterDraw();
    }
    animation.update(0.06, false, 0, -1);
    expect([animation.clip, animation.index]).toEqual(['JumpDown', 0]);
    for (const expected of [1, 2, 3, 2]) {
      animation.afterDraw(); animation.update(0.06, false, -100, -1);
      expect(animation.index).toBe(expected);
    }
    animation.landed(); animation.update(0.1, true, 0, -1);
    expect(animation.clip).toBe('Land');
    animation.afterDraw(); animation.update(1 / 30, true, 0, 1);
    expect(animation.clip).toBe('Land');
    animation.afterDraw(); animation.update(1 / 30, true, 0, 1);
    expect([animation.clip, animation.index]).toEqual(['Walk', 0]);
  });

  it('keeps current facing when stopped, loops Idle/Walk forward, and can jump during Land', () => {
    const animation = new CharacterAnimation(atlas);
    animation.update(0.1, true, 0, 0); animation.afterDraw();
    animation.update(0.1, true, 0, 0);
    expect([animation.clip, animation.index]).toEqual(['Idle', 1]);
    animation.update(0.06, true, 0, -1);
    expect([animation.clip, animation.index]).toEqual(['Walk', 0]);
    animation.update(0.06, true, 0, -1);
    expect(animation.index).toBe(1);
    animation.landed(); animation.jumped(); animation.update(0.1, false, 100, 0);
    expect([animation.clip, animation.index]).toEqual(['Jump_Up', 0]);
    const game = new Simulation();
    game.step({ move: -1, jump: false, branch: false, merge: false });
    game.step();
    expect(game.player.facing).toBe(-1);
  });

  it('matches the 38px kinematic jump and emits one airborne-to-grounded event', () => {
    const game = new Simulation();
    game.step({ move: 0, jump: true, branch: false, merge: false });
    let peak = game.player.y;
    for (let i = 0; i < 60; i++) { game.step(); peak = Math.max(peak, game.player.y); }
    expect(STEP).toBe(1 / 60);
    expect(peak).toBeCloseTo(JUMP_HEIGHT, 1);
    expect(game.events.filter(e => e === 'land')).toHaveLength(1);
    expect(game.player.grounded).toBe(true);
    expect(game.time).toBe(0);
  });
});
