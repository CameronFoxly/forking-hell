import { expect, test } from '@playwright/test';

test('early, mid and late eased connectors meet the commit center and platform band', async ({ page }) => {
  test.skip(Boolean(process.env.PREVIEW_URL), 'Test-only renderer fixture is not distributed.');
  await page.goto('/tests/render-fixture.html');
  await page.waitForFunction(() => Boolean(window.tweenProbe));
  const samples = await page.evaluate(async () => {
    const samples = [];
    for (const kind of ['branch', 'merge'] as const) for (const nested of [false, true, 'backtracked'] as const) for (const zoom of [.88, .48]) for (const steps of [3, 10, 20]) {
      const p = await window.tweenProbe(kind, steps, nested, zoom);
      const image = new Image(); image.src = p.image; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, image.width, image.height).data;
      const color = (x: number, y: number): number => {
        const i = ((y + p.top) * image.width + x - p.left) * 4;
        return (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
      };
      samples.push({
        kind, nested, zoom, steps, worldY: p.worldY,
        colors: p.points.map(([x, y]) => color(x!, y!)),
        end: color(p.end[0]!, p.end[1]! + 1),
        aboveEnd: color(p.end[0]! + 1, p.end[1]! - 1),
        center: color(p.foot[0]!, p.foot[1]! + 1),
      });
    }
    return samples;
  });
  for (const p of samples) {
    expect(p.colors, JSON.stringify(p)).toEqual([0x75f6ec, 0x75f6ec]);
    expect(p.end).toBe(0x75f6ec);
    expect(p.center).toBe(0x75f6ec);
    expect(p.aboveEnd).not.toBe(0x75f6ec);
  }
});
