---
name: local-multiplayer
description: Add or improve couch multiplayer for the game in this repo — 2–4 players on one screen with input.pads[i], a join screen where each controller presses to join, player colours and spawns, a shared camera, co-op or versus rules, catch-up mechanics, rounds and a results screen; on the Deck, a PC or a tablet with several Bluetooth controllers. Use for "add local co-op", "make it 2 player", "versus mode", "my friends want to play together on the Deck", "two controllers on my iPad", or improving a local multiplayer game. For online play use online-netcode; for phones on a TV use the party game docs.
---

# Local multiplayer

Follow AGENTS.md (*Local multiplayer* under *Controls*) and the Fellowship notes in [framework.md](../../../docs/game-design/framework.md). Read the game's `DESIGN.md`.

## 1. Decide the shape
- **Co-op or versus?** Co-op: shared goal, revive, shared lives or score. Versus: rounds, a score to win (first to 3–5), a quick rematch.
- **One shared screen** (no split screen on a 7–8" display): one arena that fits, or a camera that frames everyone (see `camera`).
- **Rounds of 1–3 minutes**, then a results screen that's fun to look at together.
- **Drop in / drop out:** new players join from the title or between rounds; a player who drops (pad disconnected) becomes a gap, not a crash.

## 2. Input rules
- Each player reads **their own pad**: `input.pads[i]` (`{ index, connected, x, y, aimX, aimY, held(), pressed() }`), for i = 0..3. The merged `input.*` view is for menus only.
- Player 1 may also play on the keyboard; say so on the join screen.
- `menu` from any pad pauses for everyone (the shared pause menu is driven by the merged `input`).
- Never rely on chords or on a button the launcher owns (F10, Start+Select, held Esc).
- Mouse and touch can't join as extra players; drop `"mouse"` / `"touch"` from `inputs` if gameplay needs pads, and say "Needs controllers" on the title. Menus still work with all four.
- **A tablet with several Bluetooth controllers** is the same couch: `input.pads[i]` fills one slot per pad and nothing changes in the game. Don't assume player 1 has a keyboard (a tablet has none); if the game also plays solo by touch, the on-screen controls (`touch.js`) belong to player 1 only and hide once a pad is used. Keep the join screen and HUD inside `fit.safe` so a tablet's rounded corners and home bar don't cover a player's slot ([phone.md](../../../docs/game-design/phone.md)).

## 3. Join screen
- State `lobby` isn't used for local play: the join screen is part of `title` or its own sub-step before `playing` (keep `state.screen` names as AGENTS.md lists).
- One slot per player: "`${input.label('a')}` to join" in each empty slot, built every frame; a slot fills when that pad presses `a`, shows the player's colour and name ("P2"), and `b` on that pad leaves.
- Start when at least the minimum have joined (any joined player presses `a` again, or a countdown).
- Colours: 4 distinct, colourblind-safe colours, each paired with a shape or number marker (P1–P4 icons above heads).

## 4. Fairness and fun
- **Catch-up mechanics:** the leader is a bigger target, trailing players respawn faster or get better pickups, rubber-banding in racers; keep it subtle.
- **Spawns:** spread evenly, never on top of an opponent, brief invulnerability after respawn.
- **Moments to shine:** individual stats on the results screen (most hits, longest combo, "clutch save").
- **Readable chaos:** cap effects, keep each player's character distinct, and label who did what in big moments.

## 5. Build and verify
1. Manifest: `players` like `"1-4"`, the `local multiplayer` tag.
2. Per-player state in an array indexed by slot; Restart resets all players but keeps who joined.
3. Test by hand with two controllers, or in a repro script that replaces `navigator.getGamepads` (with `page.addInitScript`) to return two fake pads whose buttons and axes follow a timeline; also test that 1 player alone still works.
4. Unplug a pad mid-game: `input.onPause` fires only when **all** pads are gone; handle a single disconnect yourself (pause or leave the slot empty).
5. `npm run check`, fix every ✗. Bump `version` (minor), update DESIGN.md (Players, Controls, Changelog), commit (`<Name>: local multiplayer`) and push.
