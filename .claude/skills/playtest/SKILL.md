---
name: playtest
description: Playtest the game in this repo without a human — drive it headlessly with scripted or bot inputs, capture screenshots over time, measure how long runs last, where players die and how the score grows, and turn that into a balance and fun report with concrete TUNING changes. Use for "is it balanced?", "playtest it", "is it too hard", "check the difficulty curve", "does it get boring", or before shipping a new game. It reports and proposes; changes go through improve-game or level-design.
---

# Playtest

Follow AGENTS.md. Read the game's `DESIGN.md` (fun targets, pacing, Definition of done) and its `TUNING`. This skill **measures and reports**; it doesn't change the game unless the user approves the proposals.

## 1. Plan what to measure
Pick 3–6 questions from the design, for example:
- How long does a run last for a weak, an average and a good player?
- When does the first new thing appear, and then every how many seconds?
- Where do runs end (which enemy, hazard or level)?
- Is the first minute nearly impossible to lose?
- Does the score or progress grow at the rate the design expects?

## 2. Build a playtest script (scratch, never in the game folder)
Start from the repro script in [debugging.md](../../../docs/game-design/debugging.md): the build kit's Playwright, `npm run dev`, a virtual gamepad on a timeline. Then add:
- **Bots of 2–3 skill levels.** Read `window.__game.state` each tick and choose inputs: *idle* (presses nothing, finds the floor of difficulty), *random* (mashes and wanders), *greedy* (moves toward pickups and away from the nearest threat, with a reaction delay of 150–300 ms). Keep each bot to a few dozen lines.
- **Seeds:** run each bot on 5–10 seeds (`?seed=n`) if the game is seeded; otherwise run more times.
- **Fast-forward:** if the game exposes it, raise a time-scale in `TUNING` to run faster; otherwise just run in real time with a timeout (e.g. 3 min per run).
- **Logging:** every second record time, `state.screen`, score, health, level or wave, entity counts, and fps (from `requestAnimationFrame` timing). On game over record the cause if the state exposes it.
- **Screenshots** at 5 s, 30 s, 60 s, 2 min, and at each death.
- **Phone games** (manifest `phone`): run the same bots in a phone viewport too (`viewport: { width: 390, height: 844 }` or `844×390`, `deviceScaleFactor: 3, hasTouch: true, isMobile: true`), driving the `touch.js` controls with `page.touchscreen.tap()` and pointer sequences in the thumb zones (or keep the virtual gamepad and only check the picture). Screenshots then show what a thumb-covered screen looks like: overlay two 320 px thumb zones when you read them.

Keep it under the session's limits: a handful of runs per bot is enough to see a trend.

## 3. Read the results
Look at every screenshot (you can read PNGs) and the numbers:

| Signal | Means | Usual fix |
|---|---|---|
| idle bot survives a long time | no pressure, nothing forces the verb | earlier first threat, a timer |
| random bot does about as well as greedy | skill doesn't matter | reward precision: combos, risk/reward pickups |
| all bots die at the same spot | a spike | smooth that step in the curve |
| greedy bot never dies | too easy at the top end | steeper late ramp, a new threat type |
| nothing new on screen between two screenshots 60 s apart | boring stretch | add content there (level-design) |
| fps below 55 anywhere | performance | cap entities or particles (debug-game) |
| screenshots hard to read | readability | game-ui |
| phone shots: the threat appears under a thumb zone, or text under 32 px | phone layout | mobile-port, game-ui |

## 4. Report and propose
Write a short report (in chat, and a *Playtest* section with the date in DESIGN.md): the questions, a small table of results per bot, the screenshots that matter, and **3–5 proposals**, each as *problem → change (exact `TUNING` key and new value, or a content change) → expected effect*. Ask with `AskUserQuestion` (multiSelect) which to apply, the biggest fun problem first, marked "(Recommended)". Apply the chosen ones with the improve-game steps, then re-run the same playtest to confirm the numbers moved the right way.

Remind the user that bots measure balance, not fun: suggest 2–3 specific things to feel for in their own next session.
