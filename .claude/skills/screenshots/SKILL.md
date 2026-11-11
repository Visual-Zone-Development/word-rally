---
name: screenshots
description: Make the game in this repo look its best in the PushPlay library screenshot (the build captures the game about 3 seconds after starting it) and capture extra screenshots or short clips of the best moments to share. Use for "the library screenshot is boring / shows nothing", "the screenshot is just the title", "make screenshots", "record a GIF / clip", or before announcing a game.
---

# Screenshots

Follow AGENTS.md. **How the library screenshot is made:** the build opens the game at 1280×800, presses A on the title (up to three times while `state.screen` is still `title`), waits until about 3 s have passed, and saves that frame as `screenshot.png`. The build **replaces** `art.screenshots` in the shipped manifest with that one image, so listing your own files there has no effect. The way to a good library screenshot is a good first 3 seconds of play. **Phone games** are also captured by the phone pass, touch-only at phone size in the game's own orientation (portrait for a portrait game), so the picture shows the game the way a phone player sees it, on-screen controls included; a landscape phone game's 1280×720 frame gets bars in the usual 1280×800 shot. The same first-3-seconds rule applies, by tap: the title's first tap must start play.

## 1. Look at the current one
Run `npm run check` and open `.github/pushplay/.work/out/<id>/__art/screenshot.png`. It should show **real gameplay**: the hero, the world, a threat or goal, and the HUD. Common problems:

| Shows | Fix |
|---|---|
| The title screen | A on the title must start play (or open a menu whose first item, chosen by A, starts it) |
| An empty field, a black or loading screen | spawn the opening scene immediately; draw before assets finish loading |
| A wall of tutorial text | teach by doing (`game-ui`): one short in-world prompt instead |
| A countdown "3, 2, 1" over a blank arena | show the arena and players behind the countdown, or shorten it |
| A character select screen | default to the last pick and start; put selection in a menu item |

## 2. Make the opening look good, honestly
- Start with something happening: the first enemies or obstacles already on screen, the hero mid-motion, a pickup in view. This also makes the game's first seconds better for players.
- Keep the HUD clean and readable at that moment.
- **Never detect the check** (no special case for headless browsers or `__kitCheck`): the screenshot must be what a player really sees.

## 3. Extra shots and clips to share
For screenshots or clips beyond the library one (to send to friends, or for a store page later):
1. Write a scratch capture script (never in the game folder) from the repro script in [debugging.md](../../../docs/game-design/debugging.md): use `?seed=` for a good run, `window.__game.jumpTo(...)` to reach the best moments (a boss, a big combo, a full level), and `page.screenshot()` at 1280×800 (and at DPR 2 for crisp images). For a phone game add a portrait or landscape phone set (`viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true`) with the `touch.js` controls visible, since that's what a phone player sees; store-style shots of phone games are usually portrait.
2. **Clips:** Playwright's `recordVideo` option on the browser context records a `.webm`; trim it with `ffmpeg` if available (`ffmpeg -ss 2 -t 6 -i in.webm -vf "fps=30,scale=640:-1" out.gif`).
3. Save the results where the user can open them (the session's scratch directory, or a `media/` folder in the game listed in its `.pushplayignore` so it isn't shipped). Keep files small.
4. Show the user the best 3–5 shots and say which moment each shows.
