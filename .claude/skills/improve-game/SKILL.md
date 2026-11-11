---
name: improve-game
description: Change or improve the game in this repo. Covers specific requests ("add a double jump", "make enemies faster", "new palette", "add co-op") and open-ended ones ("make it more fun", "it gets boring", "polish it"). Use whenever the user wants to modify a game that already exists. For crashes and bugs use debug-game.
---

# Improve game

Follow AGENTS.md. Design material lives in `docs/game-design/`.

## 0. Get context, pick a mode
1. Read `DESIGN.md` and the code relevant to the request.
2. **No DESIGN.md?** Reverse-engineer one from the code, using [DESIGN.template.md](../../../docs/game-design/DESIGN.template.md):
   - infer the fun targets, core loop, 8 elements and controls
   - check it against [complete-game.md](../../../docs/game-design/complete-game.md) to fill in Definition of done, ticking what already exists

   Save it. For a direct change, just mention it to the user; for an open-ended request, confirm it with them as part of the debrief.
3. Pick the mode:
   - **Direct change**: the request names something specific.
   - **Make it better**: the request is open-ended.
   - Something is broken → switch to the `debug-game` skill.
   - "Make it work on my phone / tablet", "mobile version", "earn the Phone label" → the `mobile-port` skill; "add touch controls", "the virtual stick feels bad", "my thumb covers the player" → `touch-controls`.

## Direct change
1. **Sanity-check against the design.** If the change would undermine a fun target, break the input or screen rules in AGENTS.md, or blow the Deck / Legion Go performance budget, say so in one line and propose the closest version that works. Otherwise don't ask; just do it.
2. **Implement in the existing style.**
   - Numbers go in `TUNING`. If there isn't a `TUNING` object yet, gather the relevant numbers into one as you go.
   - A **new mechanic must meet the same bar as the rest of the game**: an onboarding prompt (`input.label()` / `drawPrompts`), visual and audio feedback through `audio.js`, a place in the difficulty ramp, and a free button from the AGENTS.md table (never `menu`, F10 or a chord; `b` is fine).
   - Never edit the runtime files; add key aliases with `input.extendKeys`.
3. **Check neighbouring systems:**
   - pause (Resume / Restart / Settings / Quit to title) and restart still reset everything correctly; `input.onPause` still lands on `paused`
   - saves: if the save shape changed, bump the `createSave` version and pass a `migrate`; keys stay prefixed with the game id
   - settings: new shake or flash honours `reducedShake`; new text honours `textScale`
   - local multiplayer via `input.pads[i]`, if the game has it
   - online play, if the game has it: new state goes in `net.state` on the host, and the check's two-copy test still passes ([multiplayer.md](../../../docs/game-design/multiplayer.md)). Bump `version` when the netcode changes: only builds with the same version play together
   - **adding online play** to a game: copy `net.js` and `lobby.js` from `.github/pushplay/templates/online/`, follow that folder's `game.js` for the screen flow (title → lobby → playing; the pause menu is still opened by `menu` and built with `menu.js`, but it only stops your controls and offers Leave game instead of Restart), move what players see into `net.state`, set `"online": true` and add the `online multiplayer` tag
   - a phone game (manifest `phone`): new HUD or targets placed from `fit.safe` and out of the thumb zones, text ≥ 32 px, a new verb gets its touch form (a `touch.js` button or a tap), the phone pass still passes
   - title, HUD and help text that mention the old behavior; prompts still come from `input.label`, not literals
   - cover and hero art, if the look changed
4. `npm run check`, fix every ✗, look at the screenshot, and redo the AGENTS.md **Verification** passes that the change touches (at least the input you changed, plus keyboard-only).
5. **Record it:**
   - bump `version` in `pushplay.json`: patch for tuning or fixes, minor for features or content
   - update DESIGN.md (affected sections plus a Changelog line)
   - commit (`<Name>: <change>`) and push
6. Report what changed and how to try it. Optionally suggest 1–2 related follow-ups, but don't build them unasked.

## Make it better
1. **Look.** Run `npm run check` and view the screenshot. If deeper states matter, use the repro script in [debugging.md](../../../docs/game-design/debugging.md) to capture screenshots at 10s, 60s and so on.
2. **Playtest debrief.** If the user has played it, ask one `AskUserQuestion` round in plain language. Skip anything they already told you.
   - **Why did you stop?** Got bored / too hard / confused / beat it / wanted more.
   - **How long did a session last?** < 2 min / 2–10 min / longer.
   - **Best or worst moment?** Free text via Other; offer guesses as options.

   Map the answers to likely causes:

   | Answer | Look at |
   |---|---|
   | Bored | No ramp or variety; weak core verb (30-second fun test); weak Sensation |
   | Too hard | Difficulty curve, readability, telegraphing, unfair deaths |
   | Confused | Onboarding, goal clarity, feedback |
   | Beat it / wanted more | Progression, meta loop, replay variety, content |
3. **Diagnose.** Audit the game against:
   - its fun targets and the 8 elements ([framework.md](../../../docs/game-design/framework.md)): is each target backed by mechanics?
   - [complete-game.md](../../../docs/game-design/complete-game.md): missing items are usually the biggest, cheapest wins (no retry hook, silent actions, no ramp, no best score)
   - game feel: response time, acceleration, hit-stop, shake, sound
   - the difficulty curve, read from `TUNING` and the spawn and ramp code
   - the **AGENTS.md rules checklist** (older games often predate it; each miss is a fix to propose):
     - menus on `menu.js`, including touch; pause menu = Resume / Restart / Settings / Quit to title; Settings (master/music/SFX, reduced shake, text size via `settings.js`) reachable from title and pause
     - `menu` pauses (Start / Esc / P / on-screen button), `b` is back and otherwise free; no F10, Start+Select or held-Esc binding; no exit of its own (the pause menu's Quit to library comes from `menu.js`)
     - `input.onPause` → `paused`; `window.__game = { state, TUNING }` with `state.screen`
     - `fitCanvas` for scaling (no hand-written resize, DPR capped at 2, letterbox colour set); cursor hidden only during gameplay
     - prompts from `input.label` / `drawPrompts`, no literal "A", "Space", "LB/RB"
     - `save.js` with `<id>-save-v1` keys, saved on pause; `audio.js` with buses that follow the sliders
     - manifest has `tags` and `inputs`; `tools/`, `mockups/`, `*.py` not committed; runtime files unedited (header intact)
     - screen rules (24px text, 32px margins at 1280×800; 32px text and `fit.safe` margins in a phone space) and performance (60fps, DPR 2 included)
     - a game with `"touch"` in `inputs` but no `phone` field: it already earns Tablet; offer `mobile-port` if the user plays on a phone

   For a deeper look, run the `playtest` skill to measure run length, spikes and boring stretches. Hand the fixes to the specialist skills: `game-feel` (feel and juice), `level-design` (content and ramp), `game-audio` (sound), `game-ui` (HUD, menus, onboarding), `boss-design` (bosses and finales), `progression` (unlocks, upgrades, daily challenge), `story-and-dialogue` (story, characters, writing), `accessibility-audit` (colourblind, remapping, assists), `performance-pass` (frame rate, stutter, load time), `enemy-ai` (enemy behaviour), `camera` (following and framing), `physics-feel` (collisions, bounce, vehicles), `local-multiplayer` (couch play), `online-netcode` (online lag and sync), `mobile-port` (phone and tablet play), `touch-controls` (the touch gameplay scheme), `party-phone-screen` (party games' phone side), `localization` (other languages), `cover-art` and `screenshots` (how it looks in the library). Finish with `release-notes` when the user wants notes for the update.

   If it helps, research how the DESIGN.md reference games, or similar games, solved the same problem ([inspiration.md](../../../docs/game-design/inspiration.md)).
4. **Propose.** Offer 3–5 improvements in one `AskUserQuestion` (multiSelect). Each option gives the problem → the fix, its expected effect on feel, and its size (S/M/L).
   - Mix quick wins (tuning, juice, missing feedback) with one bigger idea: a new mechanic, a mode (daily seed, endless, boss rush, co-op) or a meta loop.
   - Put the fix for the **biggest fun problem** first, marked "(Recommended)", even if it isn't the smallest.
5. **Implement** the chosen items one at a time, using the Direct change steps 2–4 for each.
6. **Verify** with the full AGENTS.md **Verification** matrix: controller, keyboard only, mouse only, touch (DevTools device mode), 1920×1080 resize at DPR 2, a phone-sized window for a phone game, and `npm run check` (gamepad, keyboard, mouse-only, touch, Start → `paused`, DPR 2, and the phone pass where it applies, all green).
7. **Record and hand back.**
   - Bump `version`.
   - Update DESIGN.md: tick Definition of done items and add a Changelog entry.
   - Commit and push.
   - Tell the user what changed and **what to watch for in the next playtest**, so the next round of feedback is specific.
