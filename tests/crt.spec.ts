import { expect, test } from '@playwright/test';

test('CRT is static and disabling it restores the exact native-grid presentation', async ({ page }) => {
  test.skip(Boolean(process.env.PREVIEW_URL), 'Test-only deterministic fixture is not distributed.');
  await page.goto('/tests/render-fixture.html');
  await page.waitForFunction(() => Boolean(window.effectProbe));
  const result = await page.evaluate(async () => ({
    off: await window.effectProbe(false), on: await window.effectProbe(true),
    stable: await window.effectProbe(true), restored: await window.effectProbe(false),
  }));
  expect(result.on).not.toBe(result.off);
  expect(result.stable).toBe(result.on);
  expect(result.restored).toBe(result.off);
});

test('CRT and motion remain independently tunable and pause clears motion', async ({ page }) => {
  await page.goto('/'); await page.locator('#start').click();
  await expect.poll(() => page.evaluate(() => window.forkingHell.diagnostics().crtActive)).toBe(true);
  await page.locator('#tuning-toggle').click();
  await page.getByText('CRT monitor optics', { exact: true }).click();
  await page.locator('#tune-crt-enabled').uncheck();
  await expect.poll(() => page.evaluate(() => window.forkingHell.diagnostics().crtActive)).toBe(false);
  await page.locator('#tuning-close').click(); await page.locator('#game').focus();
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.forkingHell.diagnostics().motionDraws > 0);
  expect(await page.evaluate(() => window.forkingHell.snapshot().time)).toBe(0);
  await page.keyboard.press('Escape'); await page.keyboard.up('Space');
  await expect.poll(() => page.evaluate(() => window.forkingHell.diagnostics().motionDraws)).toBe(0);
  await page.locator('#reduced').check(); await page.keyboard.press('Escape');
  await page.keyboard.press('KeyW');
  await expect.poll(() => page.evaluate(() => window.forkingHell.diagnostics().motionDraws)).toBe(0);
});
