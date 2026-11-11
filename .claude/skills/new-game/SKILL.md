---
name: new-game
description: Create a game in this repo (the repo's one game at its root, or one more in a workshop of many) that plays on a Steam Deck or Legion Go through the PushPlay launcher, on PCs with keyboard, mouse or touch, and, when asked for, on a phone or tablet (--phone). It interviews the user about the idea, writes a design brief, then builds the game and its cover and hero art. Use whenever the user asks to make, prototype or add a game.
---

# New game

Follow AGENTS.md; this is the step-by-step version. Design material lives in `docs/game-design/`: read [framework.md](../../../docs/game-design/framework.md) and [complete-game.md](../../../docs/game-design/complete-game.md) before designing, and the others as needed.

The aim is a **complete, fun game**, not a tech demo: design first, then build in milestones.

**One game, or a workshop.** Look before scaffolding:
- `pushplay.json` at the root: this repo already is one game. Improve it (`improve-game`), or, for a different idea, tell the user to make a new repo from the games template (or a workshop) and start there.
- A `games/` folder: a workshop. The new game goes in `games/<id>/`; paths below are relative to it, and commands take the id (`npm run check <id>`).
- Neither (a fresh copy of the template): ask once, in the first question round, whether this repo is for **this one game** (recommended when they mean to publish it on Discover) or a **workshop** for many (recommended when they'll keep asking for new games, e.g. from a phone; finished ones move out with the `promote-game` skill). For a workshop, add `--workshop` to `new-game`.

## 1. Understand the request
List what the request already settles (genre, theme, 2D/3D, art style, players, feel, view, reference games). Don't ask about those again, but **recap them** at the top of the first question round ("Got it: a 2D frog platformer…") so the user can correct a wrong guess.
- **"Surprise me" / "just make something" / "you decide":** skip the interview. Pick a strong concept yourself (genre + twist + theme, see [genres.md](../../../docs/game-design/genres.md)), decide every *required* topic in [kickoff.md](../../../docs/game-design/kickoff.md) and record each one as an assumption in DESIGN.md, then go to step 3.

## 2. Kickoff interview (required for every new game)
Follow [kickoff.md](../../../docs/game-design/kickoff.md). Use `AskUserQuestion` (otherwise ask in chat). Tailor every option to this idea and put your recommendation first, marked "(Recommended)". Give 2–4 options per question and at most 4 questions per call; the user can always type their own. **Use plain language** and use `preview` to show what a choice means (palette and mood for a style, camera and controls for a view, the loop for a concept).

**Never start building until every required topic has an answer.** The required topics are:

| Round | Topics |
|---|---|
| 1. Shape | **Concept / genre** (for a vague request: pitch 3 concepts instead), **2D or 3D**, **art style**, **players** (solo / local 2–4 / online / party with phones), **where will it be played?** (Deck and PC, the default / phone portrait / phone landscape / TV party; see [phone.md](../../../docs/game-design/phone.md)) |
| 2. Play | **Feel** (multiSelect, up to 2), **camera / view**, **session and structure**, **like which game?**; swap in the online, party, local-multiplayer or phone follow-ups (player count, co-op or versus, phone controller; one thumb or two, stick and buttons or tap and swipe) when round 1 picked them |
| 3. Details | Only what's still open: audience and difficulty, assets (none / "I have files" → ask for the folder / CC0 / generate with the user's image API key if one is set, see [generated-art.md](../../../docs/game-design/generated-art.md)), sound and music, theme and name, progression, mouse/touch gameplay |

Round 1 and round 2 answers often settle each other's topics; skip any question that's already answered. Three rounds maximum. Fill any remaining gaps with sensible defaults and list them as assumptions. If the user can't choose between two or three strong directions, offer the `prototype-sprint` skill: tiny playable versions of each, then grow the winner.

## 3. Research inspiration
Follow [inspiration.md](../../../docs/game-design/inspiration.md): 2–3 reference games (any the user named first). Use a few web searches if available, otherwise the offline canon. Record borrow / change / avoid for each, and state the twist that makes this game its own. Keep it quick.

## 4. Write the brief and get approval
Pick a short, catchy name and a `kebab-case` id. Then:
1. `npm run setup` if `node_modules/` is missing.
2. `npm run new-game <id> --name "<Name>"`, adding `--vite` for 3D or npm packages, `--online --players <min>-<max>` for online multiplayer, `--party [--controller pad|custom] --players <min>-<max>` for a party game on a TV with phones, and `--phone portrait` or `--phone landscape` for a phone game (the starter is then laid out in the 720×1280 or 1280×720 space, with `phone` set in the manifest; a game for the Deck and PC takes no flag and stays at 1280×800). The starter already has title, pause and settings screens that work on every input; keep them and build the game around them. Remove the row of button prompts the starter draws along the bottom of its title, settings and play screens (see *Input hints* in AGENTS.md). The runtime files it copies (`input.js`, `menu.js`, `fit.js`, `audio.js`, `save.js`, `settings.js`, `prompts.js`, `touch.js`, plus `net.js` and `lobby.js` for `--online`, and `net.js`, `party.js`, `party-lobby.js`, `qr.js` and `controller.js` for `--party`) are never edited.
3. Copy [DESIGN.template.md](../../../docs/game-design/DESIGN.template.md) to `DESIGN.md` and fill it in:
   - The **Kickoff** table holds every interview answer (or assumption), including the *Devices* row (the space and the Plays on labels it should earn).
   - Every one of the 8 formal elements is decided.
   - Each fun target maps to concrete mechanics and juice.
   - Scope is split into v1 and stretch (v1 = one sitting; cut to ≤ 3 core systems).
   - The **Definition of done** is tailored from complete-game.md.

Show a compact summary (pitch, feel, loop, view, controls, look, players, v1 scope, assumptions) and ask **Build it / Change something** with `AskUserQuestion`. This is the only gate: after approval, work autonomously to the end.

## 5. Build in milestones
Run `npm run check` after each milestone and fix every ✗.

1. **Core loop.**
   - Put all gameplay numbers in a `TUNING` object at the top of `game.js` (`src/game.js` for `--vite`).
   - Keep the starter's skeleton: `fitCanvas(...)`, `input.attach(canvas, W, H)` with the same size (1280×800, or the phone space), `input.update()` first in the frame, `state.screen` with the names `title | playing | paused | settings | gameover`, `window.__game = { state, TUNING }`, and `input.onPause(...)` switching to `paused`.
   - Add the `?debug` overlay ([debugging.md](../../../docs/game-design/debugging.md)).
   - Map gameplay to buttons from the AGENTS.md table: `b` is a normal action button; `menu` is only pause. Game-specific key aliases via `input.extendKeys`.
   - Get the core verb feeling good: pass the **30-second fun test** in framework.md before adding content. Use `camera` for anything that scrolls or is 3D, `physics-feel` for collisions, bouncing or vehicles, and `enemy-ai` for enemies and CPU opponents.
   - **Local multiplayer:** use the `local-multiplayer` skill (join screen, `input.pads[i]`, shared camera).
   - **Phone game (`--phone`):** read [phone.md](../../../docs/game-design/phone.md) first. Lay out from `W`/`H` and `fit.safe`, HUD at the top and read-only, text ≥ 32 px, controls in the thumb zones; use the `touch-controls` skill for the touch scheme (`touch.js` for a stick and buttons, hidden by itself when a controller is used) and keep every verb playable with a controller and a keyboard. `input.onPause` must pause from every playable screen (the phone's screen lock fires it).
   - **Online:** read [multiplayer.md](../../../docs/game-design/multiplayer.md) first. The host runs the rules in `hostUpdate()` and writes `net.state`; everyone draws `net.view`. Keep the template's title → lobby → playing flow with `state.screen` exposed; `menu` still opens the `menu.js` pause menu (Resume, Settings, Leave game) but it only stops your controls, since the host keeps the world running. Never edit `net.js` or `lobby.js`. Secrets go in `net.privateView(id)`, never `net.state`. Use the `online-netcode` skill to make it feel good despite the delay.
   - **Party:** read [party.md](../../../docs/game-design/party.md) first. The TV runs everything: read `party.inputs[id]` and `party.on('msg')`, write `party.public` for every phone and `party.view(id)` for one phone (never secrets in `public`). Build the phone screen in `controller.html` (one file, everything inline) and look at it on a real phone with `npm run dev`. Never edit the party runtime files. Use the `party-phone-screen` skill for the phone side.
   - If the user supplied assets, import them per [assets.md](../../../docs/game-design/assets.md). For 3D, follow [3d.md](../../../docs/game-design/3d.md).
2. **Complete game.** Use the `level-design` skill for levels, waves and the difficulty ramp, `game-audio` for SFX and music, `game-ui` for the HUD, onboarding and results screens, `boss-design` for a boss or finale, `progression` for the meta loop (unlocks, upgrades, daily seed), and `story-and-dialogue` when Narrative or Fantasy is a fun target. Work through the Definition of done: onboarding by doing, difficulty ramp with something new every 30–60s, retry in one press, best score, progression or variety; title / pause (Resume, Restart, Settings, Quit to title) / game-over / settings screens on `menu.js` and `settings.js`; SFX + music through `audio.js` obeying the sliders; `save.js` under `<id>-save-v1`, saved on pause and in `input.onPause`; reduced shake and text size honoured.
3. **Polish.** Use the `game-feel` skill. Add juice aimed at the fun targets: the biggest effects on the biggest moments, with capped particles, all skipped when `reducedShake` is on.

**Self-review** before moving on to art: run the `playtest` skill to check the difficulty curve and pacing, `accessibility-audit` for the Accessibility items, and `performance-pass` on the heaviest moment, then re-read DESIGN.md and tick off every Definition of done item. Build anything missing, or list it as a known gap.

## 6. Controls, manifest, art
- **Verification matrix.** Run `npm run dev` and do each pass with only that input; every one must pass:

  | Pass | How | Must be true |
  |---|---|---|
  | Controller | pad plugged in, or on the Deck / Legion Go | every screen works; Start pauses; B never quits anything without a menu; any in-place hint shows button names |
  | Keyboard only | no pad, hands off the mouse | Enter starts, Esc pauses, Backspace backs, every action reachable; any in-place hint shows key names |
  | Mouse only | hands off the keyboard | every menu by click; the on-screen pause button pauses; gameplay too if `inputs` includes `"mouse"`; cursor visible in every menu |
  | Touch | Chrome DevTools → device toolbar with touch emulation | every menu by tap; pause button; no button prompts shown; gameplay too if `inputs` includes `"touch"` |
  | Phone (if `--phone`) | device mode at 390×844 or 844×390, DPR 3, touch only | menus by tap; thumbs don't cover the action; nothing under the notch or home bar; on-screen controls vanish with a pad; a hidden page pauses |
  | Scaling | resize the window to 1920×1080, then device mode at DPR 2 | centred and letterboxed in the game's colour, text crisp, nothing clipped or blurry |
  | `npm run check` | | passes: gamepad, keyboard-only, mouse-only, touch, Start → `__game.state.screen === 'paused'`, a 16:9 window at DPR 2, and the phone pass for a phone game |

  Also confirm: menus use `menu.js`; pause menu is Resume / Restart / Settings / Quit to title; Settings is reachable from title and pause; no `F10`, Start+Select or held-Esc binding; no hard-coded button names (`input.label`, `drawPrompts`); nothing needs hover, a double-click, a scroll wheel or text entry; `window.__game.state.screen` is exposed.
- **Manifest:**
  - `description`: what you do and why it's fun, 1–3 sentences.
  - `players`, `version`.
  - `tags` (required): 2–5 lowercase genre/style words, reusing tags other games already use; add `online multiplayer` for online games and `party` for party games.
  - `inputs` (required): the inputs the whole game is playable with; drop `"mouse"` or `"touch"` only when gameplay genuinely can't, and say so on the title screen.
  - `online` if the game is networked (the `--online` scaffold sets it), or `party` for a party game (`--party` sets it), or `phone: { orientation }` for a phone game (`--phone` sets it; it needs `"touch"` in `inputs`).
- **Art** (use the `cover-art` skill):
  - `art/cover.svg`: 720×500, big title, bottom 110px clear.
  - `art/hero.svg`: 1920×450, no text, key visual on the right.
  - Both use DESIGN.md's palette, font and hero object; see art-directions.md.
- **Check and review:** run `npm run check`, then **open the three PNGs it lists** (if the screenshot doesn't show real gameplay, see the `screenshots` skill):
  - Does the cover read at thumbnail size?
  - Is the title legible?
  - Does the screenshot show real gameplay or the title?

  Refine and re-run until all three look good.

## 7. Ship
Update DESIGN.md if the design drifted (set Status to shipped, add a Changelog entry). Use the `release-notes` skill for the player-facing notes. Commit (`Add <Name>`) and push.

Tell the user:
- the name, the pitch and the controls
- what feel the game aims for, and any known gaps
- that it will appear in PushPlay on their Deck or Legion Go once the GitHub Action finishes (a couple of minutes), and which Plays on labels it earns (a phone game: Phone as well)

Then suggest they play it and come back with feedback, or with "improve <name>". Give 2–3 specific things to notice while playing, e.g. "does minute two get boring?" or "is the dash satisfying?".
