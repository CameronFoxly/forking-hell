import { expect, test } from '@playwright/test';
import { firstShooter, SHOOTER_SEED } from './encounter-fixtures';

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
