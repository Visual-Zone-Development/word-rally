---
id: phone-game
name: Phone game, touch only
summary: A game laid out for a phone (manifest `phone`), played with thumbs on a phone-sized screen, locked and unlocked mid-run.
browser: --device mobile
inputs: touch
optional: true
---

Run this only for games whose `pushplay.json` has a `phone` field. Use a
390×844 viewport for `"orientation": "portrait"`, 844×390 for `"landscape"`,
and both for `"any"`, at DPR 3 with touch emulation and no keyboard or
gamepad. It's the hand-driven version of the check's phone pass; see
`docs/game-design/phone.md` for the thumb zones and safe areas.

## How to play
Go through the title, settings, pause and game-over screens by tap only, then
play for about a minute with the on-screen controls (`touch.js`: the stick in
the lower left, the buttons in the lower right) or the game's tap and swipe
scheme. During play:

1. `eval "Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange'))"`: the phone's screen locks.
2. `eval "Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange'))"`: it unlocks.
3. `pad connect`, then press a button: a controller is paired with the tablet.

## What must be true
- Every menu works by tap, each item is at least 56 px tall, and every menu that can be left has a visible Back item (touch has no `b`).
- No text is drawn under 32 px in the game's space; nothing readable or tappable sits under the notch or home bar area (`fit.safe`), and the pause button is in a top corner, at least 56 px.
- With two thumbs in the lower zones, the player's character, the next threat and the score are all visible; nothing the player must press during play is in the top half except the pause button.
- The screen lock lands on `paused` and the save reflects the run; unlocking does not resume by itself.
- After the controller press, the on-screen controls disappear, prompts name buttons, and gameplay continues with the pad; the next tap brings the controls back.
- An online game shows "Reconnecting…" while `net.status` is `'reconnecting'` and offers a way back to the lobby when `net.connection` is `'offline'`.
