# Static deployment and HTML5 distribution

## GitHub Pages

Canonical repository: https://github.com/CameronFoxly/forking-hell

Canonical preview: https://cameronfoxly.github.io/forking-hell/

The repository uses the existing **GitHub Actions** Pages setup. `.github/workflows/pages.yml` runs unit tests, strict TypeScript/build, packages the HTML5 ZIP, then uploads `dist` to Pages on `main` pushes. The workflow also supports manual dispatch. It does not create a second Pages site.

Node 24 and `npm ci` reproduce the locked dependencies. Vite's `base: './'` makes script, style, font and artwork references relative to `index.html`; no backend or CDN is required. Phaser dominates the roughly 1.46 MB raw JavaScript bundle (about 396 KB compressed).

## Reproducible itch.io ZIP

```sh
npm ci
npm run package
```

Outputs:

- `releases/forking-hell-html5.zip`
- `releases/forking-hell-html5.zip.sha256`

The ZIP puts `index.html` at its root and includes only the build plus licensing/upload documents. Sorted entries, fixed timestamps and fixed compression settings make repeated packaging of the same build byte-identical. Generated character/hazard atlases are committed; private originals and Python are not build dependencies.

Test the actual extracted ZIP, not only Vite's development server:

```sh
mkdir -p releases/zip-check
unzip -o releases/forking-hell-html5.zip -d releases/zip-check
python3 -m http.server 4174 --directory releases/zip-check
# In a second terminal:
PREVIEW_URL=http://127.0.0.1:4174 npm run test:browser
```

GitHub Actions also stores the ZIP as its `forking-hell-html5` downloadable artifact. Build/package files are intentionally ignored by Git; source, generators and the workflow are versioned.

## itch.io upload (requires the user's account)

1. Sign in to itch.io and complete its normal security verification. Do not bypass a login or Cloudflare challenge.
2. Create/edit the **Forking Hell** project as an HTML game. Upload `forking-hell-html5.zip` and select **This file will be played in the browser**.
3. Use a landscape-first embed, initially 960x600 or larger, with fullscreen available and mobile support enabled. Test the embed and its fullscreen denial path; the game never relies on orientation lock.
4. Add the controls, credits, separate artwork terms and disclosure below. Keep draft/private until the author approves publication and any jam participation.
5. Test asset loading, keyboard focus, simultaneous touch, pause/resume and local storage in the actual iframe after upload.

Preparing this ZIP or deploying Pages does not upload to itch.io and does not submit to Game Off.

## Prototype and AI disclosure

Suggested truthful project text:

> Forking Hell develops a pre-existing git-graph platformer concept and uses character sprites authored before this browser implementation. The browser game was rebuilt around Phaser and TypeScript with a custom reversible environmental simulation, recursive branch mechanics, original hazard art and synthesized sound. GitHub Copilot assisted with implementation, tests, documentation and original generated assets. The supplied character artwork retains its separate rights; GitHub character/trademark rights remain with their owners. Reference imagery and private prototype source are not included.

Game Off 2026 uses **SHIFT** and lists a deadline of **December 1, 2026, 13:37 PST**. Its guidance on development timing and pre-existing ideas needs the author's eligibility decision before any submission. AI-use disclosure does not by itself establish eligibility.

Sources: [HTML5 upload guide](https://itch.io/docs/creators/html5), [Game Off](https://itch.io/jam/game-off-2026), [organizer FAQ](https://itch.io/jam/game-off-2026/topic/7290154/frequently-asked-questions-faq).
