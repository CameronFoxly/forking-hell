# Forking Hell

**Fork the path. Stage your escape. Merge the chaos.**

An endless browser platformer where a git graph becomes your escape route. Guide an Octocat through indigo, purple and cyan pixel-art hazards, split the path above you, and turn staged danger into coins. You control the character, and your movement controls time.

## [Play Forking Hell](https://cameronfoxly.github.io/forking-hell/)

No install or account needed. Choose **Enter the graph** to start.

## How to play

**Move right to advance the environment, stop to freeze it, and move left to reverse it.** Time follows actual movement, so pushing against a wall does not advance it. During play, your jumps, gravity, coin drops and triggered effects keep moving forward. A frozen hazard can still hurt you if you fall into it.

1. **Fork:** Create a higher branch with a walkable ramp behind you; the parent lane continues underneath. Fork again to go deeper; there is no arbitrary gameplay depth cap.
2. **Stage:** Move or jump the Octocat into a gold commit ring. Only the newest, top branch exposes switches, and staged targets highlight their corresponding copies on ancestor branches. Ordinary hazards become switches on the top branch, but shooter copies stay active on every unconverted branch and fire across lanes.
3. **Merge:** Collapse one branch into its parent. Staged counterparts below pop into bouncing coins when the descending platform reaches them, not when Merge is pressed. Nested stages carry down one merge at a time. Tap for one merge, or hold to continue down the stack after each eased collapse. Each obstacle copy can reward once.

**Reversal is not undo.** Stages, merges, destruction and collected rewards stay permanent for the current run. Unstaged hazards remain dangerous, and forking or merging does not make you invulnerable.

Three hits end the run. Score comes from **5 points per new game unit of forward progress**, **100 per converted obstacle copy**, and **25 per coin**. Backtracking does not earn the same distance points again.

### Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move / control time | A / D or left / right arrows | Hold left / right |
| Jump: tap low / hold twice as high | Space | Jump |
| Fork above | W or up arrow | Fork |
| Merge down: tap once / hold to repeat | S or down arrow | Merge |
| Pause / settings | Escape | Pause |

Staging happens through character contact with a ring; there is no separate stage button. Touch supports simultaneous movement and actions, with accidental text selection suppressed on game controls. Landscape gives the graph more room; if the pixel canvas cannot fit, the game pauses and asks you to resize or rotate.

The in-game pixel keycaps show the keyboard arrangement. Menus support Tab/Shift+Tab, Enter/Space and Up/Down navigation; Escape closes Tune or resumes a paused run. Tune keeps native arrow-key editing for numbers, sliders and checkboxes, and lets you return focus to gameplay.

### Settings and saves

The pause menu has separate **Sound effects** and **Ambient audio** toggles, plus **Reduce shake & flashes**. Audio starts after interaction. Losing focus pauses both clocks and clears held controls; resume explicitly when you return.

Pause-menu preferences and your personal best are saved in local browser storage, not on a server. Blocked storage does not prevent play, but those saves will not persist. There is no global leaderboard.

### Tune and share a configuration

Open **Tune** in the top bar and expand a section to adjust sliders, numeric values or toggles. Character animation, physics, camera, effects, coin physics, CRT/motion and merge audio apply live. Changes under **Enemies & projectiles** or **Forks & held merge** require **Apply & start new run**, which replaces the current run. While those changes are pending, the whole draft waits together, including further edits to live settings.

**Lift duration** and **Collapse duration** are independent, with separate easing controls. **Full-held jump height** is the maximum (initially 56 pixels); the shortest tap is half that. Completed merge landings give one brief camera-shake pulse, using the shared **Impact shake** controls; reduced effects disables it. CRT monitor optics and motion-driven channel splitting can be adjusted or disabled independently. See [Tuning](docs/TUNING.md) for the full contract.

Held merges wait for each collapse animation, then any **Extra delay after merge tween** (`branches.holdDelay`). Its default is **0 seconds**, so there is no additional repeat delay.

**Export JSON** downloads `forking-hell-tuning-v2.json`: the complete **effective configuration**, never unapplied edits. Apply any pending new-run changes before exporting values you want to keep. **Import JSON** loads a complete configuration using the same live/new-run rules; **Reset defaults** restores the shipped values through those rules.

The document uses `format: "forking-hell-tuning"`, `version: 2`, and a `values` object containing every tuning section and field. Complete historical v1 presets migrate with an explanation: shared timing becomes equal lift/collapse durations, coin settings use defaults, and CRT/motion start disabled. Import validates the full schema and numeric ranges; partial presets are not accepted. Tuning is tab-local, not saved with your pause preferences, so export before reloading.

To propose new source defaults, apply and play your configuration, export it, and share the JSON with a short description of what feels better. The exported document matches [src/defaults.json](src/defaults.json) and can replace it after review; exporting alone does not change the repository. Click the graph to return keyboard control after tuning.

## Run locally

Use **Node.js 24** and npm:

```sh
git clone https://github.com/CameronFoxly/forking-hell.git
cd forking-hell
npm ci
npm run dev
```

Open the URL Vite prints. The game uses Phaser 4, TypeScript and Vite; exact versions are pinned in [package.json](package.json) and the lockfile. Normal builds use committed atlases and need neither Python nor private source artwork.

| Command | Purpose |
| --- | --- |
| `npm test` | Run unit tests |
| `npm run build` | Check TypeScript and build the static site into `dist/` |
| `npm run preview` | Serve the production build locally after building |
| `npm run test:browser` | Run desktop browser and Chromium multi-touch checks |
| `node scripts/benchmark.mjs` | Measure simulation work at 8, 64 and 256 branch depths |
| `npm run package` | Build `releases/forking-hell-html5.zip` and its SHA-256 file |

Before running browser checks, install their browsers:

```sh
npx playwright install chromium firefox webkit
```

## Contributing

Bug reports and improvements are welcome. Include your browser, device, reproduction steps and expected behavior in a bug report. For code changes, run the relevant tests and build; preserve the two-clock rules and permanent per-copy rewards. World art shares a native-pixel composition before camera zoom, with pixel typography throughout the UI.

Start with the existing guides:

- [Architecture](docs/ARCHITECTURE.md): simulation, branching, character animation, rendering and camera.
- [Deployment and packaging](docs/DEPLOYMENT.md): GitHub Pages, reproducible ZIPs and itch.io upload steps.
- [Validation](docs/VALIDATION.md): recorded checks, measurements and remaining gaps. Physical iOS/Android performance is not yet verified; browser emulation is not a device guarantee.

## Credits, license and provenance

Code and original generated game art/audio are [MIT-licensed](LICENSE). **The Octocat artwork is not.** Its author, [CameronFoxly](https://github.com/CameronFoxly), permitted this project's use and redistribution while reserving artwork rights; no general-purpose asset license is granted. See [asset terms and third-party credits](ASSET-LICENSE.md), including Phaser's MIT notice. GitHub's character and trademark rights remain separate. This is an independent project, not an official or endorsed GitHub game.

The concept and character artwork predate this browser implementation. GitHub Copilot assisted with implementation, tests, documentation, original hazard art and synthesized audio. Reference imagery and private prototype source are not distributed. See the [prototype and AI disclosure](docs/DEPLOYMENT.md#prototype-and-ai-disclosure).

The public build and downloadable package are **not an itch.io upload or Game Off submission**; jam eligibility has not been established.
