# Definition of done

What separates a complete game from a toy. Copy the items that apply into the game's `DESIGN.md` under **Definition of done**, tailored to the game, and tick them off before calling it finished. `improve-game` audits against this list too. Missing items here are usually the biggest, cheapest wins.

## Play

- [ ] **Onboarding by doing.** The first 30 seconds teach the core verb through play, using in-world prompts (`Press ${input.label('a')} to jump`) that disappear once used. No walls of text, no separate tutorial screen required.
- [ ] **Clear goal.** The player always knows what they're trying to do. One objective on screen.
- [ ] **An ending or a score to beat.** Either a win state (levels, a boss, a finale) or an endless mode with a score or time that's saved as a personal best.
- [ ] **Difficulty curve.** Early wins in the first minute, then a steady ramp. Something new (enemy type, hazard, mechanic, music layer) appears roughly every 30–60 seconds of play. No sudden spikes.
- [ ] **Fair failure.** Threats are telegraphed and readable at handheld size. When the player loses, it's clear why.
- [ ] **Retry hook.** After game over, play again in **one press**, in under a second. Show the score, the best, "new best!", and near-miss feedback ("2 away from your best").
- [ ] **Progression or variety.** At least one of: levels, unlocks, upgrades between runs, random runs (procedural layouts or seeds), a collection.

## Feel

- [ ] **Every action has feedback**, both visual and audio: movement, hits, pickups, damage, menu moves.
- [ ] **Juice aimed at the fun targets.** Hit-stop, screen shake, particles (capped, e.g. ≤ 300 alive), squash/stretch, easing. The biggest effects go on the biggest moments.
- [ ] **Rumble** on big impacts where `gamepad.vibrationActuator` exists (guard for `null`).

## Audio

- [ ] **SFX for every action**, generated with `audio.tone()` / `audio.noise()` or bundled files via `audio.load()` + `audio.play()`.
- [ ] **Music**: a simple generated loop or a bundled track that fits the mood, on the `music` bus.
- [ ] **Audio unlock**: `audio.js` starts the context on the first input and mutes on pause; nothing in the game assumes sound is running before the first key, click, tap or button press (browsers outside the launcher block it).

## Screens and flow

- [ ] **Title screen** with the name, a menu that starts the game, and the best score. No strip of button prompts along the bottom of this or any other screen, and room under the menu for the launcher's "Quit to library" row. If gameplay needs a controller or keyboard, the title says so.
- [ ] **Pause** on `menu` (Start, Esc, P, and the on-screen pause button for mouse and touch), with exactly **Resume, Restart, Settings, Quit to title** (inside the launcher, `menu.js` adds **Quit to library** last). The game is fully frozen while paused.
- [ ] **Auto-pause** via `input.onPause` (launcher overlay, lost focus, hidden tab, all controllers gone) lands on the pause screen and saves.
- [ ] **No exit of its own**: nothing bound to F10, Start+Select or a held Esc, and no "exit to launcher" item: the pause menu's Quit to library comes from `menu.js` (see *Leaving your game* in AGENTS.md). A pause menu not built with `menu.js` adds it itself, only when `window.pushplay?.quit` exists.
- [ ] **Every menu works with every input**: controller, keyboard, mouse and touch, via `menu.js` (move, choose, back, hover, click, tap; left/right for values). `b` is back, `menu` pauses; they are never swapped.
- [ ] **Game over / results** screen that's satisfying to look at (tally animation, stats), with retry in one press.
- [ ] **Settings** from `settings.js`, reachable from title and pause: master / music / SFX volume, reduced shake / flash, text size, plus difficulty or other game items as `extra`. Saved under `<id>-settings-v1`.
- [ ] **Saves** via `save.js` under `<id>-save-v1`: best score, unlocks and (for longer games) progress. Saved on every change that matters, on pause, and in `input.onPause`; versioned with `migrate` when the shape changes.
- [ ] **Cursor** hidden only during gameplay in mouse mode, visible in every menu.
- [ ] **`state.screen`** is one of `title | playing | paused | settings | gameover` and `window.__game = { state, TUNING }` is exposed.

## Accessibility

- [ ] **Colorblind-safe**: don't rely on hue alone. Pair color with shape, icon or pattern.
- [ ] **No required button mashing** or long holds without an alternative.
- [ ] **Reduced shake / flash** honoured: when `settings.data.reducedShake` is on, no screen shake, white flashes or strobing.
- [ ] **Text ≥ 24px** at 1280×800, high contrast, scaled by `settings.data.textScale`.
- [ ] **Prompts never hard-coded**: every button name comes from `input.label`, `input.stickLabel`, `input.dpadLabel` or `drawPrompts`, and switches when the player changes device.

## Scaling and inputs

- [ ] **`fitCanvas`** handles the window: letterbox in the game's colour, DPR capped at 2, `integer: true` for pixel art. Looks right at 1280×800 (Deck), 1920×1200 / 2560×1600 at DPR 2 (Legion Go), 1920×1080 and small resizable windows.
- [ ] **Manifest** has `tags` and `inputs`; `inputs` lists only what gameplay really supports (menus support all four regardless).
- [ ] **Verification matrix** done by hand: controller, keyboard only, mouse only, touch (DevTools device mode), 1920×1080 at DPR 2 (see AGENTS.md).
- [ ] **Local multiplayer** (if any) joins by press per controller through `input.pads[i]`; several controllers on one tablet work the same.
- [ ] **Phone games** (manifest `phone`, see [phone.md](phone.md)): laid out in the portrait 720×1280 or landscape 1280×720 space, text ≥ 32px, HUD and tap targets placed from `fit.safe` and out of the thumb zones, on-screen controls through `touch.js` hidden when `input.mode !== 'touch'`, a hidden page pauses and saves, and the game still plays with a controller and a keyboard. Online games show "Reconnecting…" from `net.status` and "Connection lost" from `net.connection`.

## Under the hood

- [ ] **`TUNING` object** at the top of `game.js` holds every gameplay number (speeds, timings, spawn rates, ramp). Later changes are then one-line edits.
- [ ] **Delta-time movement**, clamped (`dt = Math.min(1/20, …)`), so it plays the same at 60, 90 or 120 Hz.
- [ ] **Debug overlay** behind `?debug` (see [`debugging.md`](debugging.md)).
- [ ] **Runtime files unedited** (`input.js`, `menu.js`, `fit.js`, `audio.js`, `save.js`, `settings.js`, `prompts.js` keep their header); game keys added with `input.extendKeys`.
- [ ] **Steady 60fps** on the Deck and Legion Go, DPR 2 included: no per-frame allocations in hot loops, capped particles.
- [ ] **Nothing shipped but the game**: no `tools/`, `mockups/`, `*.py`, `__pycache__/` in the folder.
- [ ] `npm run check` passes (gamepad, keyboard-only, mouse-only, touch, Start → `paused`, 1920×1080 at DPR 2, and the phone pass for phone games) and the screenshot shows real gameplay or a real title screen.
