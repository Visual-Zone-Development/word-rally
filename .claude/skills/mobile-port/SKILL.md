---
name: mobile-port
description: Make an existing game in this repo play well on a phone and a tablet so it earns PushPlay's Phone and Tablet labels — audit the layout against the phone spaces, pick portrait or landscape, move the HUD out of the thumb zones and safe areas, raise text to the phone minimum, replace hover and precise pointer actions with big tap targets or stick-driven alternatives, add on-screen controls with touch.js, handle screen lock and "Reconnecting" in online games, set the manifest's phone field, pass the phone check pass. Also the reverse, a phone-first game that should earn Handheld & controller and Desktop. Use for "make it work on my phone", "add touch controls", "mobile version", "it's unplayable on a phone", "earn the Phone label", "tablet version".
---

# Mobile port

Follow AGENTS.md (*Controls*, *Screens and scaling*, *Manifest*) and **read [phone.md](../../../docs/game-design/phone.md) first**: it has the phone spaces, safe areas, thumb zones, text sizes and what phones can't do. Read the game's `DESIGN.md`. The on-screen controls themselves are the `touch-controls` skill's job; call it from step 4. Never edit the runtime files (`fit.js`, `input.js`, `touch.js`, `menu.js`…): everything here lives in `game.js` and the manifest.

**What "earning the label" means.** PushPlay reads where a game plays from `pushplay.json` and only trusts what `npm run check` has verified: **Phone** needs `"phone": { "orientation": … }`, `"touch"` in `inputs` and a green phone pass; **Tablet** needs landscape play with touch (every 1280×800 game with `"touch"` already has it; without touch it shows "Needs a controller"); **Desktop** needs `"keyboard"` and `"mouse"` and the mouse-only pass; **Handheld & controller** every game has. A port keeps every label the game already had: a phone game must still play with a controller and a keyboard.

## 1. Audit on a phone-sized screen
1. `npm run check` for the baseline; then open the game in DevTools device mode (iPhone 14 at 390×844 and rotated, touch emulation on, DPR 3) with `npm run dev`, or take screenshots with the repro script in [debugging.md](../../../docs/game-design/debugging.md) using `viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true`.
2. Walk every screen (title, play, pause, settings, game over, lobby) with touch only and write a short table: screen → what breaks. Look for:
   - text that lands under 32 px in the phone space, or anything under a notch or the home bar
   - HUD or targets the thumbs cover during play; anything the player must press in the top half
   - gameplay that needs hover, right-click, a keyboard, a precise drag, or two things at once that a touch player can't do
   - a start that needs `a` with no tap equivalent; a menu without a visible Back item (touch has no `b`)
   - what happens on `document.dispatchEvent(new Event('visibilitychange'))` with `document.hidden` stubbed true: it must land on `paused` and save
   - an online game: what the screen says while the socket is down
3. Note the thumb-zone map for this game: sketch where the stick, buttons, HUD and pause button will go (phone.md has the two figures).

## 2. Pick the space with the user
One `AskUserQuestion` round, your recommendation first:
- **Landscape 1280×720** (Recommended for most existing games: same width as 1280×800, 80 px less height, feels right on the Deck and a tablet with a pad; two-thumb controls).
- **Portrait 720×1280** when the game is one-thumb or vertical (tapper, stacker, lane runner, cards, puzzle). A relayout, not a resize.
- **Any** only when the design genuinely plays both ways; it means two layouts and a swap on `fit.onResize`.
- Also confirm what to drop or change: a mechanic that can't work with a thumb (hover aim, a scroll wheel, chords) becomes a tap target, a snap, or an auto-action.

Record the choice and the thumb-zone map in `DESIGN.md` (*Devices* row, *Controls*).

## 3. Relayout
Change `game.js` so the space is a pair of constants and every position derives from them:
1. `const W = 1280, H = 720` (or `720, 1280`); `fitCanvas(canvas, { w: W, h: H, maxDpr: 2, letterbox })` and `input.attach(canvas, W, H)` use the same numbers. Nothing else in the game may hard-code 800 (or 1280 in portrait): search for literal numbers and replace them with `W`, `H`, fractions of them, or `TUNING` entries. For `"any"`, lay out from `fit.w` / `fit.h` and re-run the layout in `fit.onResize`.
2. **Safe areas**: every HUD element and tap target is placed from `fit.safe` (`top, right, bottom, left`, game units, read every frame or on resize): `x = fit.safe.left + 32`, pause button at `W - fit.safe.right - 32 - size`. Backgrounds may extend under the insets; text and buttons may not.
3. **Thumb zones**: HUD at the top, read-only; nothing pressable in the top half except the pause button; the game's action framed where thumbs don't cover it (phone.md). In portrait, menus start about y = 560 so the items sit in reach.
4. **Text**: HUD and body ≥ 32 px, headings ≥ 44 px, still × `settings.data.textScale`; panels behind HUD text for contrast over the world. Test the largest text size for overlaps. The debug overlay may stay small.
5. **Tap targets**: pause button and every menu item ≥ 56 px (≥ 64 px for anything pressed during play), 12–24 px apart. A finger hides what's under it: offset dragged objects above the touch point.
6. **Gameplay actions** that touch can't do get a touch form: hover → always shown or tap to inspect; precise drag → snap to grid or nearest target; right-click → a `touch.js` `b` button or a long-press with a visible fill ring (≤ 300 ms, never the only way); keyboard-only verbs → an on-screen button. Each alternative keeps its stick and keyboard form, so the Deck player loses nothing.
7. **Camera**: if the view shrank (landscape 720 tall) or turned (portrait), re-frame so the hero and the next threat fit with two thumbs on screen (`camera` skill); a lane or vertical game shows more ahead than behind.

## 4. On-screen controls
Follow the `touch-controls` skill. In short: `import { createTouchControls } from './touch.js'`, create it once with the stick and the buttons the game really uses (≤ 4), call `touch.update()` right after `input.update()` and `touch.draw(ctx)` last during play; it feeds `input.x / y` and `held / pressed / released`, draws only while `input.mode === 'touch'`, so a controller on a tablet hides it without any code. If the game folder has no `touch.js` yet, copy it from `.github/pushplay/templates/shared/touch.js` (it's a runtime file: never edit it, and `update-kit` keeps it fresh). A tap-to-move or swipe game may not need a stick at all; the skill helps decide.

## 5. Phones background, sockets drop
- `input.onPause` already fires on `visibilitychange`; make sure the handler pauses from every playable screen (not just `playing`: a lobby countdown, a results tally) and calls `save.save()`. Never auto-resume.
- Audio: nothing may assume sound keeps running across a background; `audio.js` resumes on the next input.
- **Online games**: read `net.status` every frame. While `'reconnecting'`, draw "Reconnecting…" over play and on the pause screen and send empty input; when `net.connection` is `'offline'` show "Connection lost" with a Back to lobby item. Tell the host in the lobby to keep the screen on. See the `online-netcode` skill.
- The first `dt` after a background is huge: confirm `dt` is clamped (`Math.min(1/20, …)`) and that timers don't skip (a round timer should pause with the game).

## 6. Manifest, check, record
1. `pushplay.json`: add `"phone": { "orientation": "portrait" | "landscape" | "any" }`, make sure `inputs` has `"touch"` (and keeps `"gamepad"`, `"keyboard"`, and `"mouse"` if mouse play works), bump `version` (minor).
2. `npm run check`: the phone pass runs touch-only at 390×844 / 844×390, DPR 3, taps through the menus and the pause button, fires `visibilitychange` and fails on text under 32 game px; the mouse-only pass runs for every game. Fix every ✗, then **look at the phone pass's screenshot** as well as the usual one: thumbs would cover what? is anything under the notch?
3. Redo the AGENTS.md **Verification** passes the port touched: touch on a phone-sized device-mode window, plus controller and keyboard (nothing may have regressed on the Deck), plus the Scaling pass at 1920×1080 (a landscape phone game fills it; a portrait one gets wide bars in the letterbox colour).
4. On a real phone if you can: `npm run dev -- --host`, open the address on a phone on the same Wi-Fi, play a minute with thumbs, lock the screen and come back.
5. `DESIGN.md`: fill the *Devices* row (which labels the game earns and the space), update *Controls* (touch scheme, on-screen buttons) and the *Scaling and inputs* items, add a Changelog line (`Plays on a phone: landscape layout, on-screen controls`). Commit (`<Name>: phone and tablet`) and push.
6. Tell the user which labels the game now earns, what changed for Deck players (ideally nothing), and 2–3 things to feel for on their phone: "can you see the next enemy with both thumbs down?", "does the jump button sit under your right thumb without looking?".

## The reverse: a phone-first game for the Deck and a PC
A game made with `--phone` already earns Handheld & controller and Desktop if it plays with a pad and a keyboard; usually it doesn't yet:
- Every touch verb needs a button or stick form: tap-to-move → stick with the same speed; swipe → d-pad direction or stick flick; drag → stick-driven cursor or snapping between targets; tap a card → `navX/navY` highlight + `a`. Prompts from `input.label()` so the Deck player sees button names.
- Keep the phone's pause button for mouse and touch; the Deck player uses `menu`.
- `inputs` lists what really works; run the gamepad, keyboard and mouse-only passes and the DPR 2 render, then the Verification matrix with a controller.
- A portrait game on the Deck has wide bars: make the letterbox colour part of the design, or offer a landscape layout as `"orientation": "any"` if it's worth it.

## Checklist (copy into the PR or the report)
- [ ] Space chosen (portrait / landscape / any) and recorded in DESIGN.md; `W`/`H` used everywhere; `fitCanvas` and `input.attach` agree
- [ ] HUD and tap targets placed from `fit.safe`, ≥ 32 px inside it; nothing readable or pressable under a notch or the home bar
- [ ] Nothing pressable in the top half during play except the pause button (≥ 56 px); controls in the thumb zones
- [ ] Text ≥ 32 px (headings ≥ 44 px) × `textScale`; no overlaps at the largest size
- [ ] Every hover, precise drag, right-click or keyboard-only verb has a touch form; every menu has a visible Back item
- [ ] `touch.js` controls where touch-only play needs them; hidden when `input.mode !== 'touch'`; controller and keyboard play unchanged
- [ ] `visibilitychange` pauses from every playable screen and saves; `dt` clamped
- [ ] Online: "Reconnecting…" from `net.status`, "Connection lost" from `net.connection`
- [ ] Manifest: `phone.orientation`, `"touch"` in `inputs`, `version` bumped
- [ ] `npm run check` green including the phone and mouse-only passes; phone screenshot looked at
- [ ] Verified by hand: touch at phone size, controller, keyboard, 1920×1080
- [ ] DESIGN.md *Devices* row, *Controls*, Changelog
