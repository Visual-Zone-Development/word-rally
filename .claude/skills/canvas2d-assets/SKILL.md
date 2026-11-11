---
name: canvas2d-assets
description: Draw and animate 2D game assets on canvas in any art style — vector shapes, pixel art, painted or user-supplied sprite sheets, SVG — for any 2D camera or game type: side-view platformers and fighters, top-down action, racing and twin-stick shooters, isometric strategy and builders, vertical/horizontal shmups, puzzle, card and board games, and UI. Toolkit for consistent outlines and shading, natural procedural animation, pixel-perfect scaling, sprite sheets and baking, isometric and directional helpers, plus an asset gallery page for renders. Load it with model-asset, edit-asset or animate-asset whenever a 2D game's assets are drawn or animated.
---

# 2D canvas assets

The general workflow (reference, breakdown, rounds, STYLE.md) is in **model-asset**, **edit-asset** and
**animate-asset**. This skill is the 2D how-to: how to structure, draw, animate and check 2D assets so they
look consistent in any art style and read well in the game's camera.

## Toolkit

In `toolkit/` next to this file. Copy what the game needs into the game folder (next to `game.js`, or `src/` in
a `--vite` game); if the game already has its own versions, extend those instead of adding a second system.

| File | Gives you |
|---|---|
| `sprite.js` | Style: `createStyle()` (outline colour/width, `flat`/`cel`/`soft` shading, light direction), `shape()` (fill + shading + outline in that style), `tint()`, paths `blobPath()`, `roundPoly()`. Motion: `keys()` eased keyframes (`inOut`, `out`, `in`, `back`, `elastic`), `spring()` for secondary motion, volume-preserving `squash()`, `pose()` transform, `seeded()` random. Pixel art: `pixels()` (draw at native resolution), `pixelOutline()`, `blit()` (whole-number scale, smoothing off). Sprites: `loadSheet()`, `bake()` (cache procedural frames at 2× for DPR 2), `drawFrame()`, `clip()`. Cameras: `iso()`, `depthSort()`, `directionIndex()`, `nineSlice()`. |
| `gallery.html`, `gallery.js` | Asset gallery: `?asset=<id>&scales=1,3`, `&anim=<a>&frames=<n>` (cycle strip), `&facings=<n>` (directional/top-down), `&compare=<id2>,<id3>`, `&hitbox=1`, `&bg=game|light|dark|checker|#hex`, `&t=`, `&team=`, `?list`. Sets `document.title = 'ready'` for model-asset's `scripts/shot.mjs`. Not part of the build: list it in `.pushplayignore` for plain games. |
| `assets2d.js` | The asset registry the gallery reads, with five worked examples: a vector side-view hero (idle/run/jump/attack), a pixel-art slime (held frames, outline, whole-number scale), a top-down tank (any facing, tread roll, recoil), a coin pickup (squash spin, sparkle) and a UI card (flip, hover). Replace them with the game's assets. |

## Asset contract

Every asset is a **pure draw function plus a little data**, so the game, the gallery and the cover art can all draw
any frame of it:

```js
export const ASSETS = {
  hero: {
    size: [36, 52],               // px at play size (before the game's camera zoom)
    anchor: 'feet',               // 'feet' (side view), 'center' (top-down, projectiles, UI), or 'base' (isometric)
    anims: { idle: 1.6, run: 0.5 },     // seconds per cycle
    hitbox: [-13, -48, 26, 48],   // relative to the anchor; the gallery can draw it
    pixel: false,                 // true: whole-number scales only
    draw(ctx, { anim, phase, t, facing, team, seed }) { /* draw around (0, 0) */ }
  }
}
```

- `phase` (0..1 through the cycle) drives everything; `t` is seconds for things that don't loop. No hidden state in
  `draw`: per-instance springs and timers live in the game object and are passed in.
- The game calls the same `draw` for each instance: `ctx.translate(x, y)` to the anchor, then `asset.draw(ctx, {...})`.
- Keep one module per asset (or per family) once a game has more than a few, and one shared style object.

## Art styles

| Style | How |
|---|---|
| **Vector shapes** (flat, cel, soft) | `shape()` with one shared `createStyle()`; outline width constant at play size; shading direction shared by every asset; exaggerate silhouettes. |
| **Pixel art** | Draw with `pixels()` at native size (e.g. 16×16, 32×32), add `pixelOutline()`, blit at whole-number scales with smoothing off; `fitCanvas(..., { integer: true })`; snap positions to whole pixels; use few, held frames (4–8 per cycle) and a fixed palette from STYLE.md. |
| **Painted / user sprite sheets** | `loadSheet()` + `clip()` + `drawFrame()`; keep the artist's frame rate; anchor every frame at the same pivot; never scale up beyond the source resolution (supply 2× art for DPR 2); credit in `assets/CREDITS.md`. |
| **SVG** | Draw shapes as SVG paths (`new Path2D(d)`) or rasterise once with `bake()`; good for UI, icons and crisp flat art. |
| **Expensive procedural art** (glows, many paths, hundreds of copies) | `bake()` frames once at 2× into a sheet, then `drawFrame()`; never `shadowBlur` per frame. |

## Game types and cameras

| Game type | Draw and animate for… |
|---|---|
| **Side-view** (platformer, fighter, runner, metroidvania) | Anchor at the feet; flip with `facing` (mirror, don't redraw); clear squash/stretch on jumps and landings that follow the game's gravity; readable attack wind-ups matched to hitbox frames; parallax background layers; the sprite never extends far beyond the hitbox. |
| **Top-down** (action, racing, twin-stick, tactics) | Anchor at the centre; either rotate one sprite with `facing` (vehicles, ships, tanks) or use 4/8 directional sprites via `directionIndex()` (characters); draw a soft shadow; `depthSort()` by y when things overlap; movement shown by treads, legs, dust or trails. |
| **Isometric** (strategy, builders, tactics) | `iso()` for positions, anchor at the base, `depthSort()` by screen y (or x + y); 2:1 tiles; draw tall objects so their base sits on their tile; 4 or 8 facings. |
| **Shmups / arcade** | Strong colour coding (player, enemy, enemy bullet, pickup, hazard all distinct by colour *and* shape), bullets brightest and simplest; bake glows; the hitbox much smaller than the sprite for the player and visible on demand. |
| **Puzzle, card, board** | Pieces and cards read at a glance (symbol + colour), state changes as quick tweens with an `out` ease or small `back` overshoot, hover/selection lift with a shadow, `nineSlice()` panels; never block input on decoration. |
| **UI and HUD** | Same style object (outline, palette) as the game art; text ≥ 24 px; icons from `input.label`/`drawPrompts` for buttons; animate in 150–300 ms. |

Physics and goals differ per game: read DESIGN.md first and let the animation follow the simulation
(animate-asset): stride from velocity, arcs from gravity, wind-ups from the telegraph rules.

## Crispness and scaling (PushPlay)

- The logical space is 1280×800 and `fitCanvas` scales it (DPR up to 2). Paths and text stay crisp automatically;
  bitmaps don't: bake procedural frames at `scale: 2`, supply 2× sprite sheets, or use pixel art with `integer: true`.
- Avoid `shadowBlur` and per-frame `filter`; cap particles; cache static backgrounds in an offscreen canvas.

## Rendering for comparison

```sh
node .claude/skills/model-asset/scripts/shot.mjs <game-id> <scratch> \
  "gallery.html?asset=hero&scales=1,4|hero.png" \
  "gallery.html?asset=hero&anim=run&frames=8&scale=3|run.png" \
  "gallery.html?asset=tank&facings=8&scale=2|facings.png" \
  "gallery.html?asset=hero&compare=heroOld&hitbox=1|compare.png" \
  "index.html|in-game.png|keys=Enter|wait=2500"
```

Always look at the ×1 (play size) column and the in-game shot, not only the zoomed one.
