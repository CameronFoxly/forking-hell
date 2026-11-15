import { test, expect } from '@playwright/test';

test('world texels survive zoom and slow panning until the final physical display sample', async ({ page }) => {
  test.skip(Boolean(process.env.PREVIEW_URL), 'Test-only deterministic renderer fixture is not distributed.');
  await page.goto('/tests/render-fixture.html');
  await page.waitForFunction(() => Boolean(window.renderProbe));
  const results = await page.evaluate(async () => {
    const palette = [0x08060f, 0x221943, 0x352558, 0x6951a6, 0xa17be3, 0xd5b0ff, 0x75f6ec, 0xf5ecff, 0xffd394, 0xff799d];
    async function pixels(url: string): Promise<ImageData> {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, image.width, image.height);
    }
    const color = (image: ImageData, x: number, y: number): number => {
      const i = (y * image.width + x) * 4;
      return (image.data[i]! << 16) | (image.data[i + 1]! << 8) | image.data[i + 2]!;
    };
    const quantize = (c: number): number => c === 0x14102b ? 0x08060f : palette.reduce((best, candidate) => {
      const distance = (p: number): number => [16, 8, 0].reduce((sum, shift) => sum + (((c >> shift) & 255) - ((p >> shift) & 255)) ** 2, 0);
      return distance(candidate) < distance(best) ? candidate : best;
    });

    const samples = [];
    for (const scale of [1, 3]) for (const zoom of [.88, .875, .87, .65, .645, .64, .48, .3]) for (const pan of [0, .2, .6, 1.2]) {
      const probe = await window.renderProbe(zoom, pan, scale);
      const native = await pixels(probe.native), filtered = await pixels(probe.filtered), screen = await pixels(probe.screen);
      const patches: number[][] = [];
      const differences: object[] = [];
      let mismatches = 0, nativeMismatches = 0, checked = 0, sourceInk = 0;
      for (const [left, top, width, height] of [[147, -27, 26, 27], [219, -27, 26, 27], [270, 0, 24, 7]]) {
        const patch = [];
        for (let y = top!; y < top! + height!; y++) for (let x = left!; x < left! + width!; x++) {
          patch.push(color(native, x - probe.left, y + probe.top));
          if (color(native, x - probe.left, y + probe.top) === 0x14102b) sourceInk++;
          if (color(filtered, x - probe.left, y + probe.top) !== quantize(color(native, x - probe.left, y + probe.top))) nativeMismatches++;
        }
        patches.push(patch);
        const x0 = Math.ceil(probe.x + (left! - probe.left) * probe.pitch);
        const y0 = Math.ceil(probe.y + (top! + probe.top) * probe.pitch);
        const x1 = Math.floor(probe.x + (left! + width! - probe.left) * probe.pitch);
        const y1 = Math.floor(probe.y + (top! + height! + probe.top) * probe.pitch);
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const sx = (x + .5 - probe.x) / probe.pitch, sy = (y + .5 - probe.y) / probe.pitch;
          // Only the final physical sample admits GPU texture-coordinate ties.
          if (Math.abs(sx - Math.round(sx)) < 1 / 16 || Math.abs(sy - Math.round(sy)) < 1 / 16) continue;
          if (color(screen, x, y) !== quantize(color(native, Math.floor(sx), Math.floor(sy)))) {
            mismatches++;
            if (differences.length < 8) differences.push({ x, y, sx, sy, actual: color(screen, x, y), expected: quantize(color(native, Math.floor(sx), Math.floor(sy))) });
          }
          checked++;
        }
      }
      samples.push({ scale, zoom, pan, mismatches, nativeMismatches, checked, sourceInk, patches, differences, resolution: [native.width, native.height], filter: probe.filter });
    }
    return samples;
  });
  for (const result of results) {
    expect(result.filter).toEqual(result.resolution);
    expect(result.patches).toEqual(results[0]!.patches);
    expect(result.nativeMismatches).toBe(0);
    expect(result.sourceInk).toBeGreaterThan(0);
    expect(result.checked).toBeGreaterThan(40);
    expect(result.mismatches, JSON.stringify({ zoom: result.zoom, pan: result.pan, scale: result.scale, differences: result.differences })).toBe(0);
  }
});

test('parent junctions stay solid and only staged ancestor sprites change palette', async ({ page }) => {
      test.skip(Boolean(process.env.PREVIEW_URL), 'Test-only deterministic renderer fixture is not distributed.');
      await page.goto('/tests/render-fixture.html');
      await page.waitForFunction(() => Boolean(window.junctionProbe));
      const results = await page.evaluate(async () => {
        const results = [];
        for (const staged of [false, true]) for (const merges of [0, 1, 2]) for (const pan of [0, .4, 1.2]) {
          const probe = await window.junctionProbe(staged, merges, pan);
          const image = new Image(); image.src = probe.image; await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
          const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
          const rgba = ctx.getImageData(0, 0, image.width, image.height).data;
          const pixel = (x: number, y: number): number => {
            const i = ((y + probe.top) * image.width + x - probe.left) * 4;
            return (rgba[i]! << 16) | (rgba[i + 1]! << 8) | rgba[i + 2]!;
          };
          const rows = probe.forks.map(fork => Array.from({ length: fork.end - fork.x - 7 }, (_, i) => pixel(fork.x + i + 7, fork.y + 4)));
          const patches = [232, 370].map(x => {
            const pixels = [];
            for (let y = -27; y < 0; y++) for (let dx = -13; dx < 13; dx++) pixels.push(pixel(x + dx, y));
            return pixels;
          });
          results.push({ staged, merges, pan, rows, patches, supports: probe.supports, danger: probe.danger, converted: probe.converted });
        }
        return results;
      });
      for (const result of results) {
        for (const row of result.rows) expect(row.every(color => color === 0x352558)).toBe(true);
        expect(result.supports[0]).toBe(0);
        if (!result.merges) expect(result.supports[1]).toBe(58);
        const unstaged = results.find(other => !other.staged && other.merges === result.merges && other.pan === result.pan)!;
        expect(result.patches[1]).toEqual(unstaged.patches[1]);
        if (result.staged && result.merges < 2) {
          expect(result.danger).toBe(true);
          expect(result.converted).toBe(false);
          expect(result.patches[0]).not.toEqual(unstaged.patches[0]);
          expect(result.patches[0]).toContain(0x75f6ec);
          const mapped = unstaged.patches[0]!.map(c => c === 0xa17be3 ? 0x75f6ec : c === 0xd5b0ff ? 0xf5ecff : c);
          expect(result.patches[0]).toEqual(mapped);
        }
        if (result.staged && result.merges === 2) expect(result.converted).toBe(true);
      }
});
