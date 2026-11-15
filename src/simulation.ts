import { DEFAULTS } from './tuning';
import type { Tuning } from './tuning';

export const STEP = 1 / 60;
export const UNIT = 24;
export const LANE = 58;
export const SPEED = DEFAULTS.character.speed;
export const GRAVITY = DEFAULTS.physics.gravity;
export const JUMP_HEIGHT = DEFAULTS.physics.jumpHeight;
export const PLAYER_WIDTH = 26;
export const PLAYER_HEIGHT = 27;
export const CHUNK = 480;
export const SHOT_LIFE = 2.8;
export const SHOT_SPEED = DEFAULTS.enemies.shotSpeed;
export const ATTACK_RANGE = SHOT_LIFE * SHOT_SPEED + 30;

export type HazardKind = 'patrol' | 'spinner' | 'shooter' | 'gate';
export type Input = { move: number; jump: boolean; jumpPressed?: boolean; branch: boolean; merge: boolean };
export type Encounter = { id: string; kind: HazardKind; x: number; phase: number; period: number };
export type Branch = {
  id: number;
  forkX: number;
  forkBase: number;
  staged: Set<string>;
  converted: Set<string>;
};
export type Shot = { id: string; branchId: number; sourceId: string; birth: number; x: number; y: number; vx: number; vy: number; retired?: boolean };
export type Coin = { id: string; branchId: number; x: number; y: number; vx: number; vy: number; bornAt: number; collected: boolean };
export type Burst = { x: number; branchId: number; age: number; kind: 'stage' | 'merge' | 'coin' | 'hit' | 'fork' };
export type JumpParticleKind = 'first' | 'second' | 'trail';
export type JumpParticle = { id: number; kind: JumpParticleKind; x: number; y: number; vx: number; vy: number; bornAt: number; life: number; size: number };
export const MAX_JUMP_PARTICLES = 128;
export type Transition = { kind: 'branch' | 'merge'; age: number; from: number };
export type GameEvent = 'jump' | 'land' | 'branch' | 'stage' | 'merge' | 'destroy' | 'combo' | 'coin' | 'hit' | 'over';
export type Player = { x: number; y: number; vy: number; grounded: boolean; health: number; invulnerable: number; facing: -1 | 1 };

const EMPTY_INPUT: Input = { move: 0, jump: false, branch: false, merge: false };

function hash(seed: number, index: number): number {
  let n = (seed ^ Math.imul(index + 1, 0x45d9f3b)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
}

export function encounters(seed: number, chunk: number, settings = DEFAULTS.enemies): Encounter[] {
  if (chunk < 0) return [];
  if (chunk === 0) return [
    { id: '0:0', kind: 'patrol', x: 232, phase: 0, period: 3.6 },
    { id: '0:1', kind: 'spinner', x: 384, phase: 1.2, period: 3.2 },
  ];
  const kinds: HazardKind[] = ['patrol', 'spinner', 'shooter', 'gate'];
  const count = Math.min(4, 2 + Math.floor(chunk / 6));
  const result = Array.from({ length: count }, (_, i) => {
    const n = hash(seed, chunk * 11 + i);
    const kind = chunk === 1 && i === 0 ? 'shooter' : kinds[n % kinds.length]!;
    return {
      id: `${chunk}:${i}`,
      kind,
      x: 0,
      phase: ((n >>> 12) % 628) / 100,
      period: (Math.max(1.35, 3.4 - chunk * 0.035) + ((n >>> 20) % 4) * 0.12) / (kind === 'shooter' ? settings.firingRate : 1),
    };
  });
  const radius = (hazard: Encounter): number => 13 + (hazard.kind === 'patrol' ? settings.patrolRange : 0);
  const gaps = (): number[] => result.slice(1).map((hazard, i) => radius(result[i]!) + radius(hazard) + 40);
  const left = Math.max(64, radius(result[0]!) + 24);
  while (result.length > 2 && left + Math.max(64, radius(result.at(-1)!) + 24) + gaps().reduce((a, b) => a + b, 0) > CHUNK) result.pop();
  const spacing = gaps();
  let spare = CHUNK - left - Math.max(64, radius(result.at(-1)!) + 24) - spacing.reduce((a, b) => a + b, 0);
  const random = (offset: number): number => hash(seed, chunk * 101 + offset) / 0xffffffff;
  const lead = Math.floor(random(71) * Math.min(80, spare)); spare -= lead;
  spare -= Math.floor(random(72) * Math.min(80, spare));
  const weights = spacing.map((_, i) => 0.15 + random(80 + i) ** 2 * 2);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  result[0]!.x = chunk * CHUNK + left + lead;
  let allocated = 0;
  for (let i = 1; i < result.length; i++) {
    const extra = i === result.length - 1 ? spare - allocated : Math.floor(spare * weights[i - 1]! / totalWeight);
    allocated += extra;
    result[i]!.x = result[i - 1]!.x + spacing[i - 1]! + extra;
  }
  return result;
}

export function hazardPose(hazard: Encounter, time: number, settings = DEFAULTS.enemies): { x: number; y: number; angle: number; active: boolean } {
  const speed = hazard.kind === 'patrol' ? settings.patrolSpeed : hazard.kind === 'spinner' ? settings.spinSpeed : hazard.kind === 'gate' ? settings.gateSpeed : 1;
  const phase = time * speed * (Math.PI * 2 / hazard.period) + hazard.phase;
  return {
    x: hazard.x + (hazard.kind === 'patrol' ? Math.sin(phase) * settings.patrolRange : 0),
    y: hazard.kind === 'spinner' ? settings.spinnerHeight + Math.sin(phase * 0.5) * settings.spinnerBob : 0,
    angle: phase,
    active: hazard.kind !== 'gate' || Math.sin(phase) > -0.35,
  };
}

export function shotPosition(shot: Shot, time: number, life = DEFAULTS.enemies.shotLife): { x: number; y: number } | null {
  const age = time - shot.birth;
  return age >= 0 && age < life ? { x: shot.x + shot.vx * age, y: shot.y + shot.vy * age } : null;
}

export function sweptHit(ax: number, ay: number, bx: number, by: number, halfWidth: number, halfHeight: number): boolean {
  let near = 0;
  let far = 1;
  for (const [a, b, radius] of [[ax, bx, halfWidth], [ay, by, halfHeight]]) {
    if (a === undefined || b === undefined || radius === undefined) continue;
    const delta = b - a;
    if (Math.abs(delta) < 1e-10) {
      if (Math.abs(a) > radius) return false;
    } else {
      const t1 = (-radius - a) / delta;
      const t2 = (radius - a) / delta;
      near = Math.max(near, Math.min(t1, t2));
      far = Math.min(far, Math.max(t1, t2));
      if (near > far) return false;
    }
  }
  return true;
}

export class Simulation {
  readonly seed: number;
  player: Player = { x: 64, y: 0, vy: 0, grounded: true, health: 3, invulnerable: 0, facing: 1 };
  branches: Branch[] = [{ id: 0, forkX: 0, forkBase: 0, staged: new Set(), converted: new Set() }];
  readonly coins = new Map<string, Coin>();
  readonly shots = new Map<string, Shot>();
  readonly awarded = new Set<string>();
  readonly bursts: Burst[] = [];
  readonly jumpParticles: JumpParticle[] = [];
  readonly events: GameEvent[] = [];
  readonly chunks = new Map<number, Encounter[]>();
  time = 0;
  realTime = 0;
  maxX = 64;
  direction = 0;
  axis = 0;
  coinScore = 0;
  destructionScore = 0;
  transition: Transition | null = null;
  paused = false;
  gameOver = false;
  tutorial = { moved: false, jumped: false, branched: false, staged: false, merged: false, collected: false };
  private nextBranch = 1;
  private held = { jump: false, branch: false, merge: false };
  private readonly firstConvertedDepth = new Map<string, number>();
  private readonly shotBuckets = new Map<string, Set<Shot>>();
  private readonly branchShots = new Map<number, Set<Shot>>();
  private readonly sourceShots = new Map<string, Set<Shot>>();
  private readonly orphanedShots = new Set<Shot>();
  private readonly detachedShots = new Set<Shot>();
  private readonly coinBuckets = new Map<number, Set<Coin>>();
  private readonly coinCells = new Map<string, Set<Coin>>();
  coinPhysicsCount = 0;
  coinPairChecks = 0;
  private readonly branchCoins = new Map<number, Set<Coin>>();
  mergeCombo = 0;
  private mergeWait = 0;
  private comboFlourished = false;
  private mergeBlocked = false;
  private jumpFlight: { height: number; age: number; rise: number; holdWindow: number; released: boolean } | null = null;
  private shakeAt = -Infinity;
  private airJumpReady = true;
  private nextJumpParticle = 0;
  private trailCarry = 0;

  constructor(seed = 0xf04c, public config: Tuning = structuredClone(DEFAULTS)) {
    this.seed = seed;
  }

  get top(): Branch { return this.branches[this.branches.length - 1]!; }
  get depth(): number { return this.branches.length - 1; }
  get distanceScore(): number { return Math.floor(Math.max(0, this.maxX - 64) / UNIT) * 5; }
  get attackRange(): number { return this.config.enemies.shotLife * this.config.enemies.shotSpeed + 30; }
  get lane(): number { return this.config.branches.height; }
  get unit(): number { return this.config.branches.length; }
  get shakeAge(): number { return this.realTime - this.shakeAt; }
  get airJumpAvailable(): boolean { return this.airJumpReady; }
  get transitionDuration(): number { return this.transition?.kind === 'merge' ? this.config.branches.collapseDuration : this.config.branches.liftDuration; }
  pose(hazard: Encounter, time = this.time): ReturnType<typeof hazardPose> { return hazardPose(hazard, time, this.config.enemies); }
  shotPose(shot: Shot): ReturnType<typeof shotPosition> { return shot.retired ? null : shotPosition(shot, this.time, this.config.enemies.shotLife); }
  shooterMuzzle(depth: number, hazard: Encounter, time = this.time, age = this.transition?.age ?? 0): { x: number; y: number } {
    const pose = this.pose(hazard, time);
    return { x: pose.x, y: this.surfaceAt(depth, pose.x, age).height + pose.y + 12 };
  }
  get score(): number { return this.coinScore + this.destructionScore + this.distanceScore; }
  get currentDepth(): number { return this.surfaceAt(this.depth, this.player.x).depth; }
  get playerWorldY(): number {
    return this.surfaceAt(this.depth, this.player.x).height + this.player.y;
  }

  private surfaceHeight(depth: number, x: number, parent: number, age: number): number {
    const branch = this.branches[depth]!;
    if (x < branch.forkX) return parent;
    const full = branch.forkBase + (depth * this.lane - branch.forkBase) * Math.min(1, (x - branch.forkX) / this.unit);
    if (!this.transition || depth !== this.depth) return full;
    const t = Math.min(1, age / this.transitionDuration);
    const lift = this.transition.kind === 'branch' ? 1 - (1 - t) ** this.config.branches.liftEase : 1 - t ** this.config.branches.collapseEase;
    return parent + (full - parent) * lift;
  }

  surfaceAt(depth: number, x: number, age = this.transition?.age ?? 0): { height: number; depth: number } {
    for (let i = depth; i > 0; i--) {
      const branch = this.branches[i]!;
      if (x < branch.forkX) continue;
      const parent = this.transition && i === this.depth ? this.surfaceAt(i - 1, x, age).height : 0;
      return { height: this.surfaceHeight(i, x, parent, age), depth: i };
    }
    return { height: 0, depth: 0 };
  }

  nearby(minX: number, maxX: number): Encounter[] {
    const result: Encounter[] = [];
    for (let c = Math.max(0, Math.floor(minX / CHUNK)); c <= Math.floor(maxX / CHUNK); c++) {
      let chunk = this.chunks.get(c);
      if (!chunk) {
        chunk = encounters(this.seed, c, this.config.enemies);
        this.chunks.set(c, chunk);
        if (this.chunks.size > 24) this.chunks.delete(this.chunks.keys().next().value!);
      }
      result.push(...chunk.filter(h => h.x >= minX - this.config.enemies.patrolRange && h.x <= maxX + this.config.enemies.patrolRange));
    }
    return result;
  }

  isConverted(depth: number, id: string): boolean {
    const first = this.firstConvertedDepth.get(id);
    return first !== undefined && first <= depth;
  }

  isOrdinaryActive(depth: number, hazard: Encounter): boolean {
    return !this.isConverted(depth, hazard.id) && (depth !== this.depth || depth === 0);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.direction = 0;
    this.held = { jump: false, branch: false, merge: false };
    this.endMergeHold();
  }

  endMergeHold(): void { this.mergeCombo = 0; this.mergeWait = 0; this.comboFlourished = false; }

  stagedLineages(): Map<string, number> {
    const lineages = new Map<string, number>();
    for (let depth = 1; depth <= this.depth; depth++) for (const id of this.branches[depth]!.staged) lineages.set(id, depth);
    return lineages;
  }

  branch(): boolean {
    if (this.transition || this.gameOver || this.paused) return false;
    this.endMergeHold();
    const forkBase = this.surfaceAt(this.depth, this.player.x - this.unit).height;
    this.branches.push({
      id: this.nextBranch++,
      forkX: this.player.x - this.unit,
      forkBase,
      staged: new Set(),
      converted: new Set(),
    });
    this.transition = { kind: 'branch', age: 0, from: this.depth - 1 };
    this.tutorial.branched = true;
    this.events.push('branch');
    this.bursts.push({ x: this.top.forkX, branchId: this.top.id, age: 0, kind: 'fork' });
    return true;
  }

  stage(id: string): boolean {
    if (this.depth === 0 || this.top.staged.has(id) || this.isConverted(this.depth, id)) return false;
    this.top.staged.add(id);
    this.tutorial.staged = true;
    this.events.push('stage');
    return true;
  }

  merge(): boolean {
    if (this.depth === 0 || this.transition || this.gameOver || this.paused) return false;
    this.transition = { kind: 'merge', age: 0, from: this.depth };
    return true;
  }

  private convertMergeTargets(): void {
    const child = this.top;
    const parent = this.branches[this.depth - 1]!;
    for (const id of child.staged) {
      const chunkIndex = Number(id.split(':')[0]);
      const target = encounters(this.seed, chunkIndex, this.config.enemies).find(h => h.id === id);
      if (!target) throw new Error(`Unknown staged encounter: ${id}`);
      const pose = this.pose(target);
      const height = target.kind === 'gate' ? (pose.active ? 29 : 4) : target.kind === 'spinner' ? 11 : 17;
      const impact = this.surfaceAt(this.depth - 1, pose.x).height + pose.y + height;
      if (this.surfaceAt(this.depth, pose.x).height > impact) continue;
      if (!this.isConverted(this.depth - 1, id)) {
        parent.converted.add(id);
        this.firstConvertedDepth.set(id, Math.min(this.firstConvertedDepth.get(id) ?? Infinity, this.depth - 1));
        if (target.kind === 'shooter') for (const branch of [parent, child]) {
          this.retainAirborneShots(this.sourceShots.get(`${branch.id}/${id}`) ?? []);
        }
        const rewardId = `${parent.id}/${id}`;
        if (!this.awarded.has(rewardId)) {
          this.awarded.add(rewardId);
          this.destructionScore += 100;
          for (let i = 0; i < 3; i++) {
            const coinId = `${rewardId}/${i}`;
            const launch = hash(this.seed, parent.id * 65537 + chunkIndex * 97 + Number(id.split(':')[1]) * 17 + i);
            const coin: Coin = {
              id: coinId, branchId: parent.id, x: pose.x + (i - 1) * 5, y: 17 + i * 2,
              vx: (i - 1) * this.config.coins.spread + ((launch >>> 10) % 17) - 8,
              vy: this.config.coins.popSpeed * (0.8 + (launch % 31) / 100), bornAt: this.realTime, collected: false,
            };
            this.coins.set(coinId, coin);
            this.placeCoin(coin, coin.x, coin.y);
            const owned = this.branchCoins.get(parent.id) ?? new Set<Coin>();
            owned.add(coin); this.branchCoins.set(parent.id, owned);
          }
          this.bursts.push({ x: pose.x, branchId: parent.id, age: 0, kind: 'merge' });
          this.events.push('destroy');
        }
      }
      if (this.depth > 1) parent.staged.add(id);
    }
  }

  private completeMerge(): void {
    const child = this.top;
    const parent = this.branches[this.depth - 1]!;
    const parentCoins = this.branchCoins.get(parent.id) ?? new Set<Coin>();
    for (const coin of this.branchCoins.get(child.id) ?? []) {
      this.placeCoin(coin, coin.x, coin.y, parent.id);
      parentCoins.add(coin);
    }
    if (parentCoins.size) this.branchCoins.set(parent.id, parentCoins);
    this.branchCoins.delete(child.id);
    const childShots = this.branchShots.get(child.id) ?? [];
    this.retainAirborneShots(childShots);
    for (const shot of childShots) {
      if (shot.retired) this.shots.delete(shot.id);
      else this.detachedShots.add(shot);
      this.sourceShots.delete(`${child.id}/${shot.sourceId}`);
    }
    this.branchShots.delete(child.id);
    this.branches.pop();
    if (this.depth > 0) this.retainAirborneShots(this.branchShots.get(parent.id) ?? []);
    this.tutorial.merged = true;
    this.shakeAt = this.realTime;
    this.events.push('merge');
  }

  coinY(coin: Coin): number {
    return coin.y;
  }

  private coinCell(coin: Coin): string { return `${coin.branchId}:${Math.floor(coin.x / 10)}`; }

  private placeCoin(coin: Coin, x: number, y: number, branchId = coin.branchId): void {
    const oldChunk = Math.floor(coin.x / CHUNK), oldCell = this.coinCell(coin);
    this.coinBuckets.get(oldChunk)?.delete(coin);
    this.coinCells.get(oldCell)?.delete(coin);
    if (!this.coinBuckets.get(oldChunk)?.size) this.coinBuckets.delete(oldChunk);
    if (!this.coinCells.get(oldCell)?.size) this.coinCells.delete(oldCell);
    if (branchId !== coin.branchId) {
      this.branchCoins.get(coin.branchId)?.delete(coin);
      const owned = this.branchCoins.get(branchId) ?? new Set<Coin>();
      owned.add(coin); this.branchCoins.set(branchId, owned);
    }
    coin.x = x; coin.y = y; coin.branchId = branchId;
    const key = Math.floor(x / CHUNK), cell = this.coinCell(coin);
    const bucket = this.coinBuckets.get(key) ?? new Set<Coin>(); bucket.add(coin); this.coinBuckets.set(key, bucket);
    const neighbors = this.coinCells.get(cell) ?? new Set<Coin>(); neighbors.add(coin); this.coinCells.set(cell, neighbors);
  }

  private stepCoins(dt: number): void {
    this.coinPhysicsCount = 0; this.coinPairChecks = 0;
    if (!this.coins.size) return;
    const depths = new Map(this.branches.map((branch, depth) => [branch.id, depth]));
    const active = new Set<Coin>();
    this.coinPairChecks = 0;
    for (let chunk = Math.max(0, Math.floor(this.player.x / CHUNK) - 1); chunk <= Math.floor(this.player.x / CHUNK) + 1; chunk++) {
      let scanned = 0;
      for (const coin of this.coinBuckets.get(chunk) ?? []) {
        active.add(coin);
        if (++scanned >= 32) break;
      }
    }
    this.coinPhysicsCount = active.size;
    const settings = this.config.coins;
    const ground = (coin: Coin, x = coin.x): number => this.surfaceAt(depths.get(coin.branchId)!, x).height;
    const translate = (coin: Coin, dx: number, dy: number): void => {
      const worldY = ground(coin) + coin.y;
      const surface = this.surfaceAt(depths.get(coin.branchId)!, coin.x + dx);
      this.placeCoin(coin, coin.x + dx, Math.max(5, worldY + dy - surface.height), this.branches[surface.depth]!.id);
    };
    const resting = (coin: Coin): boolean => coin.vx === 0 && coin.vy === 0 && coin.y === 5;
    for (const coin of active) {
      if (resting(coin)) {
        const bucket = this.coinBuckets.get(Math.floor(coin.x / CHUNK))!;
        bucket.delete(coin); bucket.add(coin);
        continue;
      }
      const x = coin.x + coin.vx * dt;
      let y = ground(coin) + coin.y + coin.vy * dt - settings.gravity * dt * dt / 2 - ground(coin, x);
      coin.vy -= settings.gravity * dt;
      if (y <= 5) {
        y = 5;
        const slope = ground(coin, x + .5) - ground(coin, x - .5);
        const length = Math.hypot(slope, 1), nx = -slope / length, ny = 1 / length;
        const velocity = coin.vx * nx + coin.vy * ny;
        if (velocity < 0) { coin.vx -= (1 + settings.bounce) * velocity * nx; coin.vy -= (1 + settings.bounce) * velocity * ny; }
        coin.vx *= settings.friction;
        if (Math.abs(coin.vy) < 10) coin.vy = 0;
        if (Math.abs(coin.vx) < 1) coin.vx = 0;
      }
      const support = this.surfaceAt(depths.get(coin.branchId)!, x);
      this.placeCoin(coin, x, y, this.branches[support.depth]!.id);
    }
    for (let pass = 0; pass < 2; pass++) {
      for (const coin of active) {
        const seen = new Set<Coin>();
        let checked = 0;
        const cell = Math.floor(coin.x / 10);
        for (let c = cell - 1; c <= cell + 1 && checked < 16; c++) {
          for (const other of this.coinCells.get(`${coin.branchId}:${c}`) ?? []) {
            if (++checked > 16) break;
            this.coinPairChecks++;
            if (other === coin) continue;
            if (Math.abs(other.x - coin.x) >= 8.2) continue;
            if (active.has(other) && coin.id > other.id || seen.has(other)) continue;
            seen.add(other);
            let dx = other.x - coin.x, dy = ground(other) + other.y - ground(coin) - coin.y;
            const distance = Math.hypot(dx, dy);
            if (distance >= 8.2) continue;
            if (distance < 1e-6) { dx = coin.id < other.id ? 1 : -1; dy = 0; }
            const length = Math.hypot(dx, dy), nx = dx / length, ny = dy / length;
            const separation = (8.2 - distance) / 2;
            translate(coin, -nx * separation, -ny * separation);
            translate(other, nx * separation, ny * separation);
            const speed = (other.vx - coin.vx) * nx + (other.vy - coin.vy) * ny;
            if (speed < 0) {
              const impulse = -(1 + settings.bounce) * speed / 2;
              coin.vx -= impulse * nx; coin.vy -= impulse * ny;
              other.vx += impulse * nx; other.vy += impulse * ny;
            }
          }
        }
      }
    }
  }

  coinsNear(minX: number, maxX: number): Coin[] {
    const coins: Coin[] = [];
    for (let key = Math.floor(minX / CHUNK); key <= Math.floor(maxX / CHUNK); key++) {
      for (const coin of this.coinBuckets.get(key) ?? []) if (coin.x >= minX && coin.x <= maxX) coins.push(coin);
    }
    return coins;
  }

  private hurt(): void {
    if (this.player.invulnerable > 0) return;
    this.player.health--;
    this.player.invulnerable = this.config.physics.hitProtection;
    this.shakeAt = this.realTime;
    this.bursts.push({ x: this.player.x, branchId: this.branches[this.currentDepth]!.id, age: 0, kind: 'hit' });
    this.events.push('hit');
    if (this.player.health <= 0) {
      this.gameOver = true;
      this.direction = 0;
      this.events.push('over');
    }
  }

  private shotBucketKeys(shot: Shot): string[] {
    const endX = shot.x + shot.vx * this.config.enemies.shotLife;
    const endY = shot.y + shot.vy * this.config.enemies.shotLife;
    const keys: string[] = [];
    for (let x = Math.floor(Math.min(shot.x, endX) / 128); x <= Math.floor(Math.max(shot.x, endX) / 128); x++) {
      for (let y = Math.floor(Math.min(shot.y, endY) / 128); y <= Math.floor(Math.max(shot.y, endY) / 128); y++) keys.push(`${x}:${y}`);
    }
    return keys;
  }

  private unindexShot(shot: Shot): void {
    for (const key of this.shotBucketKeys(shot)) {
      const bucket = this.shotBuckets.get(key);
      bucket?.delete(shot);
      if (!bucket?.size) this.shotBuckets.delete(key);
    }
  }

  private retireShot(shot: Shot): void {
    if (!shot.retired) this.unindexShot(shot);
    shot.retired = true;
    this.orphanedShots.delete(shot);
    if (this.detachedShots.delete(shot)) this.shots.delete(shot.id);
  }

  private retainAirborneShots(shots: Iterable<Shot>): void {
    for (const shot of shots) {
      if (!shot.retired && this.time > shot.birth && this.shotPose(shot)) this.orphanedShots.add(shot);
      else this.retireShot(shot);
    }
  }

  shotsNear(minX: number, maxX: number, minY: number, maxY: number): Set<Shot> {
    const shots = new Set<Shot>();
    for (let x = Math.floor(minX / 128); x <= Math.floor(maxX / 128); x++) {
      for (let y = Math.floor(minY / 128); y <= Math.floor(maxY / 128); y++) {
        for (const shot of this.shotBuckets.get(`${x}:${y}`) ?? []) shots.add(shot);
      }
    }
    return shots;
  }

  private emitShots(hazard: Encounter, depth: number, start: number, end: number, oldAge: number, dt: number, oldX: number, oldY: number): void {
    if (end <= start) return;
    const branch = this.branches[depth]!;
    const phase = hazard.phase;
    const first = Math.ceil((start - phase) / hazard.period);
    const last = Math.floor((end - phase) / hazard.period);
    for (let n = first; n <= last; n++) {
      const id = `${branch.id}/${hazard.id}/${n}`;
      const previous = this.shots.get(id), birth = n * hazard.period + phase;
      if (previous && birth < start) continue;
      const ratio = (birth - start) / (end - start);
      const { x, y } = this.shooterMuzzle(depth, hazard, birth, Math.min(this.transitionDuration, oldAge + dt * ratio));
      const dx = oldX + (this.player.x - oldX) * ratio - x;
      const dy = oldY + (this.playerWorldY - oldY) * ratio + PLAYER_HEIGHT / 2 - y;
      const distance = Math.hypot(dx, dy);
      if (distance > this.attackRange) continue;
      const shot: Shot = previous ?? {
        id, branchId: branch.id, sourceId: hazard.id, birth, x, y,
        vx: distance > 0 ? dx / distance * this.config.enemies.shotSpeed : -this.config.enemies.shotSpeed,
        vy: distance > 0 ? dy / distance * this.config.enemies.shotSpeed : 0,
      };
      // A living re-emission may have a new action-clock support, but an airborne shot never follows it.
      if (previous) { this.unindexShot(shot); shot.x = x; shot.y = y; shot.retired = false; this.orphanedShots.delete(shot); }
      this.shots.set(id, shot);
      const owned = this.branchShots.get(branch.id) ?? new Set<Shot>();
      owned.add(shot);
      this.branchShots.set(branch.id, owned);
      const source = `${branch.id}/${hazard.id}`, emitted = this.sourceShots.get(source) ?? new Set<Shot>();
      emitted.add(shot); this.sourceShots.set(source, emitted);
      for (const key of this.shotBucketKeys(shot)) {
        const bucket = this.shotBuckets.get(key) ?? new Set<Shot>();
        bucket.add(shot);
        this.shotBuckets.set(key, bucket);
      }
    }
  }

  private jumpSettings(kind: JumpParticleKind) {
    return kind === 'first' ? this.config.jumpBurst : kind === 'second' ? this.config.doubleJumpBurst : this.config.jumpTrail;
  }

  jumpEffectEnabled(kind: JumpParticleKind): boolean {
    const settings = this.jumpSettings(kind);
    return settings.size > 0 && ('count' in settings ? settings.count : settings.rate) > 0;
  }

  jumpParticlePose(particle: JumpParticle): { x: number; y: number; alpha: number; size: number } {
    const age = this.realTime - particle.bornAt;
    return {
      x: particle.x + particle.vx * age,
      y: particle.y + particle.vy * age - (particle.kind === 'trail' ? 0 : 40 * age * age),
      alpha: Math.max(0, 1 - age / particle.life),
      size: Math.max(1, Math.ceil(particle.size * (1 - age / particle.life))),
    };
  }

  private emitJumpParticles(kind: JumpParticleKind, count: number, x: number, y: number): void {
    if (!this.jumpEffectEnabled(kind)) return;
    const settings = this.jumpSettings(kind);
    for (let i = 0; i < count; i++) {
      const id = this.nextJumpParticle++, random = hash(this.seed, id + 991) / 0xffffffff;
      const angle = i * 2.399 + random * Math.PI * 2;
      if (this.jumpParticles.length === MAX_JUMP_PARTICLES) this.jumpParticles.shift();
      this.jumpParticles.push({
        id, kind, x: x + Math.cos(angle) * settings.spread / 2,
        y: y + 1 + Math.sin(angle) * settings.spread / 4,
        vx: Math.cos(angle) * settings.speed * (kind === 'trail' ? .3 : 1),
        vy: kind === 'trail' ? -settings.speed : Math.sin(angle) * settings.speed * .6 - settings.speed * .2,
        bornAt: this.realTime, life: settings.life, size: settings.size,
      });
    }
  }

  step(input: Input = EMPTY_INPUT, dt = STEP, reducedEffects = false): void {
    if (this.paused || this.gameOver) return;
    if (!(dt > 0 && dt <= 1 / 30)) throw new Error('Simulation requires a positive fixed step of at most 1/30s');
    this.realTime += dt;
    if (reducedEffects) this.jumpParticles.length = 0;
    for (let i = this.jumpParticles.length - 1; i >= 0; i--) {
      const particle = this.jumpParticles[i]!;
      if (this.realTime - particle.bornAt >= particle.life || !this.jumpEffectEnabled(particle.kind)) this.jumpParticles.splice(i, 1);
    }
    const oldWorldY = this.playerWorldY;
    const oldTransitionAge = this.transition?.age ?? 0;
    const wasGrounded = this.player.grounded;
    this.player.invulnerable = Math.max(0, this.player.invulnerable - dt);
    const jump = input.jump && (input.jumpPressed === true || !this.held.jump);
    const fork = input.branch && !this.held.branch;
    if (!this.transition) this.mergeWait = Math.max(0, this.mergeWait - dt);
    if (!input.merge) { this.endMergeHold(); this.mergeBlocked = false; }
    if (fork && input.merge) { this.endMergeHold(); this.mergeBlocked = true; }
    const merge = input.merge && !this.mergeBlocked && (!this.held.merge || this.mergeWait === 0);
    this.held = { jump: input.jump, branch: input.branch, merge: input.merge };
    if (fork) this.branch();
    else if (merge) this.merge();
    if (jump && (this.player.grounded || this.airJumpReady)) {
      const airborne = !this.player.grounded;
      if (airborne) this.airJumpReady = false;
      this.player.vy = Math.sqrt(2 * this.config.physics.gravity * this.config.physics.jumpHeight);
      this.jumpFlight = {
        height: this.config.physics.jumpHeight, age: 0, rise: 0,
        holdWindow: this.player.vy / this.config.physics.gravity, released: false,
      };
      this.player.grounded = false;
      if (!reducedEffects) this.emitJumpParticles(airborne ? 'second' : 'first',
        airborne ? this.config.doubleJumpBurst.count : this.config.jumpBurst.count, this.player.x, oldWorldY);
      this.events.push('jump');
      this.tutorial.jumped = true;
    }
    if (this.jumpFlight && !input.jump && !this.jumpFlight.released) {
      const flight = this.jumpFlight;
      flight.released = true;
      const held = Math.max(0, Math.min(1, (flight.age - dt) / Math.max(dt, flight.holdWindow - dt)));
      const target = flight.height * (0.5 + 0.5 * held);
      if (this.player.vy > 0) this.player.vy = Math.min(this.player.vy, Math.sqrt(2 * this.config.physics.gravity * Math.max(0, target - flight.rise)));
    }
    if (this.transition) {
      this.transition.age += dt;
      if (this.transition.age + 1e-9 >= this.transitionDuration) this.transition.age = this.transitionDuration;
    }

    const oldX = this.player.x;
    const oldTime = this.time;
    const supportShift = this.transition ? this.surfaceAt(this.depth, oldX).height - this.surfaceAt(this.depth, oldX, oldTransitionAge).height : 0;
    let verticalPosition = oldWorldY + supportShift;
    if (!this.player.grounded) {
      const rise = this.player.vy * dt - 0.5 * this.config.physics.gravity * dt * dt;
      verticalPosition += rise;
      if (this.jumpFlight) { this.jumpFlight.rise += rise; this.jumpFlight.age += dt; }
      this.player.vy -= this.config.physics.gravity * dt;
    }
    const move = Math.sign(input.move);
    this.axis = move;
    if (move !== 0) this.player.facing = move < 0 ? -1 : 1;
    this.player.x = Math.max(PLAYER_WIDTH / 2, oldX + move * this.config.character.speed * dt);
    let physicalDepth = this.currentDepth;
    const hazards = this.nearby(oldX - this.attackRange - 60, oldX + this.attackRange + 60);
    const grounds = [new Map<number, Float64Array>(), new Map<number, Float64Array>()];
    const heightAt = (depth: number, x: number, previous = false): number => {
      const cache = grounds[Number(previous)]!;
      let heights = cache.get(x);
      if (!heights) {
        heights = new Float64Array(this.branches.length);
        for (let d = 1; d <= this.depth; d++) {
          heights[d] = this.surfaceHeight(d, x, heights[d - 1]!, previous ? oldTransitionAge : this.transition?.age ?? 0);
        }
        cache.set(x, heights);
      }
      return heights[depth]!;
    };
    const proposedGround = this.surfaceAt(this.depth, this.player.x).height;
    const proposedFoot = this.player.grounded ? proposedGround : Math.max(proposedGround, verticalPosition);
    for (const hazard of hazards) {
      if (hazard.kind !== 'gate') continue;
      const pose = this.pose(hazard, oldTime);
      if (!pose.active) continue;
      const left = pose.x - 26;
      const right = pose.x + 26;
      const edge = oldX <= left && this.player.x > left ? left :
        oldX >= right && this.player.x < right ? right : null;
      if (edge === null) continue;
      const ratio = (edge - oldX) / (this.player.x - oldX);
      const foot = oldWorldY + (proposedFoot - oldWorldY) * ratio;
      for (let depth = 0; depth <= this.depth; depth++) {
        if (hazard.x < this.branches[depth]!.forkX || !this.isOrdinaryActive(depth, hazard)) continue;
        const beforeFloor = heightAt(depth, hazard.x, true);
        const floor = beforeFloor + (heightAt(depth, hazard.x) - beforeFloor) * ratio;
        if (foot < floor + 29 && foot + PLAYER_HEIGHT > floor) {
          this.player.x = edge;
          break;
        }
      }
    }
    const ground = this.surfaceAt(this.depth, this.player.x);
    physicalDepth = ground.depth;
    if (this.player.grounded) this.player.y = 0;
    else {
      this.player.y = verticalPosition - ground.height;
      if (this.player.y <= 0) {
        this.player.y = 0; this.player.vy = 0; this.player.grounded = true;
        this.jumpFlight = null;
        this.airJumpReady = true;
      }
    }
    if (!wasGrounded && this.player.grounded) this.events.push('land');
    const displacement = this.player.x - oldX;
    this.time += displacement / this.config.character.speed;
    this.direction = Math.sign(displacement);
    this.maxX = Math.max(this.maxX, this.player.x);
    if (Math.abs(this.player.x - 64) > UNIT) this.tutorial.moved = true;
    if (this.transition?.kind === 'merge') this.convertMergeTargets();
    this.stepCoins(dt);

    for (const hazard of hazards) {
      if (hazard.x < this.branches[physicalDepth]!.forkX || this.isConverted(physicalDepth, hazard.id)) continue;
      if (physicalDepth === this.depth && this.depth > 0) {
        const targetY = this.surfaceAt(this.depth, hazard.x).height + 15;
        if (!this.transition && Math.abs(this.player.x - hazard.x) < 18 && Math.abs(this.playerWorldY + PLAYER_HEIGHT / 2 - targetY) < 18 && this.stage(hazard.id)) {
          this.bursts.push({ x: hazard.x, branchId: this.top.id, age: 0, kind: 'stage' });
        }
      }
    }
    for (const hazard of hazards) {
      const before = this.pose(hazard, oldTime);
      const after = this.pose(hazard);
      if (!(before.active || after.active) || Math.min(before.x, after.x) > Math.max(oldX, this.player.x) + 26 ||
        Math.max(before.x, after.x) < Math.min(oldX, this.player.x) - 26) continue;
      const h = hazard.kind === 'gate' ? 29 : hazard.kind === 'spinner' ? 11 : 17;
      for (let depth = 0; depth <= this.depth; depth++) {
        if (hazard.x < this.branches[depth]!.forkX || !this.isOrdinaryActive(depth, hazard)) continue;
        if (sweptHit(
          oldX - before.x, oldWorldY + PLAYER_HEIGHT / 2 - heightAt(depth, before.x, true) - before.y - h / 2,
          this.player.x - after.x, this.playerWorldY + PLAYER_HEIGHT / 2 - heightAt(depth, after.x) - after.y - h / 2,
          hazard.kind === 'gate' ? 26 : 22, PLAYER_HEIGHT / 2 + h / 2,
        )) this.hurt();
      }
    }

    // The highest fork exposes switches; lower living sources retain their own firing events.
    for (let depth = 0; depth <= this.depth; depth++) {
      const branch = this.branches[depth]!;
      for (const hazard of hazards) {
        if (hazard.kind === 'shooter' && hazard.x >= branch.forkX && this.isOrdinaryActive(depth, hazard) &&
          Math.abs(heightAt(depth, hazard.x) - this.playerWorldY) <= this.attackRange) {
          this.emitShots(hazard, depth, oldTime, this.time, oldTransitionAge, dt, oldX, oldWorldY);
        }
      }
    }
    const worldY = this.playerWorldY;
    for (const shot of this.shotsNear(Math.min(oldX, this.player.x) - PLAYER_WIDTH, Math.max(oldX, this.player.x) + PLAYER_WIDTH, Math.min(oldWorldY, worldY) - 12, Math.max(oldWorldY, worldY) + 30)) {
      if (shot.retired) continue;
      const lo = Math.max(Math.min(oldTime, this.time), shot.birth);
      const hi = Math.min(Math.max(oldTime, this.time), shot.birth + this.config.enemies.shotLife);
      if (lo > hi || (oldTime === this.time && !this.shotPose(shot))) continue;
      const startTime = this.direction < 0 ? hi : lo;
      const endTime = this.direction < 0 ? lo : hi;
      const span = this.time - oldTime;
      const startRatio = span === 0 ? 0 : (startTime - oldTime) / span;
      const endRatio = span === 0 ? 1 : (endTime - oldTime) / span;
      const startX = shot.x + shot.vx * (startTime - shot.birth);
      const endX = shot.x + shot.vx * (endTime - shot.birth);
      const startY = shot.y + shot.vy * (startTime - shot.birth);
      const endY = shot.y + shot.vy * (endTime - shot.birth);
      if (sweptHit(
        oldX + (this.player.x - oldX) * startRatio - startX,
        oldWorldY + (worldY - oldWorldY) * startRatio + PLAYER_HEIGHT / 2 - startY,
        oldX + (this.player.x - oldX) * endRatio - endX,
        oldWorldY + (worldY - oldWorldY) * endRatio + PLAYER_HEIGHT / 2 - endY, PLAYER_WIDTH / 2 + 2, PLAYER_HEIGHT / 2 + 2,
      )) this.hurt();
    }
    for (const shot of this.orphanedShots) if (this.time <= shot.birth || !shotPosition(shot, this.time, this.config.enemies.shotLife)) this.retireShot(shot);
    for (const coin of this.coinsNear(this.player.x - 14, this.player.x + 14)) {
      if (coin.branchId === this.branches[physicalDepth]!.id && Math.abs(this.player.x - coin.x) < 13 &&
        Math.abs(this.playerWorldY + PLAYER_HEIGHT / 2 - this.surfaceAt(physicalDepth, coin.x).height - this.coinY(coin)) < 18 && this.realTime - coin.bornAt > 0.12 && !this.transition) {
        coin.collected = true;
        this.coins.delete(coin.id);
        const cell = this.coinCell(coin);
        this.coinCells.get(cell)?.delete(coin);
        if (!this.coinCells.get(cell)?.size) this.coinCells.delete(cell);
        const key = Math.floor(coin.x / CHUNK);
        const bucket = this.coinBuckets.get(key);
        bucket?.delete(coin);
        if (bucket?.size === 0) this.coinBuckets.delete(key);
        this.branchCoins.get(coin.branchId)?.delete(coin);
        this.coinScore += 25;
        this.tutorial.collected = true;
        this.events.push('coin');
        this.bursts.push({ x: coin.x, branchId: coin.branchId, age: 0, kind: 'coin' });
      }
    }
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      this.bursts[i]!.age += dt;
      if (this.bursts[i]!.age > Math.max(this.config.effects.particleLife, this.config.effects.shakeDuration)) this.bursts.splice(i, 1);
    }
    if (!this.gameOver && this.transition?.age === this.transitionDuration) {
      if (this.transition.kind === 'merge') {
        this.completeMerge();
        this.mergeWait = this.config.branches.holdDelay;
        if (input.merge && !this.mergeBlocked) {
          this.mergeCombo++;
          if (!this.comboFlourished && this.mergeCombo === this.config.audio.successThreshold) {
            this.comboFlourished = true;
            this.events.push('combo');
          }
        }
      }
      this.transition = null;
    }
    if (!reducedEffects && !this.player.grounded && this.jumpFlight && this.jumpEffectEnabled('trail')) {
      this.trailCarry += this.config.jumpTrail.rate * dt;
      const count = Math.floor(this.trailCarry);
      this.trailCarry -= count;
      this.emitJumpParticles('trail', count, this.player.x, this.playerWorldY);
    } else this.trailCarry = 0;
  }
}
