---
name: edit-asset
description: Make one focused change to one existing asset in the game in this repo — a character, creature, vehicle, building, prop, pickup, effect, tile, sprite or UI element — without touching anything else, in any rendering style (2D, pixel art, SVG, 3D). E.g. "make the hero's sword bigger", "darker red on the enemy's armour", "the coin should sparkle", "fix the ship's wing". Iterates on that single asset with before/after renders. For a new asset or a full rebuild use model-asset; for motion use animate-asset.
---

# Edit one asset

The goal is a **small, contained, reversible** change: the user asks for one thing, one asset changes, and
everything else in the game stays exactly as it was. Sweeping restyles are a different job (model-asset, or a
STYLE.md change agreed with the user).

## 1. Pin down the target

- Which asset and which part ("the axe head", "left wing", "the coin's shine")? If the request is vague
  ("make it cooler"), offer 2–3 concrete options and let the user pick.
- Read the game's `STYLE.md` (if any) and `DESIGN.md`: the change must stay inside the style rules and must not
  break what the asset communicates in play (its size vs its hitbox, team or danger colour, facing). If it would,
  say so and ask whether to change the rule or the request.
- Find where it is drawn: STYLE.md's asset catalogue, or search the game's code for its id/name (a draw function,
  sprite sheet region, SVG, model file). If the asset is tangled with others, isolate it first in a separate,
  behaviour-preserving step the user agrees to.

## 2. Capture "before"

Render the asset in isolation and in the game, with model-asset's `scripts/shot.mjs`:

```sh
node .claude/skills/model-asset/scripts/shot.mjs <game-id> <scratch>/before \
  "gallery.html?asset=<id>&scale=4|close.png" "index.html|in-game.png|keys=Enter|wait=2500"
```

Use the game's gallery/viewer page if it has one (canvas2d-assets has `gallery.html`, threejs-models `viewer.html`),
otherwise the game itself.
Add a frame strip if the change could affect motion. Renders go to the scratchpad, never into the repo.

## 3. Make the smallest change that does it

- Edit **only that asset's** code, data or file.
- **Shared things are off limits by default**: palettes, shared materials or sprite parts, helpers, rigs and other
  assets are used elsewhere. If the change truly needs one, either fork it for this asset (a copy under the asset's
  own name) or ask the user, then re-render **every asset that uses it** before and after.
- Keep the old version reachable while iterating (e.g. `<id>Old`) for side-by-side compares; remove it at the end.
- No refactors, renames or "tidying" of unrelated code in the same change.

## 4. Capture "after", compare, iterate

1. Render the same views as "before" with the same parameters.
2. Check: the requested change is visible **at play size**, nothing else changed, motion still works.
3. Iterate in small steps; two or three rounds is typical.
4. Show the user before/after side by side and say exactly what changed (and what didn't).

## 5. Finish

- Remove the `<id>Old` copy unless the user wants to keep comparing.
- Update the asset's row in STYLE.md's catalogue; add a line to DESIGN.md's changelog; bump `version` in `pushplay.json`.
- Run `npm run check`.
- Commit it on its own: `<game>: <asset> — <change>`, so it's easy to revert.
