---
name: port-game
description: Bring an existing web game into this repo — the user's own HTML/JS game, a game-jam entry, a tutorial project or an open-source game with a licence that allows it — and convert it to the PushPlay rules: runtime input with controller, keyboard, mouse and touch, menu.js menus, pause, settings, fitCanvas scaling to 1280×800, saves, offline assets, a manifest and art. Use for "add my old game", "port this game", "import this repo / folder / zip", "make this HTML game work on the Deck".
---

# Port a game

Follow AGENTS.md. The aim is the same game, now playing well on a handheld with every input, without rewriting what already works.

## 1. Check you may, and what it is
1. **Licence:** the user's own work, or a licence that allows copying and modifying (MIT, Apache-2.0, BSD, GPL — then the port is GPL too —, CC0, CC-BY with credit). No licence or "all rights reserved" means don't port it; tell the user. Record the source and licence in `assets/CREDITS.md`.
2. **Tech:** plain canvas / DOM / ES modules → a plain game; npm packages, a bundler, Phaser, three.js → `--vite`. Godot, Unity or other engine exports don't need porting: PushPlay can run them from their own repo's releases (see the README).
3. **Inventory:** how it reads input, how it sizes the canvas, its screens, its saves (`localStorage` keys), its assets and any network use (CDNs, fonts, analytics).

## 2. Set up the repo
1. `npm run new-game <id> --name "<Name>"` (with `--vite` if needed) for the runtime files, `pushplay.json`, the starter skeleton and art placeholders, at the repo root (one game per repo; if a game is already here, port into a new repo from the template).
2. Copy the game's code and assets in next to them (`assets/` for media). Download any CDN libraries and remote fonts into the repo (or `npm install` them in a `--vite` game); the check fails on network requests.
3. Write `DESIGN.md` by reverse-engineering the game ([DESIGN.template.md](../../../docs/game-design/DESIGN.template.md)), with *Ported from <source>* in the Changelog.

## 3. Convert, step by step (run the game after each)
1. **Loop and screens:** fold its loop into the starter's frame: `input.update()` first, `state.screen` with `title | playing | paused | settings | gameover`, `window.__game = { state, TUNING }`. Use the starter's title, pause (Resume, Restart, Settings, Quit to title) and settings screens; replace its own menus with `menu.js` (which also gives the pause menu Quit to library inside the launcher; if a menu has to stay custom, add that item as *Leaving your game* in AGENTS.md shows).
2. **Input:** replace `keydown` / `mousedown` / `touchstart` handlers with the `input` API (`input.x`, `input.pressed('a')`, `input.pointer`); map its actions to buttons from the AGENTS.md table; key aliases through `input.extendKeys`. Remove any Esc-as-back, F10 or quit binding. Pointer-only mechanics also need a stick cursor or snapping.
3. **Scaling:** remove its resize code; `fitCanvas(canvas, { w: 1280, h: 800, maxDpr: 2, letterbox })`. If it was built for another resolution, scale its drawing (one `ctx.scale` at the top) or relayout the HUD to the 1280×800 rules (text ≥ 24 px, 32 px margins).
4. **Timing:** movement per second with clamped `dt` if it was per frame.
5. **Saves and audio:** move its `localStorage` use to `save.js` (`<id>-save-v1`, with a one-time import of its old key if the user has existing saves in the same browser) and its sound to `audio.js` buses.
6. **Prompts:** replace literal key names with `input.label()` / `drawPrompts`.
7. **Pause:** `input.onPause` → `paused` and save; everything frozen while paused.

## 4. Finish
1. Manifest (`description`, `players`, `tags`, `inputs`), cover and hero art (`cover-art`).
2. `npm run check`, fix every ✗, open the screenshot and art.
3. Do the AGENTS.md verification matrix.
4. Commit (`Add <Name> (ported)`) and push. Tell the user what changed in the controls and anything that couldn't be kept.
