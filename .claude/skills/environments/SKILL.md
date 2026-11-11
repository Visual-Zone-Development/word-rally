---
name: environments
description: Design and build the world the game in this repo takes place in, for any genre, camera and art style — side-view stages, top-down maps and rooms, isometric boards, tracks, arenas, space, cities, interiors and 3D scenes — readable play spaces, landmarks and composition, tiles that join up automatically (edge, blob and corner autotiling), natural scattering, levels written as text, parallax backdrops, skies and time of day, atmospheric depth, ambient motion and weather, all matched to the game's references. Ships a renderer-agnostic toolkit (autotile.js, scatter.js, levelmap.js, backdrop.js) and a squint-test readability tool. Use for "make the world / background / level look better", "add a background", "the map looks tiled / repetitive / empty", "I can't tell where I can walk", "add parallax", "day and night", "build a town / dungeon / track / arena", or any environment art. Pairs with pixel-art (pixel terrain and props), art-direction (whole-screen look), level-design (layout and pacing), camera and performance-pass.
---

# Environments

Follow AGENTS.md (*Screens and scaling*, *Performance*). Read the game's DESIGN.md (genre, camera, fun
targets) and STYLE.md. This skill is for every kind of game: it never assumes a genre, a camera or a style.
What an environment looks like comes from the game's references. What stays fixed is the craft: the world
has to be readable, navigable and consistent before it can be pretty.

Related skills: **level-design** owns *what* is in a level (layout, pacing, difficulty); this skill owns how
the space looks and reads. **pixel-art** has pixel terrain, props and tiles. **art-direction** owns the
whole-screen look (materials, palette, finish). **camera** owns framing. **performance-pass** owns the budget.

## 1. Read the game and the reference

1. **Camera and space:** side view, top-down, three-quarter top-down, isometric, fixed screen, scrolling
   track, free 3D (third person, first person, top-down 3D). Note what the camera shows of a surface (only
   tops, tops and fronts, sides) and what scrolls.
2. **Get references** from the user (screenshots of games they like, concept art, photos for mood) and
   measure them, the same way faces and dialogue are matched. Never copy their art.

| Measure | What to record |
|---|---|
| **Grid** | tile or module size in px or units; is the grid visible or hidden; how big a character is in tiles |
| **Perspective** | which faces of walls and objects show; how tall walls are relative to a tile; angle |
| **Value structure** | play layer vs background: which is lighter or darker; how many value bands; where the darkest darks are |
| **Palette** | the 2–4 main environment colours per area; how saturated next to characters; the haze colour |
| **Texture density** | flat colour, sparse detail, busy detail; detail size relative to the tile; how much is noise vs deliberate marks |
| **Edges** | outlines on terrain or not; how edges, corners and transitions are drawn (lips, rims, shadows, foam) |
| **Depth** | parallax layers (how many); haze; fog; vignette; scale change with distance |
| **Light** | direction; time of day; cast shadows (shape, colour, opacity); light sources (windows, torches, neon) |
| **Life** | ambient motion: water, foliage sway, particles, NPCs, weather; how much moves at once |
| **Set dressing** | what kinds of props, how dense, how they cluster (along walls, around landmarks) |

Write an **Environment style** block in STYLE.md, one per area or biome if they differ:

```md
## Environment style: <area> (from <references, described in words>)
- Camera: three-quarter top-down; walls show top + 0.5-tile front face; character = 1 × 1.5 tiles
- Grid: 32 px, hidden by variants and decoration; Values: floor mid-dark, walls lighter tops, characters brightest
- Palette: floor #…, wall top #…, wall face #…, accent #…, haze #…
- Texture: sparse, 2–4 px marks, no noise; Edges: 2 px dark line where walls meet floor, no outlines on floor
- Depth: none (top-down) | 4 parallax layers with haze toward #…
- Light: from top-left; soft shadows #…@40% to the lower right; warm light pools around torches
- Life: water ripples 4 frames, dust motes, 0–2 ambient NPCs per room
- Dressing: crates and barrels against walls in groups of 2–3, rugs under furniture, nothing in doorways
```

## 2. Design rules (every genre)

- **Readability first.** At a glance the player must tell *walkable / solid / hazard / interactive* apart,
  by value and shape before colour (colour-blind players, small screens). Hazards share one visual language
  across the whole game.
- **Value layers:** background lowest contrast and nearest the haze colour; play layer clear; characters,
  pickups and hazards highest contrast and most saturated. Run the squint test (section 5).
- **Landmarks:** every area has one thing you can navigate by (a tower, a giant tree, a coloured door, a
  planet). Vary the silhouette, not just the colour.
- **Lead the eye:** paths, light, contrast and lines of props point toward the goal. Dead ends look like dead ends.
- **Scale:** doors, steps, furniture and vehicles are sized to the characters (record the ratios in STYLE.md)
  and stay consistent across areas.
- **Rhythm:** dense and sparse areas alternate; quiet spaces after intense ones; decoration clusters in
  groups (3s and 5s) with empty space between, never spread evenly.
- **Variety without noise:** a small kit of modular pieces, a few variants of each, and set pieces at key
  spots. Nothing periodic at tile size (a grid of identical patches reads as wallpaper).
- **Environmental storytelling:** props suggest what happened here (a toppled cart, scorch marks, a
  half-eaten meal), in the game's tone.
- **Motion budget:** a few ambient movements make a space alive; too many fight the gameplay for attention.
  Honour `settings.data.reducedShake` (no flashing, lightning or camera-shaking weather when it's on).
- **Performance:** bake static layers once (ground, backdrops), draw them as images, and cull off-screen tiles.
  In 3D, instance repeated props and keep to `docs/game-design/3d.md` budgets.

## 3. Build: pick the approach per layer

| Approach | Use for | Toolkit |
|---|---|---|
| **Grid + autotiling** | anything made of cells: ground, walls, water, roads, platforms, boards, tracks | `autotile.js`: `edge` (16: side-view ground and platforms, pipes, fences, roads as lines), `blob` (47: top-down walls, cliffs, water bodies, carpets with inner and outer corners), `corner` (16: blending two terrains with a wobbly border). `bakeTileset(scheme, size, draw)` calls *your* draw function for each variant, so the tiles are in the game's style; `drawTiles` draws a grid. Pixel games can use the pixel-art skill's `tiles.js` terrain fills as the draw function. |
| **Levels as text** | hand-made rooms and stages in any grid game | `levelmap.js`: `parseLevel(text, { legend })` → layers and entity spawns; `solidRects` merges colliders; `reachable` checks the exit can be reached. |
| **Scattering** | trees, rocks, grass, debris, crowds, stars, asteroids, 3D instances | `scatter.js`: `poisson` (even but natural spacing, with `density` and `avoid` callbacks to keep paths, doors and spawns clear), `clusters` (patches, rubble, belts), `pick` (weighted variants). |
| **Backdrops** | skies, distant scenery, menus, any background | `backdrop.js`: `sky` gradients; `layer(kind, …)` seamless strips (hills, mountains, dunes, waves, forest, pines, city, clouds, stars) in vector or pixel mode (`pixel: 4`); `drawParallax` by camera; `haze` for atmospheric perspective; `timeOfDay` blends palette keyframes. |
| **Set pieces** | landmarks, boss arenas, story spots | Hand-built per game (model-asset workflow) and placed by the level text or by hand. |
| **3D scenes** | three.js games | Ground as a few large meshes or a heightfield; scatter positions from `scatter.js` → `InstancedMesh`; sky gradient on a large sphere or `scene.background`; fog colour = haze colour; one directional light + hemisphere light; budgets in `docs/game-design/3d.md`. |

Recipes by camera, as starting points to adapt to the measured style:

- **Side view:** 3–5 parallax layers (sky fixed, far scenery 0.1–0.2, mid 0.3–0.5, near 0.6–0.8, the play
  layer 1, optional foreground over the play layer at 1.2–1.5 with high contrast and low opacity). Ground
  uses edge autotiles: cap on top, edges at the sides, dark underside. Decorate tops only.
- **Top-down / three-quarter:** the floor stays calm (low contrast, variants and decals). Walls use blob
  autotiles with a lit top and a darker front face where the camera sees it. Shadows fall the same way
  everywhere. Props sort by the y of their feet.
- **Isometric:** a 2:1 diamond grid; walls show two faces with different values (one lit, one shaded).
  Sort by x + y, and keep everything snapped to the same grid.
- **Tracks and runners:** strong edge contrast where the track meets the off-track area, repeating
  roadside landmarks to show speed, the horizon and sky carrying the mood.
- **Arenas and boards:** a neutral, readable floor; the frame or edges carry the decoration; nothing
  decorative inside the play area that looks interactive.
- **Space and abstract:** depth from star layers at different speeds and sizes; nebula or gradient haze for
  colour; scattered objects in clusters.

## 4. Light, weather and time

- One light direction for the whole game (matching the characters). Shadows are a darker, cooler version
  of the surface or a translucent haze colour, never pure black.
- **Time of day** and **area mood** are palette keyframes in STYLE.md (`timeOfDay`), applied to sky, haze,
  ambient tint and light sources together, never to one layer alone.
- **Light sources** (windows, lamps, neon, lava, crystals) carry their colour onto nearby surfaces as soft
  pools; at night they become the landmarks.
- **Weather** as layers: rain or snow particles in two depths, wind in foliage and particles together, fog as
  haze. Keep particle counts within the performance budget, and calm it all down with reduced shake.

## 5. Render, squint, compare

1. Capture the area in the game (model-asset's `shot.mjs`, or the check's screenshot) next to the reference.
2. Run the squint test:
   `node .claude/skills/environments/squint.mjs <shot.png> <scratch> --play x,y,w,h --bg x,y,w,h`. Look at
   `-values.png` and `-squint.png`: the player, the path and hazards must still read. It also reports the
   value separation between play layer and background.
3. List the top 5 differences from the reference, biggest first: value structure > readability of walkable
   and blocked areas > palette > texture density and edges > detail. Fix, re-render, repeat.
4. Check scale against a character, every camera position the game uses, the largest and smallest
   areas, and frame time (performance-pass).
5. Update STYLE.md, bump `version`, add a Changelog line, `npm run check`, commit and push.

`toolkit/demo.html` shows four game types (side view, top-down, space, a city at dusk in pixel mode) built
from the same toolkit with placeholder vector art.
