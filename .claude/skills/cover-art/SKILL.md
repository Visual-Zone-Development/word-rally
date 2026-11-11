---
name: cover-art
description: Make or improve the library art for the game in this repo — the 720×500 cover with the title (art/cover.svg or cover.html) and the 1920×450 hero banner (art/hero.svg) — so it reads at thumbnail size, shows what the game is, uses the game's palette and bundled fonts, and keeps clear of the areas the launcher draws over. Use for "make the cover", "the cover looks bad / generic", "new banner", a failing check about placeholder art, or the art step of new-game.
---

# Cover art

Follow AGENTS.md (*Art*) and [art-directions.md](../../../docs/game-design/art-directions.md). Read the game's `DESIGN.md` (*Art direction*: palette, font, hero object, cover and hero ideas). If the repo has `model-asset` or `canvas2d-assets` skills, use them to draw the hero object the same way as in game.

## 1. The rules (the check enforces some)
| | Cover `art/cover.svg` | Hero `art/hero.svg` |
|---|---|---|
| Size | exactly 720×500 (`width`, `height`, `viewBox`) | exactly 1920×450 |
| Shown at | ~216×150 in the library | full-width banner on the game's page |
| Text | **the title, big and bold** | **no text at all** |
| Keep clear | the **bottom 110 px** (badges) | the **bottom-left**: the launcher writes the title there in light text with no shade of its own, so keep it calm **and dark** |
| Focal point | the hero object, large, breaking out of the frame | in the **middle**: x 600–1320, top 250 px (see *Where the hero is cropped*); it may run on to the right |

**Where the hero is cropped.** The same 1920×450 image is shown three ways, so design for all of them:
- **Desktop launcher:** the whole banner (about 1280×300), the title written in light text over the bottom-left.
- **Phone library**, at the top of the list: a box about as wide as the phone and 240 px tall, filled from the middle, so only about **x 600–1320** shows; the top ~250 px are clear and the rest fades into the app's dark background under the title and the Play button.
- **Phone game page:** a 16:9 slice from the middle, **x 560–1360**, full height.

So put the key visual in the middle band (x 600–1320, top 250 px), let it continue to the right for desktop, keep the bottom-left dark and calm, and never rely on the left or right thirds alone. To check, render the hero and look at it cropped those three ways (a scratch HTML page with `object-fit: cover` boxes of those sizes is enough).

Also: a full background (no transparency), 2–4 main colours from the game's palette plus a text colour, fonts only from `Chakra Petch` (600, 700), `Rubik` (400, 700, 900), `Bungee`, `Lilita One`, `Press Start 2P`, no external images or links (`data:` images are fine). Pixel-art games can use `art/cover.html` drawing with the game's own sprite code (set `"cover": "art/cover.html"`). **Phone games use the same two sizes**: the cover and hero are landscape even for a portrait game (the library tile and banner don't turn); compose the portrait game's hero object large in the frame rather than shrinking a tall screenshot into it. The Plays on labels (Phone, Tablet…) are among the badges drawn over the bottom 110 px, so that rule matters even more.

**Best: draw both with the game's own art code.** If the game's drawing lives in one module (`art.js`, or the 3D model code), make `art/cover.html` and `art/hero.html` import it and compose a scene at their sizes, with the cover title as an HTML `<h1>` in a bundled font over a thick `-webkit-text-stroke` copy for the outline. The library art then always matches the game. Worked examples: [Arcade Sampler's `art/`](https://github.com/Visual-Zone-Development/arcade-sampler/tree/main/art) (cabinets drawn by each game's own `icon()`) and [Motion Lab's `art/`](https://github.com/Visual-Zone-Development/motion-lab/tree/main/art). Set `"art": { "cover": "art/cover.html", "hero": "art/hero.html" }`.

## 2. Compose for a thumbnail
1. **Pick one idea:** the hero object doing the core verb (a ship mid-dodge, a frog mid-jump), plus one hint of the challenge (an asteroid, a boss shadow). Not a collage.
2. **Silhouette test:** the main shape must be recognisable as a flat single-colour shape.
3. **Value contrast:** light hero on a dark background or the reverse; the title the highest-contrast thing on the cover.
4. **Title:** 70–130 px tall, one or two lines, a thick outline or drop shadow (an offset copy, not a filter blur) so it reads on any background; placed top or middle, never in the bottom 110 px.
5. **Depth with few layers:** background gradient or shapes → mid-ground hint of the world → hero → title. Diagonals and a slight tilt give energy.
6. **Hero banner:** a wide version of the same scene; key visual on the right third, calm, darker area bottom-left for the launcher's title.

## Optional: painted key art with the user's own key
With `OPENAI_API_KEY`, `GEMINI_API_KEY` or `REPLICATE_API_TOKEN` set, a painted backdrop or key-art scene can be generated (`npm run art`, [generated-art.md](../../../docs/game-design/generated-art.md)) and embedded in `cover.html` / `hero.html` under the game-drawn hero and the title. Keep the title as real text, never generated. It costs the user money: run `--dry`, tell them the cost and only generate with `--approve <$>` once they've agreed to it.

## 3. Render, look, iterate
1. `npm run check`; it renders `cover.png` and `hero.png` under `.github/pushplay/.work/out/<id>/__art/`.
2. **Open both PNGs** and judge them:
   - Shrink test: does the cover still read at ~216×150? `npm run art:shots` renders `cover-thumb.png` at that size. Is the title legible?
   - Does it look like *this* game, in its palette, and not a generic placeholder?
   - Anything important in the bottom 110 px of the cover or the bottom-left of the hero? Is the bottom-left dark enough for a light title?
   - Cropped to the middle (x 600–1320, top 250 px, as the phone library shows it), does the hero still show the game?
3. Fix and re-run until both look good: usually by enlarging the hero, simplifying the background and strengthening contrast.
4. Commit (`<Name>: cover and hero art`) and push. Bump `version` if the game was already released.
