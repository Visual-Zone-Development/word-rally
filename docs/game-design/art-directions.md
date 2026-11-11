# Art directions

Style presets to offer the player and then follow consistently in the game, the cover and the hero. Each one is a starting point. Tweak the palette to the theme, but keep to 2–4 main colors plus a text color.

A preset sets the palette; what makes it look finished is the **light & depth** line under each one, plus the [art-direction skill](../../.claude/skills/art-direction/SKILL.md) for the whole-screen look and [cover-art](../../.claude/skills/cover-art/SKILL.md) for library art drawn with the game's own code. Star Courier ([Star Courier's `art.js`](https://github.com/Visual-Zone-Development/arcade-sampler/tree/main/games/star-courier/art.js) in Arcade Sampler) is a worked example of a lit vector look, and Arcade Sampler's other games show flat bold, paper and pastel, parchment, pixel art and neon side by side.

**Fonts.** The bundled art fonts are `Chakra Petch` (600, 700), `Rubik` (400, 700, 900), `Bungee`, `Lilita One` and `Press Start 2P`. They're available when the art is rendered, but **not automatically in the game**. To use the same font in-game, copy its `.woff2` from `.github/pushplay/node_modules/@fontsource/<font>/files/` (e.g. `bungee-latin-400-normal.woff2`) into `assets/fonts/` and load it with `@font-face` or `new FontFace()`. These fonts are OFL licensed, so note it in `assets/CREDITS.md`. Wait for `document.fonts.ready` before the first text draw, or text will flash in a fallback font.

---

### Pixel art
Crisp, chunky, retro.
- **Palette:** `#1a1c2c` night, `#5d275d` plum, `#ef7d57` orange, `#ffcd75` gold, `#f4f4f4` text (Sweetie 16-ish; PICO-8 is another good base).
- **Font:** `Press Start 2P` (titles and HUD; it's wide, so use it sparingly), or `Rubik 700` for body text.
- **Render:** draw at a low internal resolution (e.g. 320×200 or 427×267) on an offscreen canvas, then scale up by an integer to 1280×800 with `ctx.imageSmoothingEnabled = false`. Snap positions to whole pixels. Sprites can be defined as string arrays in code (`'..XX..'`) and baked into canvases once at startup.
- **Light & depth:** shade each sprite with a 3–4 step ramp per colour (shadows hue-shift toward blue/purple, highlights toward yellow), a 1px dark outline, and 2–3 parallax background layers.
- **Art:** an `art/cover.html` that draws with the game's own sprite code keeps it pixel-perfect. Otherwise use SVG `<rect>` grids with `shape-rendering="crispEdges"`.

### Flat bold vector
Clean geometric shapes, strong silhouettes. The house style of Star Courier.
- **Palette:** `#0b1024` deep navy, `#5cc8ff` cyan hero, `#ffb547` amber accent, `#ff7a6b` danger, `#eef0f5` text.
- **Font:** `Rubik 900` or `Lilita One` for titles, `Rubik 700` in the HUD.
- **Render:** canvas paths, no outlines or thin dark outlines, one shadow color. Shapes should read as silhouettes at a glance.
- **Light & depth:** three tones per shape (gradient or faceted fills) from one upper-left light, an ink edge in the darkest palette colour, a highlight edge facing the light, and a nebula/sky gradient backdrop with a vignette (Star Courier's `art.js`).
- **Art:** SVG with the same shapes, enlarged. The hero object breaks the frame edge for energy.

### Neon / synthwave
Glowing lines on black, high energy.
- **Palette:** `#07000f` black-violet, `#ff2bd6` magenta, `#00f0ff` cyan, `#fff200` yellow, `#ffffff` text.
- **Font:** `Chakra Petch 700` or `Bungee`.
- **Render:** draw glowing shapes twice, a wide translucent stroke then a thin bright one. That's cheaper than `shadowBlur`. If you do use `shadowBlur`, keep it to a few objects per frame, because it's expensive on the Deck. Use additive blending (`globalCompositeOperation = 'lighter'`) for particles, plus a perspective grid floor and scanline overlay for flavor.
- **Light & depth:** bake glow halos once and blit them additively; keep the background near black with a faint grid or haze so the neon carries the light.
- **Art:** SVG `<filter>` with `feGaussianBlur` for the glow is fine there, since it's rendered once.

### Cozy hand-drawn
Soft, warm, friendly.
- **Palette:** `#f6e7d0` paper, `#7fb069` leaf, `#e6aa68` honey, `#ca3c25` berry, `#3d2c2e` ink/text.
- **Font:** `Lilita One` for titles, `Rubik 400/700` for text.
- **Render:** rounded shapes, slightly wobbly outlines (jitter path points by ±1px per draw, or bake once), soft drop shadows as offset translucent shapes. Use gentle easing on everything, no harsh flashes.
- **Light & depth:** warm highlights and soft violet-brown shadows (never grey), a soft ground shadow under every object, and a hazy paler background layer for distance.
- **Art:** warm light, a cute hero front and center, plenty of round shapes.

### Paper / ink
Monochrome with one accent, like a sketchbook or a woodcut.
- **Palette:** `#efe9dc` paper, `#1d1d1f` ink, `#d7263d` single accent red, `#8a8577` mid-gray.
- **Font:** `Chakra Petch 700` (stark) or `Rubik 900`.
- **Render:** thick ink strokes, hatching for shadow, paper grain from a pre-rendered noise canvas drawn once. Use the accent only for what matters: the player, danger, goals.
- **Light & depth:** hatching density stands in for light (dense on the shaded side), and the paper grain sits over everything.
- **Art:** a high-contrast silhouette, with the accent on the hero.

### Low-poly 3D
Faceted, flat-shaded, colorful. Needs `--vite` + three.js (see [`3d.md`](3d.md)).
- **Palette:** `#87ceeb` sky, `#6ab04c` ground, `#f0932b` hero, `#eb4d4b` danger, `#ffffff` text.
- **Font:** `Rubik 900` / `Lilita One`.
- **Render:** `MeshLambertMaterial` or `MeshStandardMaterial` with `flatShading: true`, vertex colors instead of textures, a hemisphere light plus one directional light, and fog to hide the far plane.
- **Light & depth:** ACES or Neutral tone mapping, a tinted hemisphere light (cool sky, warm ground) plus a warm sun, fog matched to a gradient sky dome, and vertex-colour jitter with darker bases (the 3D defaults in [3d.md](3d.md#look)).
- **Art:** `art/cover.html` can render the actual scene with three.js, or draw the key model as flat SVG polygons in the same colors.

### Toon 3D
Cel-shaded, outlined, cartoon.
- **Palette:** `#ffe66d` sun, `#4ecdc4` teal, `#ff6b6b` coral, `#2d3047` outline/text.
- **Font:** `Lilita One` / `Bungee`.
- **Render:** `MeshToonMaterial` with a 3-step gradient map. For outlines, use back-face inverted hulls (a slightly scaled `BackSide` black mesh), which is cheaper than post-processing.
- **Light & depth:** the same tone mapping and tinted hemisphere light as low-poly, a warm key light so the toon bands read, and a gradient sky.
- **Art:** bold outlines and big, simple shapes.

---

## Consistency checklist
- The cover, hero, title screen and gameplay all use the **same palette and hero object**.
- The player character or ship has the **most saturated color** on screen. Enemies get the danger color. The background is the darkest or least saturated.
- Text uses the text color with strong contrast; check it at thumbnail size.
- Record the chosen preset, palette hex values and font in `DESIGN.md`, so later changes stay on-style.
