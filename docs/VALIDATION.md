# Integrated refinement validation

## Executed checks

- Strict TypeScript and Vite production build passed.
- **67 unit tests passed**: signed time, gates/transition contacts, reversible projectiles, character/camera behavior, strict v2 and historical v1 migration, independent 0.8-second lift/0.2-second collapse, recursive permanent rewards and depth 8/64/256. Coin checks cover no reward before impact, exactly-once conversion, pause/reversal, ramp-to-parent ownership, collision separation and a bounded solver conserving rewards through 256 merges.
- Variable-jump cases measure actual apexes at gravity/height pairs 850/38, 150/120 and 1800/12, with 0.15-world-pixel fixed-step tolerance. Minimum taps reach half full-held height; intermediate holds are monotonic. Moving supports do not add jump energy. Held input does not auto-jump after landing.
- **83 source browser checks passed**, nine intentionally skipped: Chromium, Firefox, WebKit and DPR3 Chromium touch emulation. Only three Chromium-CDP touch cases skip in each non-CDP project.
- **67 checks passed against the exact extracted production ZIP**, 25 intentionally skipped: the same nine non-CDP cases plus sixteen source-only renderer fixture cases. No fixture or mutation hooks ship in the ZIP.
- Real-renderer checks compare 64 zoom/pan/physical-scale combinations per project: exact native patches, exact filtered source-to-display palette mapping (including observed old sprite-ink texels), and zero final nearest-sample mismatches outside documented GPU edge ties. The 0.3-zoom/scale-1 case retains 50 eligible sampled pixels after exclusions; the coverage guard is greater than 40, not a relaxed color-mismatch threshold.
- Early/mid/late geometry checks cover lifting and collapsing main/nested/backtracked forks at two zooms. Support samples, commit centers and bright platform joins agree. Activated atlas comparisons preserve silhouette/alpha and unrelated targets.
- Integrated CRT checks verify static optics, exact output restoration when disabled, independent motion/CRT toggles, pause/reset behavior, high-refresh pose retention and camera-independent geometry anchors. This is integrated evidence, not a claim based solely on the effects author's isolated suite.
- Keyboard-only menus, focus restoration and input clearing pass all engines, including explicit Safari tab stops. Native touch verifies simultaneous actions/cancellation, pressed states, editable tuning fields, and tap/full apexes within 0.4 pixels of 19/38.
- Packaging is deterministic across local/UTC time zones. The final ZIP contains twelve files, including the local pixel font, artwork and license/upload documents. Public files were checked for private paths, credentials and reference/prototype material.

The reviewed ZIP is **430,099 bytes**, SHA-256:

```text
67e86daa1c8554e45d3a032b9d07f383a8461f6762e68849f18c7c63a4d40846
```

Desktop, landscape/portrait touch, activated lineage, Tune, pause/results and coin-spread screenshots were captured from the live game. A 15.83-second, 1280x800, 30-fps H.264 MP4 shows four controlled lifts, eight conversions on successive landings, separated coin piles and returning to collect. It uses an imported 0.8/0.2 timing preset; shipped defaults remain 0.34/0.34. Capture is silent and uses real game controls, not a renderer fixture. A longer control-driven run reached X=1373.5 before normal game over, with captures across the varied playfield.

## Measurements, not device guarantees

On the macOS arm64 development host with Node 24.3.0, `node scripts/benchmark.mjs` recorded:

| Branch depth | Mean simulation step | 95th percentile |
| --- | --- | --- |
| 8 | 0.00582 ms | 0.01462 ms |
| 64 | 0.01148 ms | 0.02321 ms |
| 256 | 0.02682 ms | 0.03917 ms |

These are **simulation-only** measurements over 5,000 steps, not full rendering benchmarks or worst-case coin-pile timings. Local shot queries returned five records. Exploring 200 chunks increased retained shot records from 5 to 1,477 while the chunk cache stayed at 24, illustrating intentionally non-constant retained history. The coin solver integrates at most 96 selected coins and examines at most 3,072 neighbor entries per step; extreme piles are time-sliced.

Sequential Chromium samples of a three-lane scene measured 120 requestAnimationFrame intervals each:

| Display | CRT | Mean frame interval | 95th percentile |
| --- | --- | --- | --- |
| Desktop 1280x800, DPR1 | On | 16.67 ms | 16.80 ms |
| Landscape 844x390, DPR3 | On | 25.00 ms | 33.40 ms |
| Same landscape | Off | 16.67 ms | 16.70 ms |
| Portrait 390x844, DPR3 | On | 16.67 ms | 16.70 ms |

**The high-DPR landscape CRT case was about 40 fps, not 60.** Disabling CRT restored approximately 60 fps in that capture. These are host/browser observations, not isolated GPU timings, a worst-case firefight benchmark or phone performance guarantees. No output downsampling was introduced to disguise the cost.

## Remaining external evidence

Actual iOS/Android hardware testing is not available from this environment. Emulation and desktop WebKit are not substitutes for real mobile Safari, thermal, battery, touch-latency or GPU evidence.

The real itch.io iframe cannot be validated until the author signs in, completes security verification and uploads the ZIP. Jam eligibility and submission remain separate user decisions. GitHub Pages availability should always be checked against the live deployment, not inferred from a successful local build.

The large-bundle warning is expected: Phaser accounts for most of the approximately 1.46 MB raw / 396 KB gzip JavaScript. No claim of constant memory, universal 60 fps or guaranteed Game Off eligibility is made.
