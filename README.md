# Forking Hell

**Fork the path. Stage your escape. Merge the chaos.**

A browser-native, endless pixel platformer on a playable git network graph. You control the Octocat: move right to advance the environment, stop to freeze it, and move left to reverse it. Jumping keeps moving forward.

[Play on GitHub Pages](https://cameronfoxly.github.io/forking-hell/) · [Architecture](docs/ARCHITECTURE.md) · [Validation](docs/VALIDATION.md) · [Build and itch.io upload](docs/DEPLOYMENT.md) · [Credits and asset terms](ASSET-LICENSE.md)

## Play

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move / control time | A / D or left / right arrows | Hold left / right |
| Jump | Space | Jump |
| Fork above | W / up arrow | Fork |
| Merge one level down | S / down arrow | Merge |
| Pause / settings | Escape | Pause |
| Stage a target | Touch its gold commit ring | Same |

Forks start **one game unit behind you** and replace that next unit with a walkable diagonal. The newest branch exposes switches for its obstacles. **Shooters remain active on every branch** and aim across lanes. Stage a switch, merge down, and its corresponding obstacle becomes coins. Nested stages propagate one merge at a time. Unstaged obstacles stay dangerous.

Each branch copy can reward once. Coins, destruction, stages and merges are permanent; reversing time does not undo them. Score is **5 per furthest new game unit**, **100 per converted obstacle copy**, and **25 per coin**. Repeated backtracking does not farm distance. Three hits end the run; only actual damage grants brief protection, not branching.

Landscape is best for touch play, including simultaneous movement, jump and fork. Portrait works when the display has room for the 480x270 physical-pixel minimum; smaller windows show a resize/rotate explanation instead of cropping gameplay. No orientation lock is required. Focus loss pauses both clocks and clears controls; resume explicitly.

The pause menu offers independent sound effects and ambient audio plus reduced shake/flashes. Audio starts only after interaction. Best scores and settings stay in local browser storage; blocked storage does not prevent play. There are no accounts, network gameplay services or global leaderboards.

## Develop

Use Node.js 24 and npm:

```sh
npm ci
npm run dev
```

Open the URL Vite prints. The build is pinned to Phaser **4.2.1**, TypeScript **5.9.3**, and Vite **7.2.2**. It uses Phaser 4 camera **Filters**, not Phaser 3 pipelines.

```sh
npm test                              # Pure simulation, character and camera tests
npm run build                         # Strict TypeScript + static build
npx playwright install chromium firefox webkit
npm run test:browser                   # Desktop engines + Chromium multi-touch
node scripts/benchmark.mjs             # 8 / 64 / 256-depth simulation measurements
npm run package                       # Reproducible releases/forking-hell-html5.zip
```

The committed PNG/JSON atlases are sufficient for normal builds. `scripts/hazard-art.py` can regenerate the original hazard atlas with Python/Pillow. `scripts/recolor.py` accepts the author's original image and labeled atlas as optional inputs; those private originals are not required or included.

## Visual contract

One world pixel equals one source-art texel; one game unit is 24 pixels. The supplied character retains its untrimmed 26x27 frames, named pose mapping and timing. Enemies use native-grid art at the same scale. Graph geometry, rasterized rotations, particles and sprites enter one 480x270 composition and an actual palette/pixel-center camera shader. Integer physical-pixel presentation accounts for device pixel ratio.

The camera starts slightly pulled out, uses a central deadzone with damped directional look-ahead, and zooms out with branch depth. Its zoom has a readability floor, **not a gameplay depth limit**. Source-grid origins and screen shake are quantized; physics remain continuous.

## License and provenance

Code and original generated game art/audio are [MIT](LICENSE). The user-authored Octocat artwork is included with permission under [separate reserved rights](ASSET-LICENSE.md); GitHub's character and trademark rights remain distinct. This is an independent project, not an official GitHub game.

The concept and character art predate this implementation. Browser code, original hazard art and synthesized audio were developed with GitHub Copilot assistance. See the [truthful prototype/AI disclosure](docs/DEPLOYMENT.md#prototype-and-ai-disclosure). A public build is **not** an itch.io or Game Off submission, and eligibility is not guaranteed.
