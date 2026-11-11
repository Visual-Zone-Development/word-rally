---
name: prototype-sprint
description: Quickly build 2–3 tiny playable prototypes of different directions for one game idea, inside the repo's one game with a picker on the title screen, so the user can try them on the Deck or in a browser and choose; then grow the winner into the full game with new-game's milestones and remove the rest. Use for "I'm not sure what I want", "try a few ideas", "prototype some options", "which version is more fun?", or when the kickoff interview leaves two strong directions.
---

# Prototype sprint

Follow AGENTS.md. Prototypes answer **one question each: is this core verb fun?** They skip content, progression and polish, but they still follow the rules that keep the check green (title, pause, settings, art), because they ship to the user's library to be played.

## 1. Pick the directions
From the request or the kickoff interview ([kickoff.md](../../../docs/game-design/kickoff.md)), choose 2–3 directions that differ in **core verb or feel**, not just theme (e.g. "dodge" vs. "shoot" vs. "build"). Write one line each: *verb + challenge + the game it riffs on*. Confirm them with the user in one `AskUserQuestion` (or decide if they said "you pick").

## 2. One game, a picker on the title
1. Scaffold one game: `npm run new-game <id> --name "<Name> Prototypes"` (add `--vite` if any direction is 3D).
2. Write a short `DESIGN.md` with *Status: prototype*, the directions, and the question each answers.
3. On the title, the `menu.js` title menu lists the prototypes ("A: Dodge", "B: Shoot", "C: Build") plus Settings; the first item starts with A so the check still lands in gameplay. Each prototype is a module (`proto-a.js`, …) with `reset()`, `update(dt)` and `draw(ctx)`, sharing the starter's pause, settings, audio and save.
4. Keep each prototype tiny: one screen, the core verb, one challenge that ramps a little, a score or a fail state, a sound per action, quick placeholder shapes in the intended palette. Aim for the **30-second fun test** in [framework.md](../../../docs/game-design/framework.md).
5. Make a simple cover (title "<Name> Prototypes") and hero so the check passes (see `cover-art`).
6. `npm run check`, fix every ✗, commit and push. Tell the user how to try each one and **what to pay attention to** ("which one did you keep playing?").

## 3. Pick the winner and grow it
When the user has played them, ask one `AskUserQuestion`: which one, and what they liked or missed (or mix two). Then:
1. Remove the losing prototype modules and the picker; the winner becomes the game. Rename the game (`name` in `pushplay.json` and the title) if it had "Prototypes" in it; keep the id unless the user wants a new one (a new id means a new folder and a new library entry).
2. Rewrite DESIGN.md as a full brief (Status: approved) and continue with **new-game step 5** (build in milestones) through to shipping.
3. Bump `version` to `1.0.0` at release and record the sprint in the Changelog.
