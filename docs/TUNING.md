# Live tuning and portable defaults

Open **Tune**, expand a section, then adjust its labeled number, slider or checkbox. Character/animation, physics, camera, particles/palette/highlights/shake, coin physics, CRT/motion and merge audio apply live. Enemy/projectile and branch geometry/timing settings require **Apply & start new run** to avoid mixing terrain, projectile histories and reward ownership. While one such edit is pending, the whole draft waits together.

If the viewport is too small to start a run, Apply rejects before changing the effective configuration or run. The draft and Apply button remain, with an explanation. Enlarge the viewport and apply again. Safe edits with no pending restart changes still work while paused or undersized.

**Export JSON** saves every effective value to `forking-hell-tuning-v2.json`, not the draft or UI expansion state. **Import JSON** accepts the same complete document and uses the same live/restart rules. **Reset defaults** also follows those rules. Tuning is tab-local: export before reload. Share the exported file to propose source defaults; after review it can replace `src/defaults.json` directly.

The root is `{"format":"forking-hell-tuning","version":2,"values":{...}}`. Every current section and field is required, including `coins`, `crt` and `motion`. Numeric toggles must be exactly 0 or 1. Validation rejects unknown/missing keys, unsupported versions, strings in numeric fields, non-finite or out-of-range numbers, non-integer counts/geometry, minimum zoom above start zoom, and spinner bob larger than its height. Files above 64 KiB are rejected. Parsing completes before application; a failed or superseded import never partially changes the run.

Complete historical v1 documents are migrated explicitly: the old branch shape has `length`, `height`, `transition`, `holdDelay`, optionally both `liftEase` and `collapseEase`. The shared `transition` becomes equal lift/collapse durations; omitted easing gets shipped defaults. New coin settings use shipped defaults, while CRT and motion are disabled for legacy imports. The panel announces migration. Partial/mixed historical shapes and unpublished partial v2 documents are rejected rather than guessed.

## Timing and feedback

`branches.liftDuration` and `branches.collapseDuration` are independent authoritative durations. Both initially default to 0.34 seconds (21 fixed simulation steps). `liftEase` and `collapseEase` are easing powers: 1 is linear, 3 is cubic. Geometry, support, colliders and attached objects share those surfaces. Held-merge scheduling follows collapse completion, never lift duration.

`physics.jumpHeight` is the **full-held maximum**, initially 38 world pixels. A minimum tap reaches half that height; intermediate holds fill the range. Changing height or gravity preserves the 2:1 launch contract, with fixed-step apex sampling tolerance. Holding after landing does not jump again.

`coins.popSpeed` and `spread` control seeded launch velocity. `gravity`, `bounce` (restitution), `friction` (horizontal velocity retained at surface impacts), and `shimmer` control forward-clock drops. Explicit pause freezes motion. Coins bounce on the shared moving support and against nearby coins; distant drops sleep without changing rewards.

`branches.holdDelay` defaults to zero: holding Merge starts the next collapse on the first step after the current tween settles. A nonnegative delay adds only an explicit extra pause; it can never allow overlapping tweens. Release/cancel ends further scheduling, not an already accepted action. New branching, pause/focus loss and restart also end the hold/combo.

`audio.mergePitchStep` controls semitones per completed layer, capped at two octaves. `audio.successThreshold` defaults to four completed held merges, producing one success flourish per uninterrupted hold. Sound mute remains authoritative. `effects.highlightStrength` tunes ancestry links/brackets; activated sprite colors remain as a separate state cue. Reduced shake/flashes suppresses shaking and glow pulsing and reduces particle travel.

## Integration

Add tunables to `FIELDS` and the full `src/defaults.json` together; `Tuning` derives its section/key shape from `FIELDS`. Preserve exact validation and update rejection/round-trip cases. The panel enumerates fields rather than maintaining an independent settings list. Safe application uses the complete validated `Tuning` object; restart-required application must reject before assigning state if a new run cannot start.

World rendering is `WorldRenderer.composition` (native texels, internal common palette filter), then `presentation` (filtered native texture plus optional motion fringes), then camera projection, fixed-layout HUD and optional monitor-space CRT. `resize(scale, density)` sets physical UI scale/DPR; `draw` takes simulation, view state and the authored character frame. Native targets may grow for smaller configured zoom.

CRT optics, scanlines, glow and curvature have independent controls under `crt`. `motion` independently controls world-texel channel splitting, exposure and world/CSS caps. Motion receives actual eased poses and stable platform/connector anchors, not camera displacement. Its monotonic `poseTime` preserves fringes across repeated display frames between simulation ticks. Pause, resize, restart, reduced effects and graphics loss reset motion. Reduced effects suppress curvature/motion and attenuate glow/scanlines; monitor controls remain independent. CRT bypasses oversized buffers with a notice rather than downsampling. These are bounded cosmetic effects, not a velocity buffer or rotational-motion reconstruction.

Do not place monitor optics before the native world raster or reintroduce a fixed post-zoom downsample. The shared background is near-black `#08060f`; the palette filter explicitly aliases original `#14102b` sprite ink to this entry before nearest-color matching, leaving foreground palette entries unchanged.
