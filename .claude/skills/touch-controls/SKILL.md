---
name: touch-controls
description: Design and build the touch gameplay input of the game in this repo — virtual stick vs tap-to-move vs swipe vs drag, button placement for thumbs, multitouch, dead zones, feedback without haptics (visual and audio), one-handed portrait schemes, hiding the on-screen controls when a controller is connected to the tablet, and how to use the kit's touch.js (createTouchControls). Use for "add touch controls", "the virtual stick feels bad", "my thumb covers the player", "make it one-handed", "buttons are in the wrong place", "the controls show up with my controller", or the input part of mobile-port. Pairs with game-feel (how it feels) and game-ui (where the HUD goes).
---

# Touch controls

Follow AGENTS.md (*Controls*, *Input hints*) and **read [phone.md](../../../docs/game-design/phone.md)** (thumb zones, safe areas, sizes). Read the game's `DESIGN.md` *Controls* table: every touch verb below maps to one of its rows, so a controller or keyboard player plays the same game. Never edit `touch.js` or `input.js`; the scheme lives in `game.js`.

`input.js` already turns the mouse and fingers into `input.pointer` (the first finger: `x, y, down, pressed, released`) and `input.pointers` (every finger, by id) in game units. What it doesn't do is decide how a finger *means* "move left" or "jump": that's this skill. For a stick and buttons the kit has `touch.js`; for tap, swipe and drag schemes you write a few lines in `game.js`.

## 1. Pick the scheme from the verb
Write the game's verbs (move, aim, jump, shoot, place, select, dash) and pick one row each. Fewer distinct gestures is better; one gesture per verb; nothing that needs two gestures at once unless the game is two-thumb by design.

| Verb | Scheme | When | Watch out |
|---|---|---|---|
| Move freely (platformer, twin-stick, racer) | **Virtual stick** (`touch.js`), left thumb zone | the game needs analogue direction or holding a direction | floating origin (appears where the thumb lands) beats a fixed one; dead zone 12–16 % of the radius |
| Move to a place (top-down, strategy, puzzle) | **Tap-to-move** / tap a cell | discrete destinations, slow pace | show the destination marker; pathing must be forgiving (tap near a cell = that cell) |
| Lanes, directions, flips | **Swipe** (≥ 48 px in ≤ 250 ms, from any point) | runners, match games, card swipes | a short tap is still a tap; decide the direction from the dominant axis; one swipe per finger lifetime |
| Aim and shoot | **Right stick** (`touch.js` second stick) or **tap where to shoot** | twin-stick: stick; slower games: tap target | auto-fire while the aim stick is held, so one thumb does both; tap-to-shoot needs generous hitboxes (a finger is ~ 40 px) |
| Pick up, place, drag | **Drag** with the object drawn above the finger | puzzles, builders, card games | snap to grid or nearest slot on release; a tap on the same object is "select" |
| Jump, dash, fire, use | **Buttons** (`touch.js`), right thumb zone | anything a Deck player does with `a b x y` | ≤ 4 buttons; the most used one biggest and lowest; order them like a pad (a bottom, b right, x left, y top) |
| Hold or charge | hold a button | charge shots, sprint | show the charge ring on the button itself; offer a toggle in Settings (accessibility) |
| Screen-wide "tap anywhere" | tap outside the HUD | one-button games (flappers, tappers) | ignore taps on the pause button and inside `fit.safe`; the whole play field is the target |

**One-handed portrait** (standing on a bus): everything in the bottom third, under one thumb. Good schemes: tap anywhere; tap left / right halves; a single horizontal slider for movement with auto-fire; swipes. Don't put a stick *and* buttons in a portrait game unless it's held with two hands by design.

**Two-thumb landscape**: stick left, 1–4 buttons right, both in the lower two-thirds of each side (about 320 px wide); the action framed between them.

## 2. Use `touch.js` for the stick and buttons
```js
import { createTouchControls } from './touch.js'
const touch = createTouchControls(input, {
  stick: true, // left thumb zone → input.x, input.y (floating origin, dead zone built in)
  buttons: ['a', 'b'], // right thumb zone, ≥ 64 px round buttons → input.held / pressed / released
  labels: { a: 'Jump', b: 'Dash' }, // drawn on the buttons; keep to one word
})
// each frame, during play:
input.update(dt)
touch.update() // right after input.update(), before the game reads input
// …game logic reads input.x, input.pressed('a') as always…
touch.draw(ctx) // last, over the HUD; draws nothing unless input.mode === 'touch'
```
- It writes into the same `input` the game already reads, so no gameplay code changes: a Deck player's stick and a thumb produce the same `input.x`. Don't read `input.pointer` for movement as well, or the stick and the drag will fight.
- `buttons` are the pad names from the AGENTS.md table (`a`, `b`, `x`, `y`), up to four. Use the ones the game maps; `menu` is never a touch button (the on-screen pause button is).
- It draws only while `input.mode === 'touch'`, so plugging a controller into a tablet hides it and `input.label()` switches to button names at the same time. Don't add your own "controller connected" check, and don't draw it on the title or pause screens.
- It lays itself out in the thumb zones from the space given to `input.attach` and keeps clear of `fit.safe`; if you move the pause button or the HUD, keep them out of those zones instead of moving the controls.
- A game that uses tap-to-move or swipes doesn't need it; a game that uses only buttons passes `stick: false`.

## 3. Tune it like a controller
Numbers in `TUNING`, same as any input feel ([game-feel](../game-feel/SKILL.md)):
- **Dead zone** 12–16 % of the stick radius, then scale 0..1 from there so small pushes still move. Full deflection at about 60 px from the origin, not the drawn ring's edge, so the thumb doesn't have to travel far.
- **Floating origin**: the stick appears where the thumb lands in the left zone and follows it when it drags past the radius, so a long push doesn't pin the thumb to the edge.
- **Tap vs hold**: a touch under 150 ms and 12 px of travel is a tap; longer is a hold or a drag. Decide on release for taps, on the threshold for drags, so a tap never also starts a drag.
- **Swipe**: direction from the dominant axis, minimum 48 px, maximum 250 ms; fire once per finger. Accept a swipe that starts on a button? No: buttons own their finger.
- **Multitouch**: every gesture tracks its own pointer id from `input.pointers`; a second finger never cancels the first (the stick thumb stays down while the other thumb taps jump). Ignore a third finger.
- **Forgiveness** is bigger on touch: wider hitboxes for taps (a finger is ~ 40 px), jump buffers and coyote time at the high end of their ranges (~ 120 ms), slightly stronger aim assist when `input.mode === 'touch'`.
- The finger hides what it touches: draw dragged objects 60–80 px above the touch point, and never put the thing the player watches under their thumb.

## 4. Feedback without haptics
Phones in PushPlay get no rumble, so every touch needs to be seen and heard:
- Buttons: a pressed state within one frame (scale 0.92, brighter fill), a release pop, and the game's own sound for the action. The stick shows its knob offset and a faint ring at the dead zone.
- Taps on the world: a short ripple or marker where the finger landed, so a missed tap is understood as "missed", not "broken".
- Swipes: a brief streak in the swipe direction.
- Audio through `audio.js` as for any action; a distinct click for UI taps.
- All of it honours `settings.data.reducedShake` (no flashes) and is drawn by `touch.js` or in `game.js`, never with DOM elements.

## 5. Keep every other input right
- The controller, keyboard and mouse forms of every verb stay, and prompts come from `input.label()` / `drawPrompts`, which say "Tap" in touch mode. Build prompt strings every frame.
- `input.mode` switches to `'touch'` on the first finger and back to `'gamepad'` on the first button press, so a tablet player can swap mid-run; the controls hide and show with it.
- A pointer-driven scheme (tap-to-move, drag) needs its stick or snapping form for the Deck (AGENTS.md *Controls*): `navX/navY` to move a highlight, `a` to confirm.
- Local multiplayer: touch can't join as an extra player; the on-screen controls belong to player 1 (the merged `input`), pads to `input.pads[i]`.

## 6. Verify
1. DevTools device mode (iPhone 14 390×844 and rotated, DPR 3, touch on): play two minutes with thumbs only. Can you keep moving while jumping? Does a swipe ever read as a tap? Does anything spawn under a thumb?
2. Plug in (or fake, see [local-multiplayer](../local-multiplayer/SKILL.md) step 5) a gamepad: the controls disappear and prompts change on the first press; nothing in gameplay is touch-only.
3. `npm run check` (the phone pass runs touch-only at phone size if the manifest has `phone`; the touch pass taps the title menu in every game). Fix every ✗.
4. A real phone if possible: `npm run dev -- --host`. Ask the user whether their thumb finds the main button without looking; that's the test.
5. Bump `version` (patch for tuning, minor for a new scheme), update DESIGN.md *Controls* (a *Touch* column or line per verb) and the Changelog, commit (`<Name>: touch controls`) and push.
