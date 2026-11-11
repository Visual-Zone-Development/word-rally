# <Game Name>: design brief

> One-line pitch: what you do and why it's fun.

*Status: draft / approved / shipped · Version: 1.0.0*

## Kickoff
Answers from the kickoff interview ([kickoff.md](../../docs/game-design/kickoff.md)). Mark anything you decided yourself as *(assumed)*.

| Topic | Answer |
|---|---|
| Concept / genre | |
| 2D or 3D | |
| Art style | |
| Players | <solo / local 2–4 / online 2–N / party with phones> |
| Devices | <Deck and PC (1280×800) / phone portrait 720×1280 / phone landscape 1280×720 / any; which Plays on labels it earns: Handheld & controller, Desktop, Tablet, Phone, Party> |
| Feel | |
| Camera / view | |
| Session and structure | |
| Like which game? | |
| Audience and difficulty | |
| Assets | |
| Sound and music | |
| Progression | |

## Fun targets
- **Primary:** <kind of fun>. <How the game delivers it, in one line.>
- **Secondary:** <kind of fun>. <How.>

See [framework.md](../../docs/game-design/framework.md). Each target must map to a mechanic or feedback below.

## Core loop
- **Moment-to-moment (seconds):** <verb> → <challenge> → <reward> → <growth>
- **Round (minutes):** …
- **Meta (across sessions):** …

## The 8 formal elements
| Element | This game |
|---|---|
| Players | |
| Objectives | |
| Procedures | |
| Rules | |
| Resources | |
| Conflict | |
| Boundaries | |
| Outcome | |

## Controls
Keyboard, mouse and touch equivalents come from `input.js` (see the table in AGENTS.md); list the game's actions by `input` button.

| Input | Action |
|---|---|
| Left stick / d-pad (`x`, `y`) | |
| `a` | |
| `b` | <gameplay action, or "back" in menus only> |
| `x` / `y` | |
| `lb` / `rb` | |
| `lt` / `rt` | |
| Right stick (`aimX`, `aimY`) | |
| `menu` (Start / Esc / on-screen button) | Pause |

- **Inputs** (`pushplay.json` → `inputs`): gamepad, keyboard, mouse, touch. <Which of mouse / touch cover gameplay? If not, what does the title screen say?>
- **Touch scheme** (phone games, [phone.md](../../docs/game-design/phone.md)): <virtual stick + buttons via `touch.js` / tap-to-move / swipe / drag; one-handed or two; what each touch verb is on a controller>
- **Players:** <1 / 2–4 local via `input.pads[i]`, join by press>

## Inspirations
| Game | Borrow | Change / avoid |
|---|---|---|
| | | |

## Art direction
- **Style:** <preset from art-directions.md, or custom>
- **Palette:** `#……` background, `#……` hero, `#……` accent, `#……` danger, `#……` text
- **Font:** <bundled font for art, and in-game>
- **Rendering:** 2D canvas / three.js (`--vite`)
- **Online:** no / yes: host runs the game, `net.js` syncs it ([multiplayer.md](multiplayer.md))
- **Assets:** procedural / user-supplied (`assets/`, credits in `assets/CREDITS.md`) / CC0
- **Cover idea:** …
- **Hero idea:** …

## Audio
- **SFX:** …
- **Music:** …

## Scope
**v1 must-haves**
- …

**Stretch**
- …

## Definition of done
Tailored from [complete-game.md](../../docs/game-design/complete-game.md). Keep the fixed items; add the game's own under *Play* and *Feel*.

**Play**
- [ ] Onboarding by doing (prompts from `input.label`), clear goal, ending or score to beat, difficulty curve, fair failure, retry in one press, progression or variety
- [ ] <game-specific>

**Feel**
- [ ] Feedback for every action; juice on the big moments; rumble where available
- [ ] <game-specific>

**Audio**
- [ ] SFX and music through `audio.js`, following the Settings sliders; unlocks on first input

**Screens and flow**
- [ ] Title (start + pause hints via `input.label`, best score), pause on `menu` with Resume / Restart / Settings / Quit to title, game over with one-press retry
- [ ] Auto-pause via `input.onPause`; no F10 / Start+Select / held-Esc binding; no quit of its own
- [ ] Every menu on `menu.js`, works with controller, keyboard, mouse and touch
- [ ] Settings via `settings.js` from title and pause: master / music / SFX, reduced shake, text size <+ game items>
- [ ] Saves via `save.js` under `<id>-save-v1`, saved on pause and `onPause`
- [ ] Cursor hidden only during gameplay; `state.screen` + `window.__game` exposed

**Accessibility**
- [ ] Colorblind-safe, no mashing, reduced shake honoured, text ≥ 24px scaled by `textScale`, no hard-coded button names

**Scaling and inputs**
- [ ] `fitCanvas` (letterbox colour, DPR ≤ 2, integer for pixel art); right at 1280×800, 1920×1200 / 2560×1600 at DPR 2, 1920×1080, small windows
- [ ] Manifest `tags` + `inputs` correct; verification matrix done (controller, keyboard only, mouse only, touch, DPR 2)
- [ ] Phone games only: manifest `phone.orientation`; HUD and tap targets inside `fit.safe` and out of the thumb zones; text ≥ 32px; on-screen controls hidden with a controller; `visibilitychange` pauses; phone pass green

**Under the hood**
- [ ] `TUNING`, clamped `dt`, `?debug` overlay, runtime files unedited, 60fps, no `tools/` / `mockups/` / `*.py` shipped, `npm run check` green

## Open questions / assumptions
- …

## Changelog
- 1.0.0: First version.
