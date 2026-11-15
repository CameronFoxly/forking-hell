import { expect, test } from '@playwright/test';
import { DEFAULTS } from '../src/tuning';

test('keyboard release/repress double-jumps, rejects a third launch, and jump effects tune live to zero', async ({ page }) => {
  await page.goto('/'); await page.locator('#start').click();
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.forkingHell.snapshot().y > 10);
  expect(await page.evaluate(() => window.forkingHell.snapshot().airJumpAvailable)).toBe(true);
  expect(await page.evaluate(() => window.forkingHell.diagnostics().jumpParticles)).toBeGreaterThan(0);
  await page.keyboard.down('Space');
  expect(await page.evaluate(() => window.forkingHell.snapshot().airJumpAvailable)).toBe(true);
  await page.keyboard.up('Space'); await page.keyboard.down('Space');
  await page.waitForFunction(() => !window.forkingHell.snapshot().airJumpAvailable);
  expect(await page.evaluate(() => window.forkingHell.snapshot().animation.clip)).toBe('Jump_Up');
  await page.waitForFunction(height => window.forkingHell.snapshot().y > height + 5, DEFAULTS.physics.jumpHeight);
  await page.keyboard.up('Space');
  await page.waitForFunction(() => window.forkingHell.snapshot().animation.clip === 'JumpDown');
  await page.keyboard.down('Space'); await page.waitForTimeout(60);
  expect(await page.evaluate(() => window.forkingHell.snapshot().animation.clip)).toBe('JumpDown');
  await page.waitForFunction(() => window.forkingHell.snapshot().y === 0);
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => window.forkingHell.snapshot().y)).toBe(0);
  expect(await page.evaluate(() => window.forkingHell.snapshot().airJumpAvailable)).toBe(true);
  await page.keyboard.up('Space');

  await page.locator('#tuning-toggle').click();
  for (const [section, field] of [
    ['First-jump poof', 'jumpBurst-count'], ['Double-jump poof', 'doubleJumpBurst-size'], ['Jump trail', 'jumpTrail-rate'],
  ]) {
    await page.getByText(section!, { exact: true }).click();
    const input = page.locator(`#tune-${field}`);
    await input.fill('0'); await input.press('Tab');
  }
  await expect(page.locator('#tuning-apply')).toBeHidden();
  await page.locator('#tuning-close').click(); await page.locator('#game').focus();
  await page.keyboard.down('Space'); await page.waitForFunction(() => window.forkingHell.snapshot().y > 4);
  expect(await page.evaluate(() => window.forkingHell.diagnostics().jumpParticles)).toBe(0);
  await page.keyboard.press('Escape');
  const frozen = await page.evaluate(() => window.forkingHell.snapshot());
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.forkingHell.snapshot())).toEqual(frozen);
});

test('native touch and keyboard owners must all release before consuming the air jump', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'touch', 'Native touch ownership uses Chromium CDP.');
  await page.goto('/'); await page.locator('#start').click();
  const client = await context.newCDPSession(page);
  const box = (await page.locator('[data-control="jump"]').boundingBox())!;
  const first = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
  const second = { ...first, x: first.x + 8, id: 2 };
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
  await page.waitForFunction(() => window.forkingHell.snapshot().y > 8);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first, second] });
  await page.keyboard.down('Space');
  expect(await page.evaluate(() => window.forkingHell.snapshot().airJumpAvailable)).toBe(true);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('[data-control="jump"]')).toHaveClass(/pressed/);
  expect(await page.evaluate(() => window.forkingHell.snapshot().airJumpAvailable)).toBe(true);
  await page.keyboard.up('Space');
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
  await page.waitForFunction(() => !window.forkingHell.snapshot().airJumpAvailable);
  await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(page.locator('[data-control="jump"]')).not.toHaveClass(/pressed/);
  await page.waitForFunction(() => window.forkingHell.snapshot().y === 0);
  expect(await page.evaluate(() => window.forkingHell.snapshot().airJumpAvailable)).toBe(true);
});
