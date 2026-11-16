import { expect, test } from '@playwright/test';
import { firstShooter, SHOOTER_SEED } from './encounter-fixtures';

test('crawler rings, staged links and motion anchors follow signed patrol time on nested forks', async ({ page }) => {
  test.skip(Boolean(process.env.PREVIEW_URL), 'The deterministic renderer probe is not distributed.');
  await page.goto('/tests/render-fixture.html');
  await page.waitForFunction(() => Boolean(window.crawlerProbe));
  const results = await page.evaluate(async () => {
    const results = [];
    for (const depth of [1, 2]) for (const staged of [false, true]) {
      const frames = await window.crawlerProbe(depth, staged);
      const samples = [];
      for (const frame of frames) {
        const image = new Image(); image.src = frame.image; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
        const pixel = (x: number, y: number): number => {
          const rgb = context.getImageData(Math.round(x) - frame.left, -Math.round(y) + frame.top, 1, 1).data;
          return (rgb[0]! << 16) | (rgb[1]! << 8) | rgb[2]!;
        };
        samples.push({
          phase: frame.phase, time: frame.time, x: frame.x, y: frame.y, anchor: frame.anchor, covered: frame.covered,
          ears: [-7, 7].map(dx => pixel(Math.round(frame.x) + dx, frame.y)),
          link: pixel(frame.x, frame.y - 14),
          outsideLink: pixel(Math.round(frame.x) + 4, frame.y - 14),
          bracket: pixel(Math.round(frame.x) - 16, frame.y + 16),
        });
      }
      results.push({ depth, staged, samples });
    }
    return results;
  });
  for (const { staged, samples } of results) {
    for (const sample of samples) {
      expect(sample.ears, JSON.stringify(sample)).toEqual([staged ? 0x75f6ec : 0xffd394, staged ? 0x75f6ec : 0xffd394]);
      expect(sample.anchor).toEqual({ x: sample.x, y: sample.y });
      expect(sample.covered).toEqual(['0:0']);
      if (staged) {
        expect(sample.link).not.toBe(sample.outsideLink);
        expect(sample.bracket).not.toBe(0x08060f);
      }
    }
    expect(samples[1]!.x - samples[0]!.x).toBeGreaterThan(18);
    expect(samples[2]!.x).toBe(samples[1]!.x);
    expect(samples[2]!.time).toBe(samples[1]!.time);
    expect(samples[3]!.x).toBeCloseTo(samples[0]!.x, 10);
  }
});

test('real controls move, freeze, reverse and stage a crawler on a nested fork', async ({ page }) => {
  await page.goto('/'); await page.locator('#start:enabled').click();
  for (const depth of [1, 2]) {
    await page.keyboard.press('KeyW');
    await page.waitForFunction(depth => window.forkingHell.snapshot().depth === depth && !window.forkingHell.snapshot().transition, depth);
  }
  expect((await page.evaluate(() => window.forkingHell.snapshot())).covered).toContain('0:0');
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => window.forkingHell.snapshot().x >= 130);
  await page.keyboard.up('ArrowRight'); await page.waitForTimeout(80);
  const frozen = await page.evaluate(() => window.forkingHell.snapshot());
  await page.waitForTimeout(150);
  expect((await page.evaluate(() => window.forkingHell.snapshot())).time).toBe(frozen.time);
  await page.screenshot({ path: test.info().outputPath('crawler-frozen.png') });
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(() => window.forkingHell.snapshot().x <= 110);
  await page.keyboard.up('ArrowLeft');
  expect((await page.evaluate(() => window.forkingHell.snapshot())).time).toBeLessThan(frozen.time);
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => window.forkingHell.snapshot().staged.includes('0:0'));
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(() => window.forkingHell.snapshot().x <= 180);
  await page.keyboard.up('ArrowLeft'); await page.waitForTimeout(300);
  const staged = await page.evaluate(() => window.forkingHell.snapshot());
  expect(staged.staged).toContain('0:0');
  expect(staged.health).toBe(3);
  await page.screenshot({ path: test.info().outputPath('crawler-staged.png') });
});

test('fork coverage uses visible pixels at viewport edges and zoom, never the padded render target', async ({ page }) => {
  test.skip(Boolean(process.env.PREVIEW_URL), 'The deterministic renderer probe is not distributed.');
  test.setTimeout(90000);
  await page.goto('/tests/render-fixture.html');
  await page.waitForFunction(() => Boolean(window.forkViewProbe));
  const results = await page.evaluate(async () => {
    async function pixels(url: string): Promise<Uint8ClampedArray> {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, image.width, image.height).data;
    }
    const results = [];
    for (const kind of ['shooter', 'patrol', 'switch'] as const) for (const scale of [1, 3]) for (const zoom of [.88, .3]) for (const side of ['left', 'right', 'top', 'bottom']) for (const offset of [-30, 10, 30]) {
      const probe = await window.forkViewProbe(zoom, scale, side, offset, kind);
      const before = await pixels(probe.baseline), after = await pixels(probe.image);
      let changed = 0;
      for (let i = 0; i < before.length; i += 4) if (before[i] !== after[i] || before[i + 1] !== after[i + 1] || before[i + 2] !== after[i + 2]) changed++;
      results.push({ kind, scale, zoom, side, offset, changed, visible: probe.visible, covered: probe.covered, afterPan: probe.afterPan, rendered: probe.rendered });
    }
    return results;
  });
  for (const result of results) {
    expect(result.visible, JSON.stringify(result)).toBe(result.changed > 0);
    expect(result.covered).toBe(result.visible);
    expect(result.afterPan).toBe(result.covered);
  }
  expect(results.some(result => !result.visible && result.rendered > 0)).toBe(true);
  expect(results.some(result => result.visible)).toBe(true);
});

test('walking an older fork encounters an active top shooter; a new visible fork stages and converts only its receiving copy', async ({ page }) => {
  test.setTimeout(45000);
  const shooter = firstShooter();
  await page.addInitScript(seed => {
    Object.defineProperty(crypto, 'getRandomValues', { value: (array: Uint32Array) => { array[0] = seed; return array; } });
  }, SHOOTER_SEED);
  await page.goto('/'); await page.locator('#start:enabled').click();
  await page.keyboard.press('KeyW');
  await page.waitForFunction(() => window.forkingHell.snapshot().depth === 1 && !window.forkingHell.snapshot().transition);
  expect((await page.evaluate(() => window.forkingHell.snapshot())).covered).not.toContain(shooter.id);
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(x => window.forkingHell.snapshot().x >= x - 220, shooter.x);
  await page.keyboard.up('ArrowRight');
  await page.waitForFunction(id => window.forkingHell.diagnostics().visibleEncounters.includes(id), shooter.id);
  const encountered = await page.evaluate(id => ({
    snapshot: window.forkingHell.snapshot(),
    sources: window.forkingHell.projectiles().sources.filter(source => source.sourceId === id),
    shots: window.forkingHell.projectiles().shots.filter(shot => shot.sourceId === id),
  }), shooter.id);
  expect(encountered.snapshot.covered).not.toContain(shooter.id);
  expect(encountered.snapshot.staged).not.toContain(shooter.id);
  expect(encountered.sources.filter(source => source.active).map(source => source.branchId)).toEqual([0, 1]);
  expect(encountered.shots.some(shot => shot.branchId === 1)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('uncovered-top-shooter.png') });
  await page.keyboard.press('KeyW');
  await page.waitForFunction(() => window.forkingHell.snapshot().depth === 2 && !window.forkingHell.snapshot().transition);
  expect((await page.evaluate(() => window.forkingHell.snapshot())).covered).toContain(shooter.id);
  expect(await page.evaluate(id => window.forkingHell.projectiles().sources.find(source => source.sourceId === id && source.branchId === 2)?.active, shooter.id)).toBe(false);
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(id => window.forkingHell.snapshot().staged.includes(id), shooter.id);
  await page.keyboard.up('ArrowRight');
  await page.screenshot({ path: test.info().outputPath('new-fork-staged-switch.png') });
  await page.keyboard.press('KeyS');
  await page.waitForFunction(() => window.forkingHell.snapshot().depth === 1 && !window.forkingHell.snapshot().transition);
  const merged = await page.evaluate(id => ({
    snapshot: window.forkingHell.snapshot(),
    sources: window.forkingHell.projectiles().sources.filter(source => source.sourceId === id),
  }), shooter.id);
  expect(merged.snapshot.covered).not.toContain(shooter.id);
  expect(merged.snapshot.staged).toContain(shooter.id);
  expect(merged.sources.find(source => source.branchId === 1)?.converted).toBe(true);
  expect(merged.sources.find(source => source.branchId === 0)?.active).toBe(true);
  expect(merged.snapshot.gameOver).toBe(false);
});
