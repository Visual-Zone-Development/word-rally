# <Game Name>: art and animation style

The single source of truth for how everything in this game looks and moves: characters, creatures,
vehicles, buildings, props, effects and UI. `model-asset`, `edit-asset` and `animate-asset` read it
before any change and update it after. Change a rule here first, then bring assets in line; never let
one asset quietly drift. Keep only the sections that apply to this game.

## Look
- **Rendering:** <2D canvas shapes / pixel-art sprites / SVG / 3D (three.js) / user-supplied files>
- **Reference style:** <e.g. "Celeste-like pixel art", "Warcraft III: chunky, saturated, hand-painted",
  "flat vector, thick outlines">. Reference images are provided by the user in conversation and never
  committed; describe what they showed here, in words.
- **Shape language:** <round and friendly / angular and aggressive / blocky>; outline rules; shading
  (flat, cel bands, painted light); resolution / pixel size if pixel art.
- **Readability:** how big things are on screen at play (px), the minimum feature size that still reads,
  how player / enemy / pickup / hazard are told apart (colour *and* shape).

## Palette
| Role | Colour | Used on |
|---|---|---|
| Background(s) | `#……` | |
| Player / team colour(s) | `#……` | |
| Enemies / danger | `#……` | |
| Pickups / reward | `#……` | |
| Materials (metal, wood, skin, cloth…) | `#……` | |
| UI text / accent | `#……` | |

## Proportions and scale
| Archetype | Size on screen / in world | Proportions | Notes |
|---|---|---|---|
| <e.g. player> | <e.g. 32×48 px, or 1.8 m> | <e.g. 3 heads tall> | |
| <e.g. enemy small / large> | | | |
| <e.g. vehicle, building, prop> | | | |

Exaggeration rules: <e.g. weapons as big as the head, eyes 2× real>.

## Shared materials, parts and palettes
What every asset reuses so the game stays consistent (shared colours, outline width, shared textures or
sprite parts, shared materials in code). New shared pieces are added here first.

## Animation
Motion follows the game's physics and rules (see DESIGN.md). Timing tokens every asset uses:
| Token | Value | Notes |
|---|---|---|
| Frame rate / sample rate | <e.g. 12 fps sprites, procedural at 60> | |
| Walk / run cycle | <e.g. 8 frames, 0.6 s> | matches movement speed, no foot sliding |
| Attack / action | <wind-up / action / recovery in ms> | wind-up ≥ telegraph time the rules need |
| Jump / fall | <squash on take-off/landing, stretch in air> | follows the game's gravity |
| Hit / damage | <flash ms, knockback> | |
| Idle | <breathing, blink interval> | desync crowds |
| UI | <ease, duration> | |

## Asset catalogue
| Asset id | File(s) | Reference (described in words) | Status | Last change |
|---|---|---|---|---|
| | | | | |
