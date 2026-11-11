---
name: boss-design
description: Design and build a boss, mini-boss or finale encounter for the game in this repo — readable attack patterns with telegraphs, phases that escalate, punish windows, an arena, a health bar and an entrance and death that feel like an event. Use for "add a boss", "the ending is flat", "give wave 10 a big enemy", "the boss is unfair / boring", or a finale in level-design. Works for any genre (shooter, platformer, brawler, puzzle "boss" levels).
---

# Boss design

Follow AGENTS.md. Read the game's `DESIGN.md` (fun targets, core verb, pacing) first: a boss is a **final exam of the core verb**, not a new game. It tests what the player already learned, then twists it once.

## 1. Write the boss on one page
Add a *Boss* section to DESIGN.md:
- **Fantasy and silhouette:** who it is, one line; a shape that reads at handheld size and differs from every normal enemy (bigger, a unique colour from the palette, a clear weak point).
- **What it tests:** the 2–3 skills from earlier in the game (dodge timing, aiming, positioning, a puzzle rule).
- **Attack list:** 3–5 attacks, each as *telegraph → attack → recovery (punish window)*.
- **Phases:** 2–3, switched at health thresholds (e.g. 66% and 33%). Each phase adds one attack, speeds up, or changes the arena. Never all three at once.
- **Arena:** fits the 1280×800 view (or locks the camera), with room to dodge.

## 2. Rules for a fair, exciting fight
| Rule | How |
|---|---|
| Telegraph everything | wind-up of 0.4–1.0 s: a pose, a glow, a ground marker, a sound cue. Faster telegraphs only in later phases |
| Readable on a 7" screen | danger zones in the palette's danger colour, high contrast, no hue-only signals |
| Punish windows | 1–2 s after a big attack where the boss is open; reward hitting it with extra feedback |
| One new idea per phase | phase 2 = phase 1 + one change; the last phase is the most intense, not the most complicated |
| Fair damage | a few hits to lose, not one (unless the genre is one-hit, then generous checkpoints) |
| No surprise off-screen attacks | anything entering from outside is warned at the edge first |
| Pattern with variation | a fixed order with a seeded random pick between 2 options, so it can be learned but isn't rote |

Model the boss as a **small state machine** in `game.js`: `intro → idle → telegraph(attack) → attack → recover → … → phaseChange → … → death`. Every duration, speed and threshold goes in `TUNING.boss`.

## 3. Make it an event
- **Entrance:** music change (a new layer or track via `game-audio`), the name in big text (≥ 48 px × `textScale`), a short camera move. Skippable with A after the first time (store it in `save.data`).
- **Health bar:** wide, top or bottom centre, phase notches on it, ≥ 32 px from the edges.
- **Hits:** hit-stop, a white flash on the boss only, a stagger at phase changes (see `game-feel`).
- **Death:** slow motion or hit-stop of 300–600 ms, a big particle burst (capped), a beat of silence, then a reward and a results screen. All shake and flash skipped when `settings.data.reducedShake` is on.
- **Retry:** losing to a boss restarts at the boss (a checkpoint) in one press, not at the start of the game.

## 4. Verify
1. Add `window.__game.jumpTo('boss')` so it can be reached instantly.
2. Play it with a controller and with the keyboard; it must be beatable on both, and with mouse/touch if `inputs` includes them.
3. Run the `playtest` skill with a greedy bot if practical: does it survive phase 1? How long does the fight last (aim for 1–3 minutes)?
4. Pause during each phase and every attack: everything freezes; Restart resets the boss fully.
5. `npm run check`, fix every ✗. Bump `version` (minor), update DESIGN.md (Boss section, Changelog), commit (`<Name>: boss …`) and push.
