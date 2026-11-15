# Initial release validation

## Executed checks

- Strict TypeScript and Vite production build passed.
- **42 unit tests passed**: signed time, blocked movement, forward-only jumping, ramps, recursive staging/merging, permanent per-copy rewards, lower-lane aimed shots, firing/expiry reversal, transition contact/gates, character timing, camera behavior, persistence and depth 8/64/256.
- **41 browser checks passed** against the extracted production ZIP in Chromium, Firefox, WebKit and Chromium mobile emulation. Three intentional skips exclude the Chromium-CDP-specific three-touch injection from the other projects; the actual touch case passed in the touch project.
- Browser checks cover palette readback, physical integer pixel origin/scale, native world scale across zoom, keyboard/jump/time, simultaneous touch/cancellation, nested reward flow, pause/focus, storage failures, resize recovery, unavailable WebGL, denied fullscreen, game over and restart.
- Repackaging the final build in local and UTC time zones produced byte-identical ZIPs.
- The public file inventory was checked for reference images, private paths, caches and credentials. Only the authorized recolored character atlas and original generated hazard atlas are game images.

## Measurements, not device guarantees

On the macOS arm64 development host with Node 24.3.0, `node scripts/benchmark.mjs` recorded:

| Branch depth | Mean simulation step | 95th percentile |
| --- | --- | --- |
| 8 | 0.0057 ms | 0.0122 ms |
| 64 | 0.0108 ms | 0.0228 ms |
| 256 | 0.0239 ms | 0.0367 ms |

These are **simulation-only** measurements over 5,000 steps, not full rendering benchmarks. Local shot queries returned five records. Exploring 200 chunks increased retained shot records from 5 to 1,595 while the chunk cache stayed at 24, illustrating intentionally non-constant retained history.

Sequential Chromium captures of a three-lane, nine-visible-encounter scene averaged approximately **16.67 ms per rendered frame** for desktop, landscape mobile emulation and portrait mobile emulation. The shared shader executed, world sprite scales matched the camera at each checked zoom, and physical presentation scales were integral. Those captures do not measure a worst-case firefight or establish performance on actual phones.

## Remaining external evidence

Actual iOS/Android hardware testing is not available from this environment. Emulation and desktop WebKit are not substitutes for real mobile Safari, thermal, battery, touch-latency or GPU evidence.

The real itch.io iframe cannot be validated until the author signs in, completes security verification and uploads the ZIP. Jam eligibility and submission remain separate user decisions. GitHub Pages availability should always be checked against the live deployment, not inferred from a successful local build.

The large-bundle warning is expected: Phaser accounts for most of the approximately 1.4 MB raw / 384 KB gzip JavaScript. No claim of constant memory, universal 60 fps or guaranteed Game Off eligibility is made.
