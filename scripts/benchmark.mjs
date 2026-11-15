import { performance } from 'node:perf_hooks';
import { arch, platform } from 'node:os';
import { Simulation, STEP, SPEED, CHUNK } from '../src/simulation.ts';

const input = { move: 0, jump: false, branch: false, merge: false };
console.log(JSON.stringify({ platform: platform(), arch: arch(), node: process.version }));
for (const depth of [8, 64, 256]) {
  const game = new Simulation();
  game.player.invulnerable = 1e9;
  for (let n = 0; n < depth; n++) {
    game.branch();
    while (game.transition) { game.step(); game.events.length = 0; }
  }
  game.player.x = 490;
  game.time = (game.player.x - 64) / SPEED;
  const durations = [];
  for (let n = 0; n < 5000; n++) {
    const start = performance.now();
    game.step({ ...input, move: n % 200 < 100 ? 1 : -1 }, STEP);
    game.events.length = 0;
    durations.push(performance.now() - start);
  }
  durations.sort((a, b) => a - b);
  const localShots = game.shotsNear(game.player.x - 30, game.player.x + 30, game.playerWorldY - 30, game.playerWorldY + 60).size;
  const retainedBefore = game.shots.size;
  for (let chunk = 1; chunk <= 200; chunk++) {
    game.player.x = chunk * CHUNK + 200;
    game.time = (game.player.x - 64) / SPEED;
    game.step(); game.events.length = 0;
  }
  console.log(JSON.stringify({
    depth, meanStepMs: durations.reduce((sum, value) => sum + value, 0) / durations.length,
    p95StepMs: durations[Math.floor(durations.length * .95)], localShots, retainedBefore,
    retainedAfter200Chunks: game.shots.size, cachedChunks: game.chunks.size,
  }));
}
