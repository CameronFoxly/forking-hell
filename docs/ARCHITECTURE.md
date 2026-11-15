# Simulation and rendering

## Two clocks

`src/simulation.ts` is engine-independent. A positive fixed 1/60-second step advances player gravity, damage cooldowns, transitions and coin-drop ages. Player movement is 90 source pixels/second, gravity 850, and the nominal jump height 38.

Environmental time changes by **actual controlled horizontal displacement / 90**. An obstructed player does not advance it. Patrol positions, spinner angles, trap phases and projectile trajectories are analytical functions of that signed clock. There is no negative physics timestep. Falling can collide with a stationary hazard.

Pause, focus loss and insufficient display space suspend simulation. Inputs are cleared; focus restoration does not automatically resume. Rendering the world does not mutate its temporal state.

The player-specific animation is forward-only, following the supplied animation contract. The 130x135 sheet contains untrimmed 26x27 cells selected by labeled frame names, not inferred alpha bounds or exported tag ranges:

| Clip | Frames | Timing |
| --- | --- | --- |
| Idle | 5, first row | 200 ms |
| Walk | 5, second row | 60 ms |
| Jump_Up | 4, third row | One launch draw, then 60 ms; loop last two |
| JumpDown | 4, fourth row | Restart at apex; 60 ms, loop last two |
| Land | First cell, fifth row | At least one draw, then 1/15 second |

The last nonzero movement input controls facing; left movement mirrors rather than reversing pose order. The renderer advances animation once per draw and guards the first launch/landing frames even if several physics steps occur.

## Branches, terrain and irreversible transactions

Branches have stable instance IDs and sparse staged/converted sets. Encounter IDs identify lineage; reward keys combine the owner branch ID and encounter ID. Converted ancestry is cached by earliest active depth. Branching has no cost or arbitrary depth cap.

The stack is iterative, not recursive object cloning. Only the newest branch shows switches; ranged sources exist at every unconverted level. Merging removes exactly one top branch, converts staged targets in its parent and carries staged relationships down. Repeated stages/merges cannot repeat a reward event.

One unit is 24 world pixels; branch lanes are 58 pixels apart. The fork is placed exactly 24 pixels behind the player. `surfaceAt` evaluates the diagonal between the commit and its right-hand endpoint, then the child lane. Walking follows that support in both directions; airborne motion uses world height and lands on the same surface. Crossing left of a fork follows the parent path without deleting the branch. Merging removes the child ramp immediately; no engine colliders accumulate.

Branch/lower transitions last 0.34 seconds and preserve airborne height/velocity. They are forward-only visual/physical lifts, not teleports or damage shields. Swept contact checks use the player's **actual world-space body** across relevant branch copies, including during transitions. Gates clamp genuine horizontal entry when the body overlaps their world height. A blocked lift may continue vertically while horizontal time remains frozen. Contact/projectile damage grants 1.35 seconds of post-hit protection; branch operations themselves grant none.

Only the topmost reached lane can stage; collection and staging wait until the lift/collapse finishes. Coins on a collapsed branch transfer to its parent and retain their IDs and drop ages. Original source destruction preserves already-recorded projectiles; collapsing a branch removes that branch's shots.

## Reversible shots and bounded work

Shots are identified by **shooter branch instance / encounter / firing-event index**. The first relevant exposure records muzzle position and a player-aimed world-space velocity. That vector is retained, not re-aimed on reversal. Aiming is recorded lazily when a shooter enters finite relevance; this is not a complete historical replay of unseen player motion.

A shot travels at 86 pixels/second for 2.8 environmental seconds. Reversing across its birth returns it to the muzzle; reversing across expiry restores flight. Repeated boundary crossings never duplicate an event. Relative swept segment/AABB collision works in both temporal directions and between different branch lanes.

Trajectory bounding boxes are indexed in 128x128 world cells. Collision and drawing query nearby buckets, not every historical shot. Shooter relevance uses finite attack range, including sources outside the viewport. Per-step shared height arrays avoid repeatedly walking every ancestor for each shot or contact query.

## Endless state and limits

Seeded 480-pixel chunks produce deterministic encounters on re-entry. Spacing/type/period difficulty increases with forward chunk progress, not frame count or repeated traversal. Distance rewards use the maximum reached X. Chunk definitions have a 24-entry cache and can be regenerated.

Visible enemies are pooled. Rendering visits the camera's nearby branch lanes and spatially relevant coins/shots, with a fixed logical viewport. Coin drops age analytically; inactive distant coins do not need per-frame updates.

Exploration retains shot launch history, uncollected coins and permanent reward/branch state. This grows with explored content and branch copies. Infinite play on finite hardware is **not constant-memory**; 8/64/256-depth tests are stress cases, not caps. The benchmark reports retained growth separately from local query counts.

## Pixel composition and camera

Every world sprite uses one native texel per world pixel and the same camera transform. Enemies are authored on the character's native grid; spinner orientations are pre-rasterized, not smoothly rotated over pixel sprites. Graph strokes use integer source coordinates and whole-pixel thickness. No high-resolution bloom is layered over the artwork.

`src/pixel.ts` installs an actual Phaser 4 camera Filter over the shared low-resolution composition. It samples pixel centers and quantizes to the ten-color palette. `pixelArt: true` and CSS are supplemental, not substitutes. Final CSS dimensions and origins yield nearest-neighbor **integer physical-pixel** presentation at each device pixel ratio. A too-small viewport pauses and explains the limitation.

`src/camera.ts` starts at 0.88 world scale, damps the deadzone and directional look-ahead, and reduces zoom with branch depth to a 0.48 readability floor. The player is free to move within the deadzone rather than staying pinned to one screen coordinate. Branch visibility stays local once the zoom floor is reached. Camera origins/shake are integer composition pixels; physics retain subpixel coordinates.

`window.forkingHell.snapshot()` and `.diagnostics()` provide read-only test observations: actual animation state, world scales, camera origin, shader-pass count and retained/visible counts. They do not expose game mutation or persistence APIs.
