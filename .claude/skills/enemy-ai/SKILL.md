---
name: enemy-ai
description: Design and build enemy and NPC behaviour for the game in this repo — state machines (patrol, alert, chase, attack, flee), steering (seek, flee, arrive, separation, flocking), grid pathfinding (BFS, A*, flow fields), line of sight, group tactics like flanking and taking turns, and difficulty through behaviour rather than raw stats. Use for "enemies are dumb / random", "they all clump together", "make enemies smarter", "add a new enemy type", "enemies get stuck on walls", or any AI opponent (racing rivals, a CPU player in a versus game).
---

# Enemy AI

Follow AGENTS.md. Read the game's `DESIGN.md` (fun targets, conflict, pacing) first. Good game AI is **readable and fair, not clever**: the player should be able to predict it, then outplay it.

## 1. Give each enemy type a one-line role
Write a small table in DESIGN.md (or the *Content* section from `level-design`):

| Enemy | Role | Behaviour in one line | Tell (how the player reads it) |
|---|---|---|---|
| Grunt | fodder | walks straight at you | slow, bright |
| Dasher | punishes standing still | stops, flashes, dashes in a line | 0.6 s wind-up flash |
| Sniper | forces movement | keeps distance, fires a slow shot | laser line before the shot |

Each new type should **ask the player a different question** (move, aim, prioritise, use the environment), not just have more health.

## 2. Pick the simplest technique that works
| Need | Technique |
|---|---|
| Distinct modes (idle, patrol, chase, attack, stunned) | a **finite state machine**: `state`, `timer`, and one `update` per state; transitions on timers, distance and line of sight |
| Natural movement toward or away from things | **steering**: seek, flee, arrive (slow near the target), wander; add **separation** so groups don't stack into one blob |
| Getting around walls on a grid | **BFS** for a few enemies; **A\*** for long paths; a **flow field** (one BFS from the player, every enemy follows the arrows) for many enemies at once |
| Seeing the player | distance check + a ray or grid line test for **line of sight**; remember the last seen position for a few seconds |
| Groups | a simple **token** system: only N enemies may attack at once, the rest circle or wait; flankers pick a spot to the side of the player |
| Racing or CPU opponents | follow a racing line of waypoints with a look-ahead; difficulty via line accuracy and reaction delay, plus mild rubber-banding |
| Turn-based / board games | score every legal move with a heuristic; add a little randomness; minimax with a small depth for simple games |

## 3. Fairness rules
- **Telegraph every attack** (0.3–1.0 s wind-up with a pose, flash or sound) and give a recovery window after it.
- **Reaction delay** of 150–400 ms before an enemy responds to the player, so it never feels psychic.
- **No off-screen hits** without a warning at the screen edge.
- **Cap simultaneous threats** (attack tokens, max alive) so the screen stays readable on a 7" display.
- **Difficulty through behaviour:** faster decisions, better aim, more attackers allowed at once, rather than only more HP or damage.
- Enemies never get stuck: if a path fails or an enemy hasn't moved for 2 s, re-path or teleport-respawn it out of view.

## 4. Build and verify
1. Put every number (speeds, ranges, wind-ups, reaction delays, token counts) in `TUNING.enemies.<type>`.
2. Keep per-frame work cheap: path re-computation on a timer (every 0.2–0.5 s) or a shared flow field, a spatial grid for neighbour checks, pooled enemies (see `performance-pass`).
3. In the `?debug` overlay, draw each enemy's state name, its target and its path or field arrows.
4. Pause freezes all AI timers; Restart resets them; seeded RNG for any randomness (`?seed=`).
5. Play against each enemy type alone, then mixed. Run `playtest` if practical to see which types end runs.
6. `npm run check`, fix every ✗. Bump `version`, update DESIGN.md (enemy table, Changelog), commit (`<Name>: enemy AI …`) and push.
