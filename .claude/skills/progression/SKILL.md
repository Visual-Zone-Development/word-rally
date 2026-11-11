---
name: progression
description: Add a meta loop to the game in this repo that brings players back — unlockable characters, ships or modes, upgrades bought between runs, a currency, achievements, a collection screen, daily seeded challenges and personal records — saved through save.js and balanced so runs stay fun. Use for "nothing to come back for", "add unlocks / upgrades / a shop", "add achievements", "add a daily challenge", "make it a roguelite", or the meta loop of a new game.
---

# Progression

Follow AGENTS.md (*Saves*). Read the game's `DESIGN.md` (core loop, especially the **Meta** line, fun targets and kickoff answer for progression).

## 1. Pick the meta loop that fits the fun
| Fun target | Meta loop that fits |
|---|---|
| Challenge | personal bests per mode, medals (bronze/silver/gold times or scores), a daily seed, a hard mode unlocked by beating normal |
| Expression | unlockable characters, ships, colours and hats; loadouts that change playstyle |
| Discovery | a collection or bestiary that fills in, secret levels, an achievement list with hidden entries |
| Submission | slow permanent growth: a garden, a town, a museum that fills as you play |
| Fellowship | unlockable arenas and modes for the group; a shared trophy shelf |

Pick **one main loop** and at most one small extra. More systems dilute each other.

## 2. Design rules
- **First unlock within the first run or two** (2–5 minutes). Then steady: roughly one new thing every 1–3 runs early, slowing later.
- **Sidegrades over raw power:** unlocks that change how you play (a ship that's faster but fragile) stay interesting; +10% damage forever makes the base game trivial. If upgrades add power, raise the ramp to match.
- **Show what's next:** locked items visible as silhouettes with their condition ("Reach wave 10").
- **Every run earns something**, even a bad one (currency, progress toward a goal), so a loss still moves the player forward.
- **Daily challenge:** seed the RNG from the local date (`YYYYMMDD`), one attempt counted per day (more allowed for practice), today's best saved.
- **No real money, no timers that punish not playing, no grind walls.**
- All costs, rates and thresholds in `TUNING.progression`.

## 3. Build it
1. **Save shape:** add the fields to `createSave(id, version, defaults, migrate)` defaults (`unlocks`, `currency`, `achievements`, `stats`, `daily`). If the save already exists, **bump the version and write `migrate(old)`** so existing players keep their best scores. Keys stay `<id>-save-v<n>`.
2. **Award at the right moments:** at game over, level clear and achievement triggers; call `save.save()` right after every award, and the game already saves on pause and in `input.onPause`.
3. **Screens:** a shop, collection or unlocks screen reachable from the title, built with `menu.js` (or a grid on `input.navX`/`navY` + pointer taps, see `game-ui`); B goes back. Unlock moments get a popup with a sound and a sparkle (see `game-feel`), shown on the results screen rather than mid-action.
4. **Title screen:** show progress at a glance (e.g. "12/30 found", today's daily best).
5. Add a debug helper (`window.__game.unlockAll()` behind `?debug`) to test every unlock quickly.

## 4. Verify
1. A fresh save: is the first unlock reached in the first few minutes? (Use `playtest` for a measurement.)
2. An old save from the previous version still loads and keeps its data (test the `migrate`).
3. Every new screen works with controller, keyboard, mouse and touch.
4. `npm run check` (it warns on save keys without the game id), fix every ✗.
5. Bump `version` (minor), update DESIGN.md (Meta loop, Changelog), commit (`<Name>: unlocks …`) and push.
