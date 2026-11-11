---
name: game-ui
description: Design the HUD, menus, onboarding and results screens of the game in this repo so they read on a 7–8" handheld (and on a phone for phone games: thumb zones, safe areas, portrait layout), work with controller, keyboard, mouse and touch, and match the game's art style — health and score display, input prompts, tutorials taught by doing, game-over tallies, level-select and upgrade screens. Use for "the HUD is cluttered / hard to read", "players don't know what to do", "add a tutorial", "make the menus look better", "add an upgrade / shop / level-select screen", "my thumb covers the score".
---

# Game UI

Follow AGENTS.md (*Menus*, *Screens and scaling*, *Input hints*, *Settings*). Read the game's `DESIGN.md` for the palette, font and fun targets.

## 1. Audit what's on screen
Run `npm run check` and view the screenshot; capture more states (title, gameplay at 60 s, pause, game over) with a repro script ([debugging.md](../../../docs/game-design/debugging.md)). For each screen ask:
- Can I tell in **3 seconds** what to do and how I'm doing?
- Is every piece of text ≥ 24 px (× `settings.data.textScale`) with strong contrast, and every important HUD element ≥ 32 px from the edges? In a phone game (manifest `phone`): text ≥ 32 px and margins measured from `fit.safe`, not the canvas edge.
- Does every prompt come from `input.label()` / `drawPrompts`, never a literal "A" or "Space"?
- Is there a strip of button prompts along the bottom of any screen? Remove it. Is any prompt shown in touch or mouse mode? Remove it. Feedback the player needs mid-action (points won, a refused move) belongs over the thing they are looking at, not in a corner.
- Is anything there that the player doesn't need right now?
- Phone game: with two thumbs on the screen (the shaded zones in [phone.md](../../../docs/game-design/phone.md)), can I still see the hero, the next threat and the score? Is anything pressable in the top half besides the pause button?

## 2. HUD rules
- **One goal on screen.** Show only the resources the player acts on (health, score, timer, ammo). Everything else goes on the pause screen or `select` (Tab) overlay.
- **Corners:** score top-left, secondary info top-right, and **no prompt row along the bottom** (see *Input hints* in AGENTS.md: a control is taught once, next to the thing it acts on, and never on touch or mouse); keep the top-right or top-left corner clear for the ≥ 56×56 on-screen pause button the starter draws.
- **Phone layouts** ([phone.md](../../../docs/game-design/phone.md)): the HUD is a read-only band at the top, inside `fit.safe`; the bottom third (portrait) or the lower two-thirds of each side (landscape) belong to the thumbs and the `touch.js` controls, so no HUD there; a prompt, when one is needed at all, goes beside the thing it explains, never in a strip at the bottom edge or over a menu. Menus that end at the bottom leave room for the launcher's extra "Quit to library" row. Portrait menus start about y = 560 so the items sit in reach; items ≥ 56 px tall, 12 px apart. Hide nothing behind hover.
- **Icons and bars over numbers** where possible (hearts, a health bar); numbers pop (scale 1.2 → 1 over 150 ms) when they change.
- **Diegetic hints:** a glow on the thing to interact with, an arrow to an off-screen objective.
- Colour is never the only signal: pair it with shape or icon (colourblind-safe).
- All sizes scale with `textScale`; test at the largest setting that nothing overlaps.

## 3. Onboarding by doing
- Teach each action the first time it's needed, with an in-world prompt (`` `${input.label('a')} to jump` ``) that disappears once the player has done it (track in `save.data` so returning players don't see it).
- Build prompt strings **every frame** so they switch when the player changes device.
- A safe first room or first wave where the verb can't fail.
- No text walls; one line, readable in 3 seconds.

## 4. Menus and extra screens
- Every menu is `createMenu()` from `menu.js` (title, pause, settings, game over, level select, shop): that gives controller, keyboard, mouse and touch for free. A custom grid (level select, upgrade tree) uses `input.navX` / `input.navY`, A to choose, B to go back, and `input.pointer` taps on each cell, with a visible highlight.
- Pause menu stays exactly **Resume, Restart, Settings, Quit to title**.
- **Game over / results:** score tally that counts up, the best, "new best!" and a near-miss line ("2 away from your best"), retry on one press.
- Style menus in the game's palette and font: a panel shape, a highlight bar, a small easing on selection change. Use `menu.selected` and `menu.items` for custom drawing.
- Show the cursor in every menu; hide it only during gameplay in mouse mode.

## 5. Verify
1. Verification matrix from AGENTS.md for every screen you touched: controller, keyboard only, mouse only, touch (DevTools device mode), 1920×1080 and DPR 2; for a phone game also 390×844 / 844×390 at DPR 3 with touch only (the check's phone pass measures text under 32 px).
2. Text size at maximum: nothing clipped or overlapping.
3. `npm run check`, view the screenshot, fix every ✗.
4. Bump `version`, update DESIGN.md (Changelog, tick *Screens and flow* items), commit (`<Name>: UI …`) and push.
