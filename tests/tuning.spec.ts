import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { DEFAULTS, JUMP_EFFECT_SECTIONS, tuningDocument } from '../src/tuning';

async function start(page: Page): Promise<void> {
  await page.goto('/'); await page.locator('#start').click();
}
async function fork(page: Page, depth: number): Promise<void> {
  await page.keyboard.press('KeyW');
  await page.waitForFunction(d => window.forkingHell.snapshot().depth === d && !window.forkingHell.snapshot().transition, depth);
}
const current = (page: Page) => page.evaluate(() => window.forkingHell.diagnostics().tuning.values);

test('tuning owns keyboard focus, edits live, and exports/imports complete effective JSON', async ({ page }) => {
  await start(page);
  expect(await current(page)).toEqual(DEFAULTS);
  await page.keyboard.down('KeyD');
  await page.locator('#tuning-toggle').click();
  const frozen = await page.evaluate(() => window.forkingHell.snapshot().x);
  const summary = page.locator('#tuning-sections summary').first();
  await summary.focus(); await page.keyboard.press('Space');
  await expect(page.locator('#tune-character-speed')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => window.forkingHell.snapshot().x)).toBe(frozen);
  expect(await page.evaluate(() => window.forkingHell.snapshot().y)).toBe(0);
  await page.keyboard.up('KeyD');
  await page.locator('#tune-character-speed').fill('120'); await page.locator('#tune-character-speed').press('Tab');
  expect((await current(page)).character.speed).toBe(120);
  await page.locator('#game').focus();
  const before = await page.evaluate(() => window.forkingHell.snapshot());
  await page.keyboard.down('KeyD'); await page.waitForTimeout(150); await page.keyboard.up('KeyD');
  const after = await page.evaluate(() => window.forkingHell.snapshot());
  expect((after.x - before.x) / (after.time - before.time)).toBeCloseTo(120, 5);
  const download = page.waitForEvent('download');
  await page.locator('#tuning-export').focus(); await page.keyboard.press('Space');
  const exported = await download, stream = await exported.createReadStream();
  const parts: Buffer[] = []; for await (const part of stream!) parts.push(Buffer.from(part));
  const document = JSON.parse(Buffer.concat(parts).toString());
  expect(document).toEqual(tuningDocument({ ...DEFAULTS, character: { ...DEFAULTS.character, speed: 120 } }));
  document.values.character.speed = 150;
  document.values.crt.scanlinesEnabled = 1;
  document.values.crt.scanlineStrength = .4;
  document.values.crt.scanlinePeriod = 6;
  document.values.crt.hudStrength = .4;
  document.values.motion.strength = .2;
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#tuning-import').focus(); await page.keyboard.press('Space');
  await (await chooser).setFiles({ name: 'tuning.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) });
  await expect.poll(() => current(page)).toEqual(document.values);
  document.version = 100;
  await page.locator('#tuning-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.locator('#tuning-status')).toContainText('Unsupported');
  expect(await current(page)).toEqual(document.values);
  await page.locator('#tuning-reset').focus(); await page.keyboard.press('Space');
  expect(await current(page)).toEqual(DEFAULTS);
  await expect(page.locator('#tuning-panel')).toBeVisible();
});

test('restart-required edits remain atomic while the viewport cannot start a run', async ({ page }) => {
  await start(page); await fork(page, 1);
  await page.locator('#tuning-toggle').click();
  await page.getByText('Forks & held merge', { exact: true }).click();
  await page.locator('#tune-branches-height').fill('70'); await page.locator('#tune-branches-height').press('Tab');
  expect((await current(page)).branches.height).toBe(58);
  await page.setViewportSize({ width: 120, height: 320 });
  await expect(page.locator('#size-warning')).toBeVisible();
  await page.locator('#tuning-apply').click();
  await expect(page.locator('#tuning-status')).toContainText('Enlarge the game viewport');
  expect((await current(page)).branches.height).toBe(58);
  expect(await page.evaluate(() => window.forkingHell.snapshot().depth)).toBe(1);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator('#tuning-apply').click();
  expect((await current(page)).branches.height).toBe(70);
  expect(await page.evaluate(() => window.forkingHell.snapshot().depth)).toBe(0);
  await expect(page.locator('#tuning-apply')).toBeHidden();
});

test('legacy timing import announces migration and preserves both durations', async ({ page }) => {
  await start(page); await page.locator('#tuning-toggle').click();
  const values: Record<string, unknown> = structuredClone(DEFAULTS);
  delete values.coins; delete values.crt; delete values.motion;
  for (const section of JUMP_EFFECT_SECTIONS) delete values[section];
  values.branches = { length: 24, height: 58, transition: .8, holdDelay: 0 };
  await page.locator('#tuning-file').setInputFiles({
    name: 'legacy.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ format: 'forking-hell-tuning', version: 1, values })),
  });
  await expect(page.locator('#tuning-status')).toContainText('Migrated version 1');
  await page.locator('#tuning-apply').click();
  expect((await current(page)).branches.liftDuration).toBe(.8);
  expect((await current(page)).branches.collapseDuration).toBe(.8);
  expect((await current(page)).crt.enabled).toBe(0);
  expect((await current(page)).motion.enabled).toBe(0);
});

test('complete v2 import preserves existing values, announces new effects, and Reset restores all groups', async ({ page }) => {
  await start(page); await page.locator('#tuning-toggle').click();
  const values: Record<string, unknown> = structuredClone(DEFAULTS);
  for (const section of JUMP_EFFECT_SECTIONS) delete values[section];
  values.character = { ...DEFAULTS.character, speed: DEFAULTS.character.speed + 1 };
  await page.locator('#tuning-file').setInputFiles({
    name: 'v2.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ format: 'forking-hell-tuning', version: 2, values })),
  });
  await expect(page.locator('#tuning-status')).toContainText('Migrated version 2');
  expect(await current(page)).toEqual({ ...DEFAULTS, ...values });
  await expect(page.locator('#tuning-apply')).toBeHidden();
  await page.locator('#tuning-reset').click();
  expect(await current(page)).toEqual(DEFAULTS);
});

test('native touch tap and hold measure half/full jump height and cancel releases ownership', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'touch', 'Native touch events use Chromium CDP.');
  await start(page);
  const client = await context.newCDPSession(page);
  const rect = await page.locator('[data-control="jump"]').boundingBox();
  const point = { x: rect!.x + rect!.width / 2, y: rect!.y + rect!.height / 2, id: 1 };
  const peaks = [];
  for (const held of [false, true]) {
    await page.evaluate(() => {
      const output = document.createElement('output'); output.id = 'jump-apex-evidence'; output.hidden = true;
      document.body.append(output);
      let peak = 0;
      const sample = (): void => {
        const y = window.forkingHell.snapshot().y; peak = Math.max(peak, y);
        output.value = String(peak);
        if (peak > 0 && y === 0) output.dataset.done = 'true';
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    if (!held) await Promise.all([
      client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] }),
      client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
    ]);
    else {
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await expect(page.locator('[data-control="jump"]')).toHaveClass(/pressed/);
    }
    await page.waitForFunction(() => document.querySelector<HTMLElement>('#jump-apex-evidence')?.dataset.done);
    peaks.push(await page.locator('#jump-apex-evidence').evaluate((e: HTMLOutputElement) => Number(e.value)));
    if (held) {
      await page.waitForTimeout(200); expect((await page.evaluate(() => window.forkingHell.snapshot())).y).toBe(0);
      await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    }
    await expect(page.locator('[data-control="jump"]')).not.toHaveClass(/pressed/);
    await page.locator('#jump-apex-evidence').evaluate(e => e.remove());
  }
  expect(Math.abs(peaks[0]! - DEFAULTS.physics.jumpHeight / 2)).toBeLessThan(.4);
  expect(Math.abs(peaks[1]! - DEFAULTS.physics.jumpHeight)).toBeLessThan(.4);
});

test('staged lineage reaches all ancestors and holding merge stops on release', async ({ page }) => {
  await start(page);
  for (let d = 1; d <= 6; d++) await fork(page, d);
  await page.keyboard.down('KeyD'); await page.waitForFunction(() => window.forkingHell.snapshot().staged.includes('0:0')); await page.keyboard.up('KeyD');
  await expect.poll(() => page.evaluate(() => window.forkingHell.diagnostics().highlightedCopies)).toBe(7);
  await page.evaluate(() => {
    window.addEventListener('keyup', () => {
      const state = window.forkingHell.snapshot();
      document.body.dataset.releaseDepth = String(state.depth - Number(state.transition === 'merge'));
    }, { once: true, capture: true });
  });
  await page.keyboard.down('KeyS');
  await page.waitForFunction(() => window.forkingHell.snapshot().depth === 5 && window.forkingHell.snapshot().transition === 'merge');
  await page.keyboard.up('KeyS');
  const acceptedDepth = await page.evaluate(() => Number(document.body.dataset.releaseDepth));
  expect(acceptedDepth).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.forkingHell.snapshot().depth)).toBe(acceptedDepth);
  expect(await page.evaluate(() => window.forkingHell.snapshot().mergeCombo)).toBe(0);
  await page.keyboard.down('KeyS'); await page.waitForFunction(() => window.forkingHell.snapshot().depth === 0); await page.keyboard.up('KeyS');
  expect(await page.evaluate(() => window.forkingHell.snapshot().converted)).toBe(6);
});

test('mobile repeated taps and holds avoid selection while tuning numbers remain editable', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'touch', 'Native pointer evidence uses Chromium CDP touch.');
  await start(page);
  await page.evaluate(() => {
    const range = document.createRange(); range.selectNodeContents(document.querySelector('h1')!);
    window.getSelection()?.addRange(range);
  });
  for (let i = 0; i < 5; i++) await page.locator('[data-control="jump"]').tap();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('');
  for (let d = 1; d <= 6; d++) await fork(page, d);
  await page.evaluate(() => {
    window.addEventListener('pointercancel', () => {
      const state = window.forkingHell.snapshot();
      document.body.dataset.cancelDepth = String(state.depth - Number(state.transition === 'merge'));
    }, { once: true, capture: true });
  });
  const rect = await page.locator('[data-control="merge"]').boundingBox();
  const client = await context.newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rect!.x + rect!.width / 2, y: rect!.y + rect!.height / 2, id: 1 }] });
  await page.waitForFunction(() => window.forkingHell.snapshot().depth === 5 && window.forkingHell.snapshot().transition === 'merge');
  await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  const acceptedDepth = await page.evaluate(() => Number(document.body.dataset.cancelDepth));
  expect(acceptedDepth).toBeGreaterThan(0);
  await page.waitForTimeout(550);
  expect(await page.evaluate(() => window.forkingHell.snapshot().depth)).toBe(acceptedDepth);
  expect(await page.evaluate(() => window.forkingHell.snapshot().transition)).toBeNull();
  await page.locator('#tuning-toggle').tap(); await page.locator('#tuning-sections summary').first().tap();
  const number = page.locator('#tune-character-speed'); await number.fill('135'); await number.press('Tab');
  expect((await current(page)).character.speed).toBe(135);
  expect(await number.evaluate(e => getComputedStyle(e).userSelect)).toBe('text');
  expect(await page.locator('body').evaluate(e => getComputedStyle(e).userSelect)).toBe('none');
  expect(await number.evaluate(e => getComputedStyle(e).fontFamily)).toContain('Fork Pixel');
  expect(await page.evaluate(() => document.fonts.check('16px "Fork Pixel"'))).toBe(true);
});
