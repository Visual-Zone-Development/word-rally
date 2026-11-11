---
name: input-walkthrough
description: Check that a game works with every input on its own (Steam Deck and Legion Go controls, a controller on a PC or TV, keyboard only, mouse only, touch, switching devices, auto-pause, window sizes, and a party game's phone screen), across every menu and screen and the gameplay, or one section you name, and report a screen-by-input matrix with screenshots. Use for "does it work on the Deck", "check every input", "test controller / keyboard / touch", or before calling a game finished. It reports; fixes go through debug-game, game-ui or accessibility-audit.
---

# Input walkthrough

Follow AGENTS.md. This runs the `toolkit:input-walkthrough` skill (from the
toolkit plugin that `.claude/settings.json` enables) with this repo's rules
and extra setups. It's the headless version of the **Verification** matrix in
AGENTS.md: every screen, with each input alone.

## Run it

Invoke `toolkit:input-walkthrough`, passing the game id, the section to check
if the user named one, and any setups they asked for. While following it, use
these PushPlay specifics.

- **Target:** start the game with `npm run dev <id>` (just `npm run dev` in a
  one-game repo) in the background. It serves at `http://localhost:5173/`.
- **Playwright:** use the kit's copy. Prefix every browser command with
  `PW_MODULE=.github/pushplay/node_modules/playwright`. Run `npm run setup`
  first in a fresh checkout.
- **Run `npm run check <id>` first** and record the result. It already covers
  the short gamepad, keyboard, touch, pause and DPR 2 passes.
- **Controls contract:** AGENTS.md's *Controls*, *Menus*, *Leaving your game*,
  *Exit and pause*, *Input hints* and *Screens and scaling* sections, and the
  `inputs` list in the game's `pushplay.json`. In short:
  - `menu` (Start, Esc, P, the on-screen pause button) pauses. Esc never acts as back.
  - `b` (B, Backspace, right-click) goes back in menus.
  - Nothing is bound to F10, Start+Select or a held Esc.
  - The pause menu is Resume, Restart, Settings, Quit to title, and gameplay freezes while it's open.
  - Settings can be reached from the title and from pause.
  - Prompts come from `input.label`: never a literal "A" or "Space".
  - Text is at least 24 px, and the HUD at least 32 px from the edges, at 1280×800. A phone game (manifest `phone`) draws in 720×1280 or 1280×720 instead, with text at least 32 px and the HUD inside `fit.safe`; run the `phone-game` setup for it.
  - The cursor is hidden only during gameplay.
  - Mouse and touch gameplay are required only if `inputs` lists them. Menus always need all four inputs.
- **Screens:** list them from the `state.screen` values in `game.js`. Read the
  current screen with `eval window.__game.state.screen`. `?seed=` and `?debug`
  help reach later states.
- **Extra setups:** this folder's `setups/` directory. Load it as the extra
  roster folder for input setups.

## Things that aren't bugs

- Outside the launcher, `input.mode` starts as keyboard until the first input,
  so the title prompts can name keys before any button is pressed. Inside the
  launcher's gaming mode, it starts as gamepad. Check that the prompts switch
  after the first controller press instead.
- **Quit to library** only appears inside the launcher (`window.pushplay`), so
  it's missing in this walkthrough. Expect it to be absent.

## Afterwards

Don't fix things in this skill. Offer to fix the findings with `debug-game`
(broken input or pause), `game-ui` (prompts, legibility, layout) or
`accessibility-audit` (remapping, holds, text size). For each fixed game, bump
`version` and add a Changelog line as AGENTS.md says. Reports go to
`toolkit-reports/`, which is gitignored.

**If `toolkit:input-walkthrough` isn't available** (the plugin isn't
installed, or the agent isn't Claude Code), say so. Then do the AGENTS.md
**Verification** matrix with the repro script in
`docs/game-design/debugging.md`, one input timeline per setup in `setups/` and
per row of that matrix, and look at the screenshots. To install the plugin:
`claude plugin marketplace add tmorren/claude-plugins`, then
`claude plugin install toolkit@tmorren`.
