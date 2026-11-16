# Validation

## Current source: moving crawler switches

**105 unit tests, strict TypeScript/build and all 40 targeted browser checks passed** across Chromium, Firefox, WebKit and DPR3 Chromium touch emulation. The browser run covers `fork-coverage`, `render`, `tween-render` and `projectiles`; this is not a full-suite or physical-device claim.

Three focused unit cases cover contact at the current patrol position instead of the old spawn center, positive/negative frozen environmental time, two fork depths, nested-ramp support height and stage-burst emission origin. Both stale-center contact cases failed before the fix. A renderer probe checks 16 frames per browser target: staged/unstaged rings, connector strokes, highlights and actual motion-tracker anchors on one/two forks, moving forward, frozen and reversed.

Real keyboard routes in every browser target create a nested fork, move forward, freeze, reverse, touch the moving crawler switch and backtrack with its stage intact and all three hearts remaining. Visually reviewed desktop/mobile-layout captures show the ring and both crawler copies vertically aligned; saved as `crawler-review/desktop-staged.png` and `crawler-review/mobile-staged.png` in session files. Acceptance log: `crawler-browser.log`.

The persistent local preview was restarted and verified at `http://127.0.0.1:4173/`. All v3 defaults, immutable fork coverage, source-owned projectile behavior and other enemy positions remain unchanged. Source/build only: no public deployment or ZIP update.

## Visible-only fork coverage: `4ee63ac`

**102 unit tests, strict TypeScript/build and 100 targeted browser checks passed**, with 12 intended CDP-only skips. The browser run covers `fork-coverage`, `browser`, `projectiles`, `render`, `tween-render`, `jump` and `tuning` across Chromium, Firefox, WebKit and DPR3 Chromium touch emulation. This is not a full-suite or physical-device claim.

Each accepted fork snapshots only the displayed enemy/switch identities. Six focused units cover copied/nonexpanding coverage, cache eviction and regeneration, reversal, rejected forks, uncovered top patrol/shooter damage, top-source firing, refork/contact staging, merge propagation through an older uncovered branch, and source retirement versus an uncovered parent's still-valid replay history. Existing transaction/geometry scenarios now supply their intended visible targets explicitly instead of relying on unlimited top safety.

Each browser target compares 144 actual before/after rendered images: shooter bodies, moving patrols and switches at all four view edges, zoom 0.88/0.3 and output scales 1/3. Coverage matches whether the sprite contributes displayed pixels, including when an entity is drawn into overscan but entirely outside the canvas. Pan after the fork never changes the captured set. Initial acceptance caught a subpixel bounding-box false positive; coverage now checks nearest-neighbor physical samples against source alpha instead of geometric overlap alone. These checks concern the gameplay composition, not cosmetic CRT/glow fringes.

Real keyboard routes in every browser target encounter a shooter absent from the original fork's coverage, observe its active top source and airborne shot, then create a new fork, touch its switch and merge into the original branch. The receiving shooter converts while main remains active; original coverage does not grow. Desktop and mobile-layout captures are preserved in session files under `fork-coverage-review/` (`desktop-uncovered.png`, `desktop-staged.png`, `mobile-uncovered.png`, `mobile-staged.png`). Acceptance log: `fork-coverage-browser.log`.

Already-airborne shots keep the existing independent-flight rule: converted/hidden/removed sources' shots last only until the next birth/expiry boundary. Merging back to an **uncovered, living** top shooter does not retire its legitimate replay path. The source defaults, encounter progression, permanent rewards, common pixel rendering and letterboxing remain unchanged. This is local source/build work; no public deployment or ZIP update was made.

## Varied encounter progression and final input boundaries: `0a434dc`

**96 unit tests and strict TypeScript/build passed.** Across the focused browser runs, 122 distinct applicable checks passed and six CDP-only cases were intentionally skipped. The final 60-case menu/projectile rerun passed across Chromium, Firefox, WebKit and DPR3 Chromium touch; the other 62 checks cover general gameplay/recovery, double jump, native touch ownership, exact world-pixel rendering and eased geometry/shake. This is not a full-suite or physical-phone claim.

Realized generation measurements use 16 fixed seeds, eight chunks per distance window, and include gaps across chunk seams:

| World X window | Mean center gap | Mean motion-envelope clearance | Encounters/chunk | Shooter share |
| --- | --- | --- | --- | --- |
| 0-3,840 | 262.8 px | 220.6 px | 1.77 | 9.3% |
| 5,760-9,600 | 171.8 px | 133.6 px | 2.77 | 26.3% |
| 19,200-23,040 | 134.6 px | 100.3 px | 3.54 | 46.6% |

Center-gap 10th/90th percentiles are 132/448, 92/268 and 82/203 pixels respectively; interquartile widths remain 155, 90 and 59 pixels rather than tiny grid jitter. Every checked motion envelope has at least 40 pixels of clearance, including seams at patrol radii 0, 24 and 60 across 80 chunks per seed. The 640-pixel maximum center gap, variable counts, bounded cache and exact regeneration after distant queries, reversal and nested branch actions are covered. The new opening-density regression failed against the old generator before implementation.

Projectile scenarios now find actual shooters rather than assuming chunk 1's first enemy is always one. The real-control fixture uses a naturally occurring early shooter (seed 116), forks away from the widened opening spinner, and waits for the requested depth as well as completed lift. Its changed firing timestamp exposed subtraction-rounding at exact expiry: checking absolute birth/expiry timestamps now consistently retires converted/removed-source flight at the boundary. Already-airborne shots still survive independently only until their next birth/expiry boundary; living lower counterparts remain active.

Final shortcut checks also cover releasing Control before a held Space. The original rejected activation is retained through Space's native keyup click, preventing an accidental start without canceling the shortcut. All 52 menu cases pass, including this cross-browser regression.

A bounded, keyboard-controlled desktop/mobile-layout route traveled from X64 to roughly X6,840 without teleportation, altered tuning or damage. Opening captures show four rendered copies and no nearby shooters; later captures show ten copies and two active lower shooters, with switches only above. Both layouts retained all three hearts and reported no runtime errors. Session evidence: `generation-distributions.json`, `generation-review/evidence.json`, four opening/later screenshots and `input-projectile-final.log`. Existing v3 defaults are unchanged. Source and build remain local; the public site and ZIP are unchanged.

## Keyboard menus and readiness-gated start

**92 existing unit tests, strict TypeScript/build and all 48 keyboard-menu browser cases passed** across Chromium, Firefox, WebKit and DPR3 Chromium touch. The broader `browser` suite also passed its 41 applicable cases, with three CDP-only skips. Keyboard acceptance covers six starting keys, held/repeated input, native shortcuts and IME, all jump-particle Tune sections, keyboard export/Reset, pause/settings/results, notice dismissal, loading, failed artwork recovery and undersized viewports. The starting key is consumed until release; no gameplay action leaks from it.

Cross-browser acceptance caught Firefox stripping modifiers from a native button-generated click. Start now checks the initiating key state as well as the click flags without intercepting browser shortcuts. The image-failure fixture now rejects every loader retry until recovery is explicitly enabled, and the full native Tune traversal has a 60-second test budget for slower touch rendering. No defaults, physics or pixel rendering were changed. This is local source/build work, not a public deployment or package update.

## Double jump, black letterboxing and top switches: `041fa27`

**92 unit tests, strict TypeScript/build and 55 targeted browser checks passed**, with nine intended CDP-only skips in the 64-case browser run. The browser run covered `jump`, `letterbox`, `projectiles`, `tuning`, `render` and `tween-render` across Chromium, Firefox, WebKit and DPR3 Chromium touch emulation. This is not a claim that every browser suite was rerun or that physical phone hardware was tested.

Double-jump checks cover fresh release/press, held input, no third jump, rising/falling second launches, physical-landing reset, and no reset from a branch/merge alone. Measured per-launch tap/full heights retain the 2:1 envelope across default and extreme gravity/height pairs. Native touch plus keyboard ownership, same-tick edges, live zero controls and pause are covered. Acceptance caught a launch pose advancing once after pause; moving that pending advance to the next unpaused animation update preserves both the drawn pose and second-jump restart.

Particle checks cover absolute emission origins, survival after support removal, forward-only lifetime, pause/reversal, independent zero settings, reduced effects and the 128-particle bound. A separate real-control desktop/mobile pass observed second jumps above 81 world pixels with active burst/trail particles while environmental time stayed zero. The silent H.264 recording `jump-review/double-jump-gameplay.mp4` is 9.03 seconds at 1280x800 and 30 fps.

All existing values match the complete `(5)` attachment exactly. Only the three new particle groups and schema version 3 were added. Strict v1/v2 migration, fresh initialization, Reset and an actual downloaded v3 export were verified; no active user tuning page was manually reset. Session evidence includes `jump-review/evidence.json`, `defaults-export.json` and the desktop/mobile screenshots.

Real screenshot samples outside the canvas are opaque `[0, 0, 0, 255]` at desktop/wide and mobile portrait/landscape sizes, including Tune-open layouts. The canvas retains near-black-purple ink and its exact source-ink mapping; native-grid and final-display integrity checks remain unchanged. Aspect ratio, sizing and control layout are unchanged.

Top-shooter cases cover ordinary-height staging, absent top bodies/emissions, active lower counterparts, nested forks, every merge level, rewind and stable source ownership. Rendered projectile samples match the actual lower muzzles, and the control-driven three-fork capture shows three living lower shooters and one switch-only top copy. Already-airborne flight survives conversion, top-only status or branch removal until the next birth/expiry boundary. Converted/removed sources never replay; a temporarily hidden living source can emit again only after becoming lower and crossing a genuine firing event.

These changes are local source/build work. The public deployment and existing ZIP remain unchanged.

## Previous source defaults and merge landing shake: `641ee16`

The complete `forking-hell-tuning-v2 (5).json` preset supplies fresh-load and Reset defaults, superseding the earlier `(3)` file. Source JSON, strict parsing, fresh browser initialization, Reset after restart-required edits, and an actual downloaded export all match every supplied value. Scanlines remain disabled with depth 0.16 and spacing 4.75 retained; HUD/splash strength remains 1.

**80 unit tests, strict TypeScript/build and 104 browser checks passed**, with 12 intended skips in the complete 116-case browser run. The actual tap/full jump apexes retain the 2:1 envelope at 28/56 world pixels. Landing feedback cases cover empty and multiple-target merges, held chains, release, pause and restart. The renderer checks the bounded two-world-pixel pulse, reduced-effects suppression and zero shake-induced motion fringes/environmental time. The pulse starts at merge completion, not acceptance or individual target conversion.

Default-dependent fixtures now use configured durations/speeds or explicitly pin their scripted reproduction settings. The faster collapse exposed a keyboard-release test's stale remote snapshot; it now observes the accepted collapse at the actual keyup event, matching the native cancellation test. No input mechanics were changed. The final review ran in an isolated browser, without manually resetting the user's tuning tab.

Its stronger CRT settings differ from those used for the historical performance comparison below; those timings are not measurements of this new preset. This is a local source/build update, not a new ZIP or public deployment.

## Projectile and CRT follow-up: source commit `32a9980`

That source and production build introduced the projectile/CRT fixes below. **They were not a new ZIP or public deployment.** The previous published release and package evidence are retained separately below.

- **77 unit tests, strict TypeScript and the production build passed.**
- **100 browser checks passed, 12 intentionally skipped**, in the final complete 112-case run after shader optimization: Chromium, Firefox, WebKit and DPR3 Chromium touch. The skips are CDP-only touch/GPU-budget cases outside their supported projects. Exact native-grid, palette and final-sample checks retain their integrity thresholds.
- Nine projectile regressions cover fractional eased muzzle origins, frozen/reverse traversal, live re-emission, permanent conversion, source/branch ownership, cleanup and collision suppression. Unknown historical firing events are no longer synthesized from current geometry.
- At conversion, inactive shots retire immediately. **Already-airborne shots may finish only their existing flight, retiring permanently at the next birth or expiry boundary.** They cannot replay afterward; live copies on other branches remain independent. Rendering and swept collisions both honor retirement.
- A real keyboard-controlled nested-fork/reversal/conversion capture observed ten births: maximum first-observation muzzle discrepancy was 0.263 world pixels, with zero airborne-origin changes. The silent H.264 recording is 15.47 seconds at 1280x800 and 30 fps.
- Every CRT amount produces distinct low/default/high shader output in gameplay and intro. Checks cover disabled-parent value retention, reduced/mobile/HUD overrides, exact disabled restoration, default luminance and scoped GPU-warning recovery. Defaults and complete v2 compatibility are unchanged.
- A timing-sensitive native cancellation test was corrected to inspect the accepted collapse at the actual pointer-cancel event, rather than an earlier remote snapshot. No production input behavior was changed for that correction.

### Matched default CRT performance

The isolated harness used the same headless Chromium, macOS hardware, 1440x810 output, fixed three-lane scene and 0.65 zoom. Each sample measured 240 frame intervals after 60 warm-up frames; both final runs completed 300 actual renders with no browser runtime errors. User tabs were not changed.

| Shader | Mean interval | 95th percentile | Approximate rate |
| --- | --- | --- | --- |
| Prior release `1a5321a` | 24.443 ms | 33.4 ms | 40.9 fps |
| Final optimized source | 24.652 ms | 33.4 ms | 40.6 fps |

The 0.85% mean difference does not show a material default-path regression in this bounded comparison. It also does **not** establish universal 60-fps performance. Higher-cost extremes and real phone hardware remain limitations.

The initial manual bilinear implementation did regress the matched default path: prior-release means were 24.24/24.86 ms versus 29.65/29.30 ms. It was replaced by ray interpolation and four cached narrow/wide shader variants, preserving fractional optical control without resampling world pixels. An intermediate 16.666-ms result was rejected because a missing shader-template marker prevented completed rendering; the corrected harness checks render counts and runtime errors. Only `crt-matched-verified.json` represents the selected shader's final comparison.

Session evidence includes `crt-final-comparison.png` (final off/shipped/strong desktop/touch gameplay and intro), `crt-strong-v2.json`, `projectile-replay.mp4`, the matched result and its isolated harness. The earlier 96 per-control captures and their performance values predate the final sampling optimization; they are not final-shader performance evidence.

The updated simulation benchmark records mean/p95 step times of 0.00544/0.01417 ms at depth 8, 0.01124/0.02300 ms at depth 64 and 0.02621/0.03883 ms at depth 256. Actual forward traversal across 200 chunks retains 2,071 shot-history records while the chunk cache remains 24. Nearby queries and coin integration stay bounded, but retained history is intentionally not constant-memory.

## Previous published release: `1a5321a`

### Executed checks

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

### Measurements, not device guarantees

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

### Remaining external evidence

Actual iOS/Android hardware testing is not available from this environment. Emulation and desktop WebKit are not substitutes for real mobile Safari, thermal, battery, touch-latency or GPU evidence.

The real itch.io iframe cannot be validated until the author signs in, completes security verification and uploads the ZIP. Jam eligibility and submission remain separate user decisions. GitHub Pages availability should always be checked against the live deployment, not inferred from a successful local build.

The large-bundle warning is expected: Phaser accounts for most of the approximately 1.46 MB raw / 396 KB gzip JavaScript. No claim of constant memory, universal 60 fps or guaranteed Game Off eligibility is made.
