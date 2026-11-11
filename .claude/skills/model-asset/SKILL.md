---
name: model-asset
description: Create or rebuild a visual asset for the game in this repo — a character, creature, vehicle, building, prop, pickup, effect, tile or UI element — to match a reference or art direction, in any rendering style (2D canvas shapes, pixel-art sprites, SVG, 3D, or the user's own files). Covers the game's STYLE.md, reference breakdown, silhouette and proportions, block-out, detail, and render-and-compare rounds. For one focused change to an existing asset use edit-asset; for motion use animate-asset; also load canvas2d-assets for 2D games or threejs-models for 3D models built in three.js code.
---

# Model an asset

Quality comes from one discipline: **work from a reference and compare renders against it every round.**
Never "improve" from memory alone. This skill is the workflow; *how* to draw or build the thing depends on
the game's rendering, so pair it with an engine skill when one exists:

| Game renders with | How-to |
|---|---|
| 2D canvas: vector shapes, pixel art, sprite sheets, SVG | **canvas2d-assets** skill (style, animation and sprite toolkit, asset gallery) |
| three.js, models built in code | **threejs-models** skill (rig, sculpting toolkit, asset viewer) |
| three.js with model files (GLB) | `docs/game-design/3d.md` → *Models*, `docs/game-design/assets.md` |
| Cover / hero art (SVG) | edit the SVG; `npm run check` renders it, or use the script below |

Sister skills share the game's `STYLE.md`: **edit-asset** (one focused change) and **animate-asset** (motion).

## 0. Read the game first

- `DESIGN.md`: what the game is, its camera and scale, what the player must read at a glance (hazards,
  pickups, enemies). An asset that looks great but reads wrong in play is wrong.
- `STYLE.md` (create it from `STYLE.template.md` next to this file if the game has none): palette, shape
  language, proportions, shared materials, animation timing, and the asset catalogue. Every choice you make
  follows it; every new rule you establish goes into it.
- How the game currently draws assets: reuse its conventions (one function or file per asset, shared palette,
  existing helpers). Don't introduce a second way of drawing things.

## 1. Get the reference (user-provided only)

- Ask for screenshots, concept art or a sketch, ideally several angles/poses and one at play size. If there is
  none, describe the target in words and get a yes before building (or, if the user said to go ahead, state the
  description as an assumption and record it in STYLE.md).
- **Never commit reference images** (they are usually someone else's art). Look at them in the conversation; copy a
  file to the scratchpad only if you need it for a side-by-side. What the reference shows is recorded **in words** in
  STYLE.md's catalogue and in your breakdown.

## 2. Write the breakdown before building

1. **Silhouette**: the 3–5 shapes that make it recognisable at play size, biggest first.
2. **Proportions**: in a unit that fits the asset (head-heights for characters, body lengths for creatures and
   vehicles, tiles for buildings), checked against STYLE.md's table.
3. **Pose / orientation**: how it sits in the game's camera (side-on platformer, top-down, ¾ isometric, 3D).
4. **Parts list** with materials or colours, mapped to STYLE.md's palette and shared parts.
5. **Detail split**: what is shape (geometry, outline) and what is painted/texture (lines, highlights, emblems).
6. **Gameplay reads**: what it must communicate (team, danger, hitbox size, facing, state) and how.

## 3. Block out, check the silhouette

Build only the big shapes, at the size the game shows them, and render them **at play size and zoom** next to the
reference and next to the assets it will appear with. Fix proportions and readability now; detail never rescues a
wrong silhouette or an asset that's the wrong size for its hitbox.

## 4. Detail

- Exaggerate per STYLE.md: what's small vanishes at play size, so make key features bigger than feels right.
- Reuse shared colours, outlines, materials and parts; add an asset-only piece only when nothing shared fits.
- Paint light in (highlights on top, shadow below, a dark line where parts meet) in the game's shading style.
- Keep the visual footprint honest to the collision shape: players must be able to trust what they see.

## 5. Render and compare, in rounds

Render the asset where you can see it clearly. Options, best first:
- a **gallery page** in the game folder (e.g. `gallery.html`) that draws one asset by query string:
  `?asset=<id>&view=<…>&anim=<…>&frames=<n>&scale=<…>&compare=<id2>`, and sets `document.title = 'ready'` when done.
  It isn't part of the build (Vite only bundles `index.html`; for plain games list it in `.pushplayignore`).
  canvas2d-assets ships one for 2D (`gallery.html`) and threejs-models one for 3D (`viewer.html`).
- the game itself (`index.html`), reaching the right screen with keys.

`scripts/shot.mjs` (next to this file) renders any of these to PNG:

```sh
node .claude/skills/model-asset/scripts/shot.mjs <game-id> <scratch>/round1 \
  "gallery.html?asset=hero&scale=4|hero-big.png" \
  "gallery.html?asset=hero&scale=1|hero-play-size.png" \
  "index.html|in-game.png|keys=Enter|wait=2500"
```

Each round:
1. Render the same views as the reference, **plus the asset at play size, in the game**.
2. Write down the **top 5 differences**, biggest first (silhouette > proportions > big parts > colours > detail).
3. Fix them, re-render, repeat until what's left is small detail (3–5 rounds is normal).
4. Show the user before/after (and the reference side by side) with the remaining gaps stated honestly.

Renders go to the scratchpad or a temp folder, never into the repo.

## 6. Finish

- Update STYLE.md: the catalogue row (file, reference in words, status) and any new shared rule.
- Check motion if it moves (animate-asset), then `npm run check` and look at its screenshot.
- Add a line to DESIGN.md's changelog and bump `version` in `pushplay.json`.
- Keep the old version reachable while the user decides (e.g. `<id>Old`), then remove it.

## Lessons so far

- Check a straight-on view every round, not only the reference angle: some faults only show from one side.
- Judge sizes at play zoom; things that read up close (faces, rivets) vanish in play, silhouettes and colour blocks don't.
- Painted detail reads better at small sizes than tiny shapes.
- Domes and spheres read as pillows; flatter plates with a rim read as armour.
