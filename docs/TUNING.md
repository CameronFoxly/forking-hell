# Live tuning and portable defaults

Open **Tune**, expand a section, then adjust its labeled number, slider or checkbox. Character/animation, physics, camera, particles/palette/highlights/shake, coin physics, CRT/motion and merge audio apply live. Enemy/projectile and branch geometry/timing settings require **Apply & start new run** to avoid mixing terrain, projectile histories and reward ownership. While one such edit is pending, the whole draft waits together.

If the viewport is too small to start a run, Apply rejects before changing the effective configuration or run. The draft and Apply button remain, with an explanation. Enlarge the viewport and apply again. Safe edits with no pending restart changes still work while paused or undersized.

**Export JSON** saves every effective value to `forking-hell-tuning-v3.json`, not the draft or UI expansion state. **Import JSON** accepts the same complete document and uses the same live/restart rules. **Reset defaults** also follows those rules. Tuning is tab-local: export before reload. Share the exported file to propose source defaults; after review it can replace `src/defaults.json` directly.

The root is `{"format":"forking-hell-tuning","version":3,"values":{...}}`. Every current section and field is required, including `jumpBurst`, `doubleJumpBurst` and `jumpTrail`. Numeric toggles must be exactly 0 or 1. Validation rejects unknown/missing keys, unsupported versions, strings in numeric fields, non-finite or out-of-range numbers, non-integer counts/geometry, minimum zoom above start zoom, and spinner bob larger than its height. Files above 64 KiB are rejected. Parsing completes before application; a failed or superseded import never partially changes the run.

Complete v2 documents retain every supplied value and gain only the three new jump-effect sections. Historical v1 documents migrate explicitly: the old branch shape has `length`, `height`, `transition`, `holdDelay`, optionally both easing powers. Shared timing becomes equal lift/collapse durations; missing easing remains 3/3. Coin and jump effects use defaults, while CRT and motion are disabled. The panel announces either migration. Partial or mixed historical/current shapes are rejected rather than guessed.

## Timing and feedback

`branches.liftDuration` and `branches.collapseDuration` are independent authoritative durations, initially 0.34 and 0.2 seconds (21 and 12 fixed simulation steps). `liftEase` and `collapseEase` are easing powers, initially 3 and 4.7: 1 is linear, 3 is cubic. Geometry, support, colliders and attached objects share those surfaces. Held-merge scheduling follows collapse completion, never lift duration.

`physics.jumpHeight` is the **full-held maximum per launch**, initially 56 world pixels. A minimum tap reaches half that height; intermediate holds fill the range. One fresh release/press in the air resets upward velocity for a second launch, rising or falling. Only physical landing restores that air jump. Both launches preserve the 2:1 envelope as height/gravity change. Holding never repeats a jump, including after landing.

**First-jump poof** (`jumpBurst`) and **Double-jump poof** (`doubleJumpBurst`) separately expose count (0-24), whole-world-pixel size (0-4), lifetime (0.05-1 second), emission spread (0-30 world pixels) and launch speed (0-100 pixels/second). **Jump trail** separately exposes density (0-60 particles/second), size, lifetime, spread (0-20) and downward drift (0-60 pixels/second). Count, density or size zero turns that system off immediately. The defaults are a six-particle first poof, ten-particle second poof, and sparse 18/second one-pixel trail. Emission captures the player's actual world position; particles finish independently of supports, reverse time or removed branches. Pause freezes them, reduced effects suppresses them, and a 128-particle cap drops oldest cosmetic particles at extreme settings. Existing particles retain their emission lifetime/motion settings until expiry.

`coins.popSpeed` and `spread` control seeded launch velocity. `gravity`, `bounce` (restitution), `friction` (horizontal velocity retained at surface impacts), and `shimmer` control forward-clock drops. Explicit pause freezes motion. Coins bounce on the shared moving support and against nearby coins; distant drops sleep without changing rewards.

`branches.holdDelay` defaults to zero: holding Merge starts the next collapse on the first step after the current tween settles. A nonnegative delay adds only an explicit extra pause; it can never allow overlapping tweens. Release/cancel ends further scheduling, not an already accepted action. New branching, pause/focus loss and restart also end the hold/combo.

`audio.mergePitchStep` controls semitones per completed layer, capped at two octaves. `audio.successThreshold` defaults to four completed held merges, producing one success flourish per uninterrupted hold. Sound mute remains authoritative. `effects.highlightStrength` tunes ancestry links/brackets; activated sprite colors remain as a separate state cue. Reduced shake/flashes suppresses shaking and glow pulsing and reduces particle travel.

**Impact shake** shares `effects.shakeAmount`, `shakeDuration` and `shakeFrequency` between hits and completed merge landings. Each completed layer starts one bounded pixel-aligned pulse, including empty merges; target count does not multiply it. Releasing Merge stops future repeats but the accepted collapse still lands. Pause freezes the pulse, restart clears it, and reduced effects suppresses it. Shake affects presentation only, never support geometry, environmental time or motion-fringe velocity.

## CRT ranges and effective state

Existing CRT values remain unchanged when v2 presets migrate. Normal-mode monitor controls span deliberately strong settings:

| Control | Range |
| --- | --- |
| Desktop / mobile optical split | 0-18 / 0-12 CSS pixels at the edge |
| Scanline depth / spacing | 0-0.85 / 2-24 CSS pixels |
| Glow strength / radius | 0-2 / 0.5-16 world pixels projected into monitor space |
| Emissive threshold | 0-1; 1 removes glow |
| Curvature | 0-0.25 |
| Canvas HUD / splash treatment | 0-1 |

Enable the master CRT switch and each desired effect. Disabled subordinate controls retain their values and show `[off]`; amounts never enable their parent implicitly. Scanlines initially remain off, retaining depth 0.16 and spacing 4.75 CSS pixels. The live status names the optical amount used by this viewport and explains why treatment is inactive. Intro treatment uses the HUD/splash amount (100% by default). DOM buttons, menus and Tune remain unfiltered for readability.

Reduced effects cap optical split at 0.25 CSS pixels, glow strength at 0.08, glow radius at 3 CSS pixels, scanline depth at 0.125 (and half the selected depth), and disable curvature. Those overrides are shown in Tune. Normal mode has no former 0.25-strength / 3-CSS-pixel glow clamp. Buffers beyond the GPU dimension/area budget bypass CRT with an owned notice that clears on recovery; high settings still cost GPU time below that budget. No automatic resolution reduction hides that cost.

## Integration

Add tunables to `FIELDS` and the full `src/defaults.json` together; `Tuning` derives its section/key shape from `FIELDS`. Preserve exact validation and update rejection/round-trip cases. The panel enumerates fields rather than maintaining an independent settings list. Safe application uses the complete validated `Tuning` object; restart-required application must reject before assigning state if a new run cannot start.

World rendering is `WorldRenderer.composition` (native texels, internal common palette filter), then `presentation` (filtered native texture plus optional motion fringes), then camera projection, fixed-layout HUD and optional monitor-space CRT. `resize(scale, density)` sets physical UI scale/DPR; `draw` takes simulation, view state and the authored character frame. Native targets may grow for smaller configured zoom.

CRT optics, scanlines, glow and curvature have independent controls under `crt`. `motion` independently controls world-texel channel splitting, exposure and world/CSS caps. Motion receives actual eased poses and stable platform/connector anchors, not camera displacement. Its monotonic `poseTime` preserves fringes across repeated display frames between simulation ticks. Pause, resize, restart, reduced effects and graphics loss reset motion. Reduced effects suppress curvature/motion and attenuate glow/scanlines; monitor controls remain independent. CRT bypasses oversized buffers with a notice rather than downsampling. These are bounded cosmetic effects, not a velocity buffer or rotational-motion reconstruction.

Do not place monitor optics before the native world raster or reintroduce a fixed post-zoom downsample. The in-canvas background remains near-black `#08060f`; the palette filter explicitly aliases original `#14102b` sprite ink to this entry before nearest-color matching. Outer page/letterbox/panel surfaces are pure `#000000`; foreground palette entries and in-canvas overlays are unchanged.
