---
name: art-direction
description: Give the game in this repo a cohesive, polished look across the whole screen, not one asset at a time — a material vocabulary (paper and ink, painted gouache, neon glass…), value and palette structure, textured backgrounds, UI that looks like part of the world (parchment cards, brush-stroke headers, ink-blot prompts), typography pairing with bundled fonts, lighting and atmosphere, and one finishing pass that ties every layer together. Ships a surface toolkit (texture.js) and an OFL serif font. Use for "make it look like <screenshot>", "it looks flat / generic / like a tech demo", "make it prettier", "art pass", "polish the visuals", "the menus look plain", or the visual-polish milestone of new-game. Pairs with model-asset / edit-asset for individual assets and character-models for 3D characters loaded from files.
---

# Art direction

Follow AGENTS.md (*Screens and scaling*, *Performance*, *Art*). The asset skills (model-asset, edit-asset,
animate-asset) make one thing look right; this skill makes **the whole frame** look like one deliberate
world. Games that look striking in a screenshot nearly always win on four things, in this order:

1. **One material vocabulary.** Everything on screen is visibly *made of something*, and it's the same few
   things (paper + ink + paint; brushed metal + glass + neon; felt + wood + chalk). Flat default fills are
   what make a game look like a tech demo.
2. **Value and palette structure.** A clear lightest-to-darkest plan, a calm background, and **one hero
   colour** that contrasts with it (often its complement: a red cape on teal, an orange ship on navy).
3. **UI that belongs to the world.** Menus are objects in the setting (a torn parchment card, a carved plate,
   a hologram), not grey boxes. Typography is chosen: a display face plus a small-caps label style.
4. **Atmosphere and finish.** Light direction, shadows under things, depth (vignette, fog, parallax), and
   one overlay (grain, paper, scanlines) across *everything*, which glues the layers into one image.

Detail comes last; it never rescues a frame that fails these four.

## 0. Read the game and capture where it is

- `DESIGN.md` (fun targets, art direction, palette) and `STYLE.md` if there is one.
- Capture the screens that matter at play size: title, gameplay after ~20 s, pause, game over, any custom
  screen. Use `node .claude/skills/model-asset/scripts/shot.mjs <id> <scratch>/before "index.html|title.png" "index.html|play.png|keys=Enter|wait=20000"`
  (or the `npm run check` screenshot). Renders go to the scratchpad, never the repo.

## 1. Get a reference and break it down

Ask the user for screenshots of the look they want (another game, a trailer frame, concept art). They're
for looking at in the conversation only: **never commit them**, and never copy another game's art, logo or
characters. Take its *principles*. Write a look breakdown:

| Question | Example (a storybook RPG character screen) |
|---|---|
| What is everything made of? | painted gouache background, parchment card, ink brush strokes, cloth on the character |
| Values: lightest / darkest, where? | lightest = parchment and white tunic (the focus); darkest = ink; background mid-dark |
| Palette: background, hero colour, accents | teal wash; one red (cape, selected row); ochre pattern; ink black |
| Surface scale | big soft brush dabs on the background, fine grain on paper, fibres only up close |
| Pattern / culture | large faded stepped-fret motif: says "world" without competing |
| Type | elegant serif display ("Make your hunter"); tiny letter-spaced small caps for labels |
| UI as object | torn-edge card with drop shadow; brush-stroke header bar; ink-blot button prompts |
| Light and framing | soft top-left key light; character fills the left half, menu the right |

Then write the game's **Scene look** into `STYLE.md` (create it from
`.claude/skills/model-asset/STYLE.template.md` if missing). Add this section under *Look*:

```md
## Scene look
- **Materials:** <the 2–4 things everything is made of>
- **Values:** <lightest = …, darkest = …, background sits at …>
- **Hero colour:** <#hex> on <background #hex>; used only for <player, selection, goals>
- **Surfaces:** <wash / paper / grain settings, seeds>; overlay <grain at 0.18 overlay>
- **Type:** display <font, size>, labels <font, small caps, tracking>, body <font>
- **UI objects:** <panel = torn paper card, header = brush stroke, prompt = ink blot>
- **Light:** <direction, warm/cool, shadow colour>
```

## 2. Make the big moves, in order of impact

Change one layer at a time and re-render the same screens after each.

1. **Palette and values.** Re-map existing colours to the plan. Squint test: blur the screenshot (or view it
   at 25 %); the player and the selected menu item should be the first things you see.
2. **Background surface.** Replace flat fills with a baked surface: `wash()` for painted, `paper()` for
   parchment or sketchbook, plus `stamp()` with a motif at low alpha for culture, and `vignette()`.
3. **UI as an object.** Panels become `paperCard()` (or the game's equivalent material), headers sit on a
   `brush()` stroke, button prompts on an `inkBlot()`. Keep `menu.js` for behaviour and draw its items yourself
   (`menu.items`, `menu.selected`), with the selection in the hero colour. Prompts still come from
   `input.label()` / `drawPrompts`, never literal key names.
4. **Typography.** Bundle a display face (see *Fonts*), use small caps with letter spacing (`ctx.letterSpacing`)
   for labels, italics for flavour lines. Every size stays ≥ 24 px × `settings.data.textScale`.
5. **Light and depth.** 2D: a consistent light direction in every asset's shading, a soft ground shadow under
   characters, parallax background layers, ambient particles (dust, leaves, embers) at low count. 3D: see
   **character-models** (toon shading, coloured shadows, rim light) and add fog.
6. **Finish.** One `grainTile()` pattern over the whole frame with `globalCompositeOperation = 'overlay'` at
   ~0.12–0.2 alpha (on the HUD canvas in a 3D game, so it covers the 3D view too).
7. **Motion.** UI eases in (150–300 ms, `out` or small `back` overshoot), idle characters breathe, selected
   rows nudge. A still frame should look good; a moving one should feel alive.

## Toolkit

In `toolkit/` next to this file. Copy `texture.js` (and the fonts you use) into the game folder (next to
`game.js`, or `src/` in a `--vite` game). If the game already has its own versions, extend those.

| Export | What it gives you |
|---|---|
| `surface(w, h, scale)` | offscreen canvas at 2× with ctx pre-scaled, `.draw(ctx, x, y)` |
| `wash(w, h, { colors, dabs, dabSize, seed })` | painted gouache / watercolour background |
| `paper(w, h, { color, dark, mottle, grain, fibres, edge })` | parchment / sketchbook surface |
| `paperCard(w, h, { pad, rough, … })` | torn-edge paper card with baked drop shadow (draw at x − pad, y − pad) |
| `brush(ctx, pts, { width, color, dry })` | dry-brush ink stroke (headers, underlines, slashes, map routes) |
| `inkBlot(ctx, cx, cy, rx, ry)` | ink blob with splatter (prompt backings, icons, stamps) |
| `stamp(ctx, w, h, motif, { cell, alpha, fade })` + `fret` | printed / painted repeating motif |
| `tornRect()`, `blot()` | the paths behind the above, for your own shapes and clipping |
| `vignette()`, `grainTile()` | depth and the finishing overlay |
| `noise2()`, `perPixel()`, `seeded()`, `mix()` | building blocks for your own surfaces (wood, stone, metal, cloth) |

`demo.html` / `demo.js` is a reference screen built only from these (a storybook character select). Serve the
folder and render it to see the target quality and how the layers are composed:

```sh
cd .claude/skills/art-direction/toolkit && python3 -m http.server 8765 &
# then screenshot http://localhost:8765/demo.html?t=2 (add &scale=2 for DPR 2) with Playwright
```

**Performance rule:** every `wash`, `paper`, `paperCard`, `stamp` and `brush` call is a *bake*: do it at
startup or on resize of content, never per frame (`perPixel` touches every pixel). Per frame you only blit
the baked canvases, draw text and moving things, and one grain `fillRect`. Bake at `scale: 2` for anything
with fine detail so it stays crisp at DPR 2; a full-screen `wash` can stay at 1× (it's soft anyway).

### Optional: painted surfaces with the user's own image key

If `OPENAI_API_KEY`, `GEMINI_API_KEY` or `REPLICATE_API_TOKEN` is set (environment or `.env`), painted
backgrounds, terrain textures, key art and detailed props can also be generated: write
`art/prompts.json` with the Scene look as its `style`, run `npm run art -- --dry` and tell
the user the cost. Wait for them to agree, then generate 2–3 with `--approve <$>`, look at the contact
sheet, tell them the cost of the rest and ask again before generating it
([generated-art.md](../../../docs/game-design/generated-art.md)). Bake them like any surface and keep
the toolkit versions as fallbacks. With no key, skip this; the toolkit alone reaches the target quality.

## Fonts

`toolkit/fonts/` has **EB Garamond** (400, 600, 400 italic; latin; SIL OFL, licence in `OFL.txt`): the
storybook / literary / fantasy serif. Copy the files you use to `assets/fonts/`, add a line to
`assets/CREDITS.md` ("EB Garamond, The EB Garamond Project Authors, SIL OFL 1.1"), load with
`new FontFace(...)` and wait for it before the first text draw (`demo.js` → `fonts()` shows how). Other OFL
fonts can be fetched with `npm pack @fontsource/<font>` and copied the same way (only the `latin` `.woff2`
weights you use). Pick by mood: serif for fantasy and storybook, a geometric sans for sci-fi and UI-heavy
games, a rounded display face for cozy and kids' games. The cover art can only use the fonts AGENTS.md lists,
so pick the closest one there for the cover title (or draw the cover with `art/cover.html`, which can load the
game's own font from its folder).

## Look recipes

Starting points for any genre (fantasy, sci-fi, modern, abstract); the game's references always win. Record the one you pick in STYLE.md and adapt it. More presets (pixel art, neon, low-poly…)
are in `docs/game-design/art-directions.md`.

| Look | Materials | Palette idea | Toolkit |
|---|---|---|---|
| **Storybook paper & ink** (fantasy RPG, adventure) | gouache wash, parchment, ink, cloth | teal or sage wash, one red/vermilion hero colour, ochre pattern, ink black | `wash` + `stamp(fret)` + `paperCard` + `brush` + `inkBlot`, EB Garamond, grain overlay |
| **Painted gouache** (cozy, exploration) | thick paint, soft light | warm mid-tones, a saturated complementary accent | `wash` for sky and ground layers, dab-shaded assets (canvas2d-assets `soft` shading), vignette |
| **Ink wash / sumi-e** (action, samurai, mythic) | rice paper, black ink, one red seal | paper `#efe9dc`, ink, a single red | `paper`, `brush` for terrain and slashes, red `inkBlot` seals for UI |
| **Cartographer** (strategy, tactics, exploration) | map paper, ink lines, wax seals | parchment, faded blue water, red routes | `paper` full screen, `brush` routes, `stamp` for hatching or forests, `paperCard` panels |
| **Neon / synthwave** (racers, shooters, rhythm) | glass, chrome, light | near-black, two hot complementary neons | `backdrop.js` city / grid layers (environments), glow drawn twice (wide translucent + thin bright), scanline or grain overlay |
| **Lit vector** (arcade, space, shooters; Star Courier) | enamel shapes, ink edges, nebula or sky | dark cool backdrop, one saturated hero colour, one glowing accent | three-tone shading from one light, ink edge, baked additive glow, `wash`-style backdrop, vignette (see [Star Courier's `art.js`](https://github.com/Visual-Zone-Development/arcade-sampler/tree/main/games/star-courier/art.js) in Arcade Sampler) |
| **Clean modern** (puzzle, sports, casual, UI-heavy) | flat surfaces, soft shadows | one brand colour + neutrals | flat fills, generous spacing, one soft drop shadow, a geometric sans |
| **Grim / horror** (survival, roguelike, mystery) | stone, rust, fog | desaturated darks, one sickly or blood accent | heavy vignette, fog haze, grain overlay, light pools as the only bright areas |
| **Pixel art** (RPG, action, tactics, platformers) | pixels on a fixed grid, hue-shifted ramps | per the game's pixel spec | the **pixel-art** skill (characters, animations, tiles, UI) |
| **Anime toon 3D** (character-led 3D games) | cel-shaded skin and cloth, painted sky | soft sky, coloured shadows, one hero colour | **character-models** (`toon.js`), a `wash` or painted-sky backdrop, the storybook UI above |

## 3. Render and compare, in rounds

Same as model-asset, but for whole screens:
1. Render the same screens as the reference **and** your *before* shots, at 1280×800 and at DPR 2.
2. List the **top 5 differences**, biggest first: values > palette > surfaces > UI objects > type > detail.
3. Fix, re-render, repeat (3–5 rounds is normal). Show the user before / after with the reference.
4. Check readability at play: gameplay must still be readable at a glance. Textures sit *behind* the play
   layer at low contrast, and the danger / pickup / player colours from STYLE.md stay distinct.

## 4. Finish

- Match the library art to the new look (**cover-art**; an `art/cover.html` can reuse `texture.js`).
- Measure frame time on gameplay with the overlay on (**performance-pass** if it drops below 60 fps at DPR 2).
- `npm run check`, look at the screenshot, bump `version`, add a Changelog line to DESIGN.md, update
  STYLE.md's Scene look, commit (`<Name>: art pass …`) and push.

## Lessons so far

- A single grain overlay across every layer does more for "one world" than any individual asset change.
- Patterns read as culture only when large, few and faded (alpha 0.25–0.35); small, busy patterns read as noise.
- Small caps with letter spacing instantly make a menu look designed; keep them ≥ 24 px for handhelds.
- Coloured shadows (warm skin → rosy shadow, white cloth → blue-violet shadow) beat grey shadows every time.
- A dark ink edge (the darkest palette colour, 2–4 px, filled before the colours) separates every sprite from
  any textured background and survives scaling down; a 1 px highlight on the edges facing the light finishes it.
- Things that rotate keep the world's light: draw the surface rotated, then the shading unrotated, clipped to
  the same outline (`drawRock` in [Star Courier's `art.js`](https://github.com/Visual-Zone-Development/arcade-sampler/tree/main/games/star-courier/art.js) in Arcade Sampler).
- Keep one art module that the game, `art/cover.html`, `art/hero.html` and an `art/gallery.html` contact sheet
  all import, so the library art can't drift from the game (Battle Drones' HUD icons are renders of its models
  for the same reason). `npm run art:shots` renders them all, plus the cover at tile size.
