# Phone and tablet play

PushPlay lists where each game plays: **Handheld & controller** (every game), **Desktop** (keyboard
and mouse), **Tablet** (landscape, touch; "Needs a controller" when touch gameplay is missing),
**Phone** and **Party (TV + phones)**. Those "Plays on" labels are earned, not claimed: each one
is read from `pushplay.json` and backed by a pass of `npm run check`. This guide is about the
two that take design work, **Phone** and **Tablet**. The `mobile-port` skill is the step-by-step
version for an existing game; `touch-controls` covers the on-screen controls.

A game earns **Phone** when its manifest has `"phone": { "orientation": … }` and `"touch"` in
`inputs`, and it passes the phone pass. It earns **Tablet** when it plays in landscape with
touch. A game that stays in the 1280×800 space earns Handheld & controller (and Desktop and
Tablet with the right `inputs`); it only earns Phone once it is laid out for a phone.

## The spaces

Every game draws in a fixed logical space and `fit.js` scales it to the window. **1280×800 stays
the default**: it's the Steam Deck's screen and the launcher's window, and nothing about phones
changes it for a game that isn't built for phones. A phone game picks one of two more spaces:

| Space | `fitCanvas` | For | Shown on |
|---|---|---|---|
| **1280×800** (default) | `{ w: 1280, h: 800 }` | Deck, Legion Go, PC windows, tablets in landscape | 7–8" handheld, a TV, a laptop, a tablet |
| **Portrait 720×1280** | `{ w: 720, h: 1280 }` | one-handed phone games: tappers, stackers, endless runners, puzzles, cards | a phone held upright, a tablet upright |
| **Landscape 1280×720** | `{ w: 1280, h: 720 }` | two-thumb phone games: platformers, shooters, racers, anything with a stick | a phone or tablet held sideways, and (with bars) the Deck and PC |

`npm run new-game <id> --phone portrait` or `--phone landscape` scaffolds a starter already laid
out in that space, with `fitCanvas`, `input.attach(canvas, w, h)` and the manifest's `phone`
field agreeing. `"orientation": "any"` means the game handles both phone spaces: it lays out
twice and swaps when the window turns (`fit.onResize`, reading the space `fit.js` picked). That's
more work and rarely worth it; pick one unless the design really plays both ways.

Which one?

- **Portrait** when the game is played with one thumb, the action is vertical (falling,
  climbing, stacking, a lane runner) or it's turn-based (cards, puzzles, words). Portrait games
  are the ones people play standing in a queue.
- **Landscape** when the game needs a stick and buttons, a wide view (a side-scroller, a racer,
  a twin-stick arena), or it should also feel at home on the Deck and a tablet with a controller.
  A landscape phone game letterboxes on the Deck (bars top and bottom, 1280×720 in 1280×800) and
  fills a 16:9 window exactly.
- A game that already exists in 1280×800 is usually closest to **landscape**: same width, 80 px
  less height. Most of the work is moving the HUD out of the thumbs' way and raising text sizes.

Phones are not all the same shape (19.5:9, 20:9, 16:9 tablets). Without `fill`, `fitCanvas`
letterboxes in the colour you give it: on a 20:9 phone a 720×1280 game loses about a sixth of the
height to bars.

**Fill the screen (recommended for new phone games, kit v11):** `fitCanvas(canvas, { w: 720, h: 1280,
fill: true })` makes 720×1280 the *smallest* space. The canvas covers the whole screen, never
stretched, and `fit.w` / `fit.h` grow to its shape: 720×1604 on a 412×918 phone, 720×1560 on a
360×780 one, 983×1280 on a 768×1024 tablet. Then:

- Read `fit.w` and `fit.h` every frame (or in `fit.onResize`); never cache them. Anchor the HUD and
  buttons to the edges and `fit.safe`, centre titles on `fit.w / 2`, and place menus from the
  current size (rebuild them in `fit.onResize`, or move them each frame).
- Keep what decides difficulty inside `fit.minW` × `fit.minH`: a taller phone may see further
  ahead, a tablet more to the sides, but never get wider gaps or slower hazards. Fill the extra room
  with background (stars, sky, floor), never with things that change the game.
- `input` and `touch.js` follow the live size on their own.

## Safe areas

Phones draw into the notch or camera cut-out and under the home indicator. `fit.js` reports how
much of each edge the system covers, in game units, as `fit.safe` → `{ top, right, bottom, left }`.
The values change when the phone turns (the notch moves to a side in landscape) and are zero on a
Deck or PC. Read them every frame or in `fit.onResize`, never once at load.

Rules:
- Nothing the player **reads or taps** goes inside a safe inset: score, timer, prompts, pause
  button, menu items. Backgrounds and the world may extend under them.
- On top of the insets keep the usual margin: important HUD ≥ 32 px from the edge of the
  *safe* area, so `x = fit.safe.left + 32`, not `x = 32`.
- The pause button sits in the top corner, inside the safe area, ≥ 56 px (64 px is better on a
  phone). On a phone in landscape the top corners are reached with the index fingers, which is
  fine for pause; it's wrong for anything pressed during play.
- Typical sizes, in game units: a portrait notch takes about 90 px at the top and the home
  indicator about 60 px at the bottom; in landscape the cut-out takes about 70 px on one side.
  Don't hard-code these; read `fit.safe`.

## Thumb zones

A phone is held, not propped up, so the thumbs cover part of the screen and can't reach all of
it. Lay the screen out in three bands.

Portrait, 720×1280, one hand or two:

```
┌───────────────────────────┐  ← fit.safe.top (notch)
│  HUD: score, timer, lives │  read-only, ≥ 32 px text
│  (nobody taps up here)    │
├───────────────────────────┤
│                           │
│        the game           │  the action; nothing to press
│                           │
│                           │
├───────────────────────────┤
│ ░░░░░░░░░░░░░░░░░░░░░░░░░ │  easy reach: taps, swipes,
│ ░░ left   ░░░░   right ░░ │  on-screen controls, menu's
│ ░░ thumb  ░░░░   thumb ░░ │  main items
│ ░░░░░░░░░░░░░░░░░░░░░░░░░ │
└───────────────────────────┘  ← fit.safe.bottom (home bar)
```

Landscape, 1280×720, both hands:

```
┌──────┬─────────────────────────────────────┬──────┐
│ safe │  HUD top-centre        pause ▢ (≥56)│ safe │  ← notch is on one side
│      ├─────────────────────────────────────┤      │
│ ░░░░ │                                     │ ░░░░ │
│ ░░L░ │            the game                 │ ░R░░ │  thumbs cover ~320 px on
│ ░░░░ │                                     │ ░░░░ │  each side, lower two-thirds
│ stick│                                     │ a b  │
└──────┴─────────────────────────────────────┴──────┘
```

- **Easy reach** (shaded): the bottom third in portrait, the lower two-thirds of each side in
  landscape, about 320 px wide. Put everything the player presses during play here: the virtual
  stick on the left, buttons on the right (`touch.js`, see [touch-controls](../../.claude/skills/touch-controls/SKILL.md)).
- **The game** sits where thumbs don't cover it. The hero and the next threat must be visible
  with two thumbs on the screen; anything that spawns under a thumb is unfair.
- **HUD** goes at the top, read-only, inside the safe area. The pause button is the only tap
  target up there.
- Menus: in portrait, stack items vertically in the lower two-thirds (the first item at about
  y = 560, not at the top); in landscape, `menu.js` centres them, which is fine. Every item
  is ≥ 56 px tall with ≥ 12 px between items so a thumb can't hit two.

## Text and tap sizes

Phones are small and held further from the eye than a handheld on the lap, and the phone pass
measures this.

| | 1280×800 (Deck) | Phone spaces (720×1280, 1280×720) |
|---|---|---|
| Body and HUD text | ≥ 24 px | ≥ **32 px** (the check fails below it) |
| Headings | ≥ 32 px | ≥ 44 px |
| Tap target | ≥ 56 px (pause button) | ≥ 56 px; on-screen buttons ≥ **64 px**, 24 px apart |
| HUD margin | 32 px from the edge | 32 px from the edge of the **safe** area |

All sizes still multiply by `settings.data.textScale`; test the largest setting for overlaps.
Text at 32 px in a 720-wide space is about 17 CSS px on a 390-wide phone, which is the floor;
40 px reads comfortably.

## What phones can't do

- **No hover, no cursor, no right-click.** Anything shown on hover must be shown always or on
  tap. `b` (back) has no touch equivalent: every menu a player can leave needs a visible
  **Back** item (the kit's settings screen has one; add `{ id: 'back', label: 'Back' }` to your
  own menus), and during play `touch.js` can give `b` a button.
- **No keyboard.** Text entry is out (as in every game); key hints must come from
  `input.label()`, which says "Tap" on touch.
- **Precision is poor.** A finger is ~ 40 px wide in game units and hides what's under it. No
  tiny targets, no pixel-precise drags; snap drags to a grid or to targets, and offset dragged
  objects above the finger so the player can see them.
- **The screen locks and the app backgrounds.** A phone call, a notification tap or the lock
  button hides the page at any moment: `visibilitychange` fires and `input.onPause` runs. The
  handler must land on `paused` and save (it does in a kit starter). Audio stops; `audio.js`
  resumes on the next input. Never auto-resume.
- **Timers lie after a background.** `requestAnimationFrame` stops while hidden, so the first
  `dt` after coming back can be seconds; the clamp `Math.min(1/20, …)` is what saves you.
- **Notches and home bars** cover the edges (see *Safe areas*). Browsers may also keep a
  system gesture on the very bottom edge, so a swipe starting there may not reach the game.
- **Performance** varies more than on the Deck: a mid-range phone at DPR 3 pushes many pixels.
  `fitCanvas` caps at `maxDpr` (keep 2); cap particles; no `shadowBlur` in the loop.
- **Orientation** can change mid-game. A game with `"orientation": "portrait"` or
  `"landscape"` is shown rotated as needed by the PushPlay app and letterboxed in a browser;
  don't write your own orientation-lock code.

## Controllers on tablets (and phones)

A tablet with a Bluetooth controller is a Deck with a bigger screen: `input.js` reads the
Gamepad API the same way, `input.mode` becomes `'gamepad'` on the first press, prompts switch to
button names, and the on-screen controls hide themselves (`touch.js` draws nothing unless
`input.mode === 'touch'`). Nothing to do in the game, except:

- Don't tie gameplay to touch alone. A landscape phone game should play with a pad and a
  keyboard too (that's what Handheld & controller and Desktop mean); keep `gamepad` and
  `keyboard` working.
- **Several pads on one tablet** is a valid couch: `input.pads[i]` gives one per controller,
  so a local-multiplayer game works unchanged. The join screen must not assume player 1 has a
  keyboard; touch can't join as an extra player (same rule as on the Deck).
- When a pad is connected, the thumb zones stop mattering and the safe areas still do.

## Online games on phones

The relay connection is a WebSocket, and phones suspend it the moment the app is hidden.
`net.js` reconnects to the same room and seat and resumes in place; while it does, `net.status`
is `'reconnecting'` and `net.connection` is `'connected' | 'reconnecting' | 'offline'`. The game must:

- Show **"Reconnecting…"** on the pause screen (and over play) while `net.status === 'reconnecting'`,
  and "Connection lost" with a way back to the lobby when `net.connection` turns `'offline'`.
- Pause the player's own controls on `visibilitychange` as every game does; the host keeps
  running, so the player comes back to the present, not to where they left.
- Keep the host's copy on a device that stays awake if possible: a host phone that locks stalls
  the match for everyone. Say so in the lobby ("Keep this screen on while hosting").

## Party games on a tablet

A tablet can be the TV of a party game: it runs `game.js`, shows the QR code, and phones join
through the relay as usual. The tablet's own touch screen is also the first player's controller
if the game reads the merged `input.*`. Nothing in `party.js` changes. Keep the TV layout at
1280×800 (a tablet is landscape; the lobby's QR code must stay large enough to scan from across
a table).

## The phone check pass

`npm run check` runs two extra passes:

- **Mouse-only**, for every game (it backs the Desktop label): every menu by click, the
  on-screen pause button, gameplay if `inputs` has `"mouse"`.
- **Phone**, for games with `phone` in the manifest: touch only (no keyboard, no gamepad) at
  **390×844** (portrait) or **844×390** (landscape) at **DPR 3**, which is a common phone. It
  taps through the title menu, taps the pause button and expects `state.screen === 'paused'`,
  fires `visibilitychange` during play and expects a pause, and fails on any text drawn under
  **32 game px** in the phone space. `"orientation": "any"` runs both sizes.

Try it yourself in DevTools device mode (iPhone 14 or Pixel 7 presets, touch emulation on):
menus by tap, play with thumbs, lock the "screen" with `document.dispatchEvent(new Event('visibilitychange'))`
while `document.hidden` is stubbed, rotate the device. And on a real phone: `npm run dev -- --host`
and open the address shown on a phone on the same Wi-Fi.
