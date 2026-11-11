# Making games in this repo

This repo is **one game, or a workshop of many**. It starts empty, and the first `npm run new-game` decides which:

- **One game** (`npm run new-game <id>`): the game sits at the repo root (`pushplay.json`, `index.html`, `game.js`, `art/` next to this file). One game per repo is what gives a game its own releases and a listing on PushPlay's **Discover** tab. `new-game` refuses a second game here.
- **Workshop** (`npm run new-game <id> --workshop`, or any repo that already has a `games/` folder): every game is a folder in `games/<id>/`, so one agent session can make and prototype as many as the owner likes. When a game is finished, `npm run promote <id>` moves it into its own one-game repo (see the `promote-game` skill); players keep their saves.

**Paths in this file and in the skills are written for one game at the root.** In a workshop, the game's files are under `games/<id>/` (`games/<id>/pushplay.json`, `games/<id>/DESIGN.md`, `games/<id>/art/`), and commands take the id: `npm run check <id>`, `npm run dev <id>`, `npm run art:shots <id>`, `npm run art -- <id>`, `npm install <pkg> --workspace games/<id>`. Work only on the game you were asked about.

When you push, GitHub Actions builds every game that changed and publishes it, and the **PushPlay** launcher on the owner's handheld (a Steam Deck or a Lenovo Legion Go running SteamOS) or PC picks it up automatically. Whatever you make here gets played **on a handheld, with a controller, on the couch**, and sometimes on a PC with a keyboard, a mouse or a touchscreen. Design for that. A game can also be built for a **phone or tablet** (`--phone`, see *Screens and scaling*); PushPlay labels where each game plays (**Handheld & controller**, **Desktop**, **Tablet**, **Phone**, **Party**) from its manifest and the check's passes.

## Workflow (follow it every time)

0. **Kickoff interview and design brief first.** A complete, fun game beats a quick tech demo. Before writing any code for a new game, ask the user the questions in [`docs/game-design/kickoff.md`](docs/game-design/kickoff.md), a few at a time, with your recommended option first. Every required topic needs an answer: **concept / genre, 2D or 3D, art style, players (solo, local, online or party), how it should *feel*, camera / view, session length and structure, and games it should feel like**; then whatever is still open (audience and difficulty, assets, sound, theme, progression). Don't re-ask what the request already says. Only when the user says "surprise me" or "you decide" do you choose these yourself, recording each as an assumption. Once step 1 has created the game, write `DESIGN.md` from [`docs/game-design/DESIGN.template.md`](docs/game-design/DESIGN.template.md). The design guides in [`docs/game-design/`](docs/game-design/) cover the 8 formal elements and 8 kinds of fun ([framework](docs/game-design/framework.md)), genre loops, art styles, researching inspiration, [phone and tablet play](docs/game-design/phone.md), and the [definition of done](docs/game-design/complete-game.md) every game should meet.
1. **New game:** `npm run new-game <game-id>` (add `--vite` if you need npm packages like three.js, `--online --players 2-4` for online multiplayer, `--party` for a party game played on a TV with phones, `--phone portrait|landscape` for a game laid out for a phone). The id is lowercase-with-dashes and is the game's permanent id (save keys and its PushPlay listing use it). In an empty repo, ask the user once whether this repo is for **this one game** (recommended when they mean to publish it) or a **workshop** for many (add `--workshop`; recommended when they'll keep asking for new games, e.g. from a phone). This creates a working starter (at the root, or in `games/<id>/`) with title, pause and settings screens that already work on controller, keyboard, mouse and touch: `game.js`, the runtime files (`input.js`, `menu.js`, `fit.js`, `audio.js`, `save.js`, `settings.js`, `prompts.js`, `touch.js`, plus `net.js` and `lobby.js` in an `--online` game, or `net.js`, `party.js`, `party-lobby.js`, `qr.js` and `controller.js` in a `--party` game), `pushplay.json` and placeholder art.
2. **Build the game.** Only touch `.github/`, `AGENTS.md`, `CLAUDE.md`, `.claude/` or `docs/` if the user asked you to. If the repo is already one game (a `pushplay.json` at the root), that's the one to work on: `new-game` refuses a second, and a new idea belongs in a new repo from the template (or in a workshop). In a workshop, only touch other games if asked. Never edit the runtime files (see *Runtime files*).
3. **Fill in `pushplay.json`:** a real `description`, `players`, `tags`, `inputs`, and anything else that applies (see *Manifest*).
4. **Make the art:** replace `art/cover.svg` and `art/hero.svg` (see *Art*). This is required; the check fails on placeholder art.
5. **Run `npm run check` and fix everything it reports.** It builds the game, plays it headlessly at 1280×800 with a virtual gamepad, then keyboard-only (Enter, then Esc must pause), then mouse-only (menus by click, the on-screen pause button), then touch (taps the title menu), presses Start and expects `window.__game.state.screen === 'paused'`, renders it again in a 16:9 window at 2× pixels (1280×720 at DPR 2), and renders the art to PNG. A game with `phone` in its manifest also gets the **phone pass**: touch only at 390×844 (portrait) or 844×390 (landscape) at DPR 3, menus by tap, the pause button, `visibilitychange` must pause, and no text under 32 px in the phone space. It fails on crashes, network requests, dialogs, blank screens, placeholder art, missing `tags` or `inputs`, an F10 binding and a pause that doesn't happen; it warns on console errors, save keys that don't start with the game id, and when `menu.js` isn't imported or `input.attach` isn't called. The touch pass taps the title menu through `window.__game.titleMenu` (the starter exposes it), so keep that getter if you move the title menu.
6. **Look at the output images** it prints (`.github/pushplay/.work/out/<id>/__art/cover.png`, `hero.png`, `screenshot.png`). If you can view images, check that the art reads well at small size and that the screenshot shows the game, not an error or empty screen. Iterate until they look good.
7. **Verify by hand** against the matrix in *Verification* below (controller, keyboard only, mouse only, touch, resize, and a phone-sized window for a phone game). If your agent has the `input-walkthrough` skill (Claude Code with the toolkit plugin this repo enables), run it first: it plays every screen and the gameplay headlessly with each input alone and reports what's broken where. It doesn't replace trying the game on a real device.
8. **Commit and push.** Pushing the default branch publishes the build; other branches only run the check.
9. **Finished workshop game?** When the user says it's ready for Discover or its own repo, promote it (the `promote-game` skill).

**Changing a game:** read its `DESIGN.md` first and keep changes consistent with it. Bump `version`, add a line to its Changelog, and run the check. For bugs, see [`docs/game-design/debugging.md`](docs/game-design/debugging.md).

First time in a fresh checkout: `npm run setup` (installs dependencies and the headless browser).

If your environment can't install the browser (some cloud sandboxes block the download), still do every other step. Then push: GitHub Actions runs the same check, and the run's summary page lists any problems to fix.

## Game rules

### Runtime files (don't edit)

`input.js`, `menu.js`, `fit.js`, `audio.js`, `save.js`, `settings.js`, `prompts.js` and `touch.js` (plus `net.js` and `lobby.js` in an online game, and `party.js`, `party-lobby.js`, `qr.js`, `controller.js` and `net.js` in a party game) start with the header `pushplay runtime vN — replaced by npm run update-kit; don't edit`. They are shared code: `npm run update-kit` overwrites them, so any edit is lost. Import them; never change them. Game-specific key aliases go through `input.extendKeys({ KeyR: 'y' })` in `game.js`.

### Controls: every input, alone

Games are played on a Steam Deck or Legion Go with their built-in controls, on Linux, Windows and Mac PCs with a controller, a keyboard, a mouse or a touchscreen, and on phones and tablets with touch or a Bluetooth controller. **Every menu and screen must work with each of those alone.** Gameplay must work with a controller and with a keyboard; mouse and touch gameplay are expected too, unless the genre genuinely can't (then omit them from the manifest's `inputs` and say so on the title screen).

`input.js`: call `input.update()` once at the top of every frame, and `input.attach(canvas, 1280, 800)` once at startup (it maps mouse and touch into game space; the check warns if it's missing).

| `input` button | Controller | Keyboard | Mouse / touch | Use it for |
|---|---|---|---|---|
| `a` | A | Space, Enter | click, tap | confirm, jump, main action |
| `b` | B | Backspace | right-click | back in menus; **free for gameplay** (dash, cancel, secondary) |
| `x` | X | Shift | | secondary action |
| `y` | Y | F | | secondary action |
| `lb` / `rb` | LB / RB | Q / E | | cycle, tabs, rotate |
| `lt` / `rt` | LT / RT | Z / C | | hold actions, triggers |
| `select` | Select / View | Tab | | map, scoreboard, extra info |
| `up` `down` `left` `right` | d-pad | arrows, WASD | | discrete steps |
| `menu` (virtual) | Start | Esc, P | on-screen pause button → `input.requestMenu()` | **pause and menu only** |

- `input.x`, `input.y` (−1..1): left stick + d-pad + WASD/arrows. `input.aimX`, `input.aimY`: right stick. `input.navX`, `input.navY`: stepped with key repeat, for menus and grids. `input.pointer` (mouse or primary touch, in 1280×800 game space) and `input.pointers` for multitouch.
- `input.held(b)`, `input.pressed(b)`, `input.released(b)`. Use `pressed()` for one-shot actions.
- **Pause is `menu`, back is `b`. They are different buttons.** Esc always pauses and never acts as B; B/Backspace never pauses. So B is a normal gameplay button and a stray Esc can't cancel a run.
- **Never bind F10, Start+Select, or a held Esc.** The launcher uses them to quit the game (see *Exit and pause*). Nothing in the game may depend on a chord of two buttons.
- Nothing may need hover, a double-click, a scroll wheel, a modifier chord or typed text: a controller has none of them. (A party game's phone screen, `controller.html`, may use text fields: it runs on a phone.) Pointer-driven ideas (aiming, dragging, placing) also need a stick-driven cursor or snapping between targets.
- **Local multiplayer** uses `input.pads[i]` (`{ index, connected, x, y, aimX, aimY, held(), pressed() }`), one per controller; player 1 may also use the keyboard. Join screen: `${input.label('a')} to join`, one slot per pad that pressed. The merged `input.*` view is for menus only in a multiplayer game. Tag it `"local multiplayer"` and set `players` to e.g. `"2-4"`. Several controllers on one tablet work the same way.
- **On-screen controls** (`touch.js`): when touch-only gameplay needs a stick or buttons, `const touch = createTouchControls(input, { stick: true, buttons: ['a', 'b'], labels: { a: 'Jump' } })`; call `touch.update()` right after `input.update()` and `touch.draw(ctx)` last during play. It writes `input.x / y` and `held / pressed / released` for up to four round ≥ 64 px buttons in the thumb zones, and draws nothing unless `input.mode === 'touch'`, so a controller on a tablet hides it. Don't read `input.pointer` for movement as well. See the `touch-controls` skill and [`docs/game-design/phone.md`](docs/game-design/phone.md).

### Menus (`menu.js`)

- `createMenu(items, opts)`; items are `{ id, label, disabled? }` or value items `{ id, label, type: 'toggle' | 'range' | 'choice', value, min, max, step, options, onChange }`.
- Each frame: `const action = menu.update(input, dt)` returns the chosen item id, `'back'` (B or `menu`) or `null`; then `menu.draw(ctx)`. Read values with `menu.value(id)`; `menu.select(id)`, `menu.selected`, `menu.items` for custom drawing.
- It moves with d-pad, stick, arrows and WASD; chooses with A, Space, Enter, click or tap; goes back with B, Backspace, Esc/Start or right-click; highlights on hover; left/right, LB/RB, the arrow buttons and taps change values.
- Use it for **every** menu: title, pause, settings, game over, level select. A custom menu must do all of the above, including touch.
- Inside the launcher, a menu with a `resume` item (the pause menu) gets **Quit to library** added at the end by itself (see *Leaving your game*). Don't add your own.

### Leaving your game

Players must always be able to get back to their library, including people who never read a hint. There are two ways out, and a kit game has both without writing any code:

- **The game's own pause menu.** Inside the launcher, `menu.js` ends the pause menu (any menu with a `resume` item) with **Quit to library**. Choosing it asks the launcher to close the game, so `game.js` never sees it, and it isn't there outside the launcher (in a browser, `npm run dev` or the check). Keep the item ids `resume` for the pause menu and you get it. A pause menu without `resume` can ask for it with `createMenu(items, { quitToLibrary: true })`; a game that really can't be left mid-way (rare) can opt out with `{ quitToLibrary: false }`.
- **The launcher's menu.** Holding Start+Select, F10, holding Esc for 1 s, or the ≡ button the launcher draws for mouse and touch open the launcher's own menu (Resume, Restart game, Quit game) over any game. It pauses the game first (`input.onPause`). The launcher shows how at launch and again whenever the player presses the game's pause.

So:
- **Don't build an "exit to launcher" of your own** and never bind F10, Start+Select or a held Esc.
- **"Quit to title" stays inside the game** (to the title screen). Name in-game exits by where they lead ("Back to the arcade", "Quit to title"); the library exit is the kit's.
- **A pause menu not built with `menu.js`** (a custom menu, a game ported from another engine) adds the same item itself, shown only inside the launcher: `if (window.pushplay?.quit) items.push({ id: 'library', label: 'Quit to library' })`, and on choosing it calls `window.pushplay.quit()`. Always use `?.`: outside the launcher `window.pushplay` is undefined.

### Exit and pause

- **The launcher owns quitting**: see *Leaving your game*. The game's own Quit to library and the launcher's menu are the only ways out.
- **Launcher contract:** `window.pushplay?.{ version, gamingMode, inputMode, quit(), restart(), onPause(cb), onResume(cb) }` plus window events `pushplay:pause` / `pushplay:resume`. `input.js` already wires these: use `input.onPause(cb)` and `input.paused`.
- **Auto-pause:** `input.onPause(cb)` fires when the launcher overlay opens, the window loses focus or is hidden (`visibilitychange`: a phone's screen lock, a call, switching apps), or all controllers disconnect. The callback must switch to the pause screen and save (see *Saves*); `audio.js` mutes on its own. Never auto-resume: the player presses Resume.
- **Pause menu = Resume, Restart, Settings, Quit to title**, in that order, built with `menu.js` (inside the launcher it then shows Quit to library last, on its own). `menu` (Start / Esc / P / on-screen button) opens it from gameplay and `'back'` resumes. Quit to title goes to the title screen, not out of the game. The game is fully frozen while paused (no timers, physics or spawns advance).
- **On-screen pause button:** a ≥ 56×56 px button in a corner during gameplay that calls `input.requestMenu()`; it's how mouse and touch players pause. The starter has one; keep it.
- Never use `alert()`, `confirm()`, `prompt()`, `window.open()` or new tabs; they block every input. Draw confirmations in-game.

### Screens and scaling

- **Logical space is 1280×800** (the Steam Deck's screen). Lay out every screen in it, text ≥ **24px** and important HUD ≥ **32px** from the edges. Everything else is handled by `fit.js`.
- Call `fitCanvas(canvas, { w: 1280, h: 800, maxDpr: 2, integer: false, letterbox: '#000' })` once; it resizes on every window change, letterboxes, caps the device pixel ratio at `maxDpr` and keeps drawing coordinates at 1280×800. Don't write your own resize code.
- Targets it must look right on: Steam Deck **1280×800** at DPR 1; Legion Go **1920×1200** and **2560×1600** (the launcher zooms the window, so DPR reaches 1.5–2 in the same 1280×800 space); desktop **16:9** windows such as 1920×1080 (bars left and right); any resizable window, including smaller than 1280×800; tablets in landscape.
- **Phone games** use one of two more spaces, **portrait 720×1280** or **landscape 1280×720** (`npm run new-game <id> --phone portrait|landscape` sets it up; `"phone": { "orientation": "portrait" | "landscape" | "any" }` in the manifest says which, `"any"` meaning the game lays out for both and swaps on `fit.onResize`). Pass the same size to `fitCanvas` and `input.attach`. Add `fill: true` so the game covers the whole screen of every phone (no bars): the size becomes the minimum, `fit.w` / `fit.h` follow the screen, and difficulty stays inside `fit.minW` × `fit.minH` (see *Fill the screen* in phone.md). **1280×800 stays the default**: nothing changes for a game that isn't built for phones, and a phone game still has to play with a controller and a keyboard. Text ≥ **32px** in a phone space, tap targets ≥ 56px (on-screen buttons ≥ 64px), controls in the thumb zones (bottom third in portrait, the lower two-thirds of each side in landscape) and nothing pressable in the top half but the pause button. See [`docs/game-design/phone.md`](docs/game-design/phone.md) and the `mobile-port` skill.
- **Safe areas:** phones draw under the notch and the home indicator. `fit.safe` → `{ top, right, bottom, left }` in game units (zero on the Deck and PCs, changes when the phone turns): place text and tap targets from it (`fit.safe.left + 32`), never under it; backgrounds may extend beneath. Read it every frame or in `fit.onResize`.
- `letterbox`: use the game's background colour so bars disappear, or black. Never white, never transparent.
- `maxDpr: 2` is the cap; don't read `devicePixelRatio` in 2D code. Text, lines and vector shapes stay crisp at DPR 2 automatically. Pre-rendered bitmaps (glow sprites, cached text) made at 1× look soft at DPR 2: render them at 2× or keep them small.
- Pixel art: `integer: true` plus `ctx.imageSmoothingEnabled = false`, and draw sprites at whole-number scales.
- 3D: render to a fixed 1280×800 surface (or the phone space) with `renderer.setPixelRatio(Math.min(devicePixelRatio, 1))` and let `fitCanvas` scale it; see [`docs/game-design/3d.md`](docs/game-design/3d.md).
- Cursor: hide it (`canvas.style.cursor = 'none'`) **only during gameplay** in mouse mode, and show it again on every menu (title, pause, settings, game over). Never hide it in a menu.

### Settings (`settings.js`)

Every game has a Settings screen, **reachable from the title and from the pause menu**, built with `createSettingsScreen({ settings, audio, extra })` → `{ update, draw }` (same calling pattern as a menu: `update(input, dt)` returns `'back'` when the player leaves). It provides:
- **Master, Music and SFX** volume (0–100).
- **Reduced shake / flash** toggle: when on, skip screen shake, white flashes and strobing. Every game that shakes or flashes must honour `settings.data.reducedShake`.
- **Text size** (`settings.data.textScale`, 1 = normal): multiply HUD and menu font sizes by it.
- `extra`: game-specific items such as difficulty, colourblind palette or rumble, as `menu.js` value items.

`const settings = createSettings(id, defaults)` stores them under `<id>-settings-v1` with defaults `{ master, music, sfx, reducedShake, textScale }`. Pass the same object to `createAudio({ settings })` so the buses follow the sliders.

### Input hints

- Prompts come from the runtime, never from hard-coded names: `input.label('a')` → "A" on a controller, "Space" on a keyboard, "Tap" on touch (and a click label with a mouse); `input.label('menu')` → "START" / "Esc" / the pause button; `input.stickLabel()` and `input.dpadLabel()` name the movement input for the current mode.
- Legends, where one is really needed: `drawPrompts(ctx, input, [['a', 'Jump'], ['x', 'Dash']], opts)` draws icons for the current mode. Place it beside what it explains, never as a row along the bottom edge.
- **No prompt row along the bottom of the screen.** Don't park a strip of button prompts (`drawPrompts(...)` at `y: H - 40`) under menus, the title, results or play: it sits in the thumb zone, collides with menus (inside the launcher the title and pause menus gain a "Quit to library" row), and says nothing a menu doesn't already show. Teach a control once, in place, next to the thing it acts on (beside the board, on the button, over the object), and stop showing it once it has been used. On touch and mouse show no prompts at all: taps and clicks land on things that already look pressable. The starter draws a bottom prompt row on its title, settings and play screens; remove it when you build the game.
- `input.mode` is `'gamepad' | 'keyboard' | 'mouse' | 'touch'`, follows the last device used, and starts as `'gamepad'` inside the launcher's gaming mode (`input.gamingMode`, `input.usingGamepad`). Build prompt strings every frame, not once at load, so they switch when the player changes device.
- Title screen: the menu is the way in, so it needs no "press to start" line and no pause hint (the on-screen pause button and the launcher teach pausing). If you do write a start line, build it from `input.label('a')` (on touch it reads "Tap", so phrase it as `${input.label('a')} to start`). Leave room under the title menu for the launcher's extra "Quit to library" row. If gameplay doesn't support mouse or touch, say so there ("Needs a controller or keyboard").
- Never write "Press A", "Space", "LB/RB", "Click" or "Tap" as literal text in the game.

### Saves (`save.js`)

- `const save = createSave(id, 1, defaults, migrate?)` → `{ data, load, save, reset }`, stored under `<id>-save-v1`. Keep best scores, unlocks and progress in `save.data` and call `save.save()` after every change that matters, **on pause and in `input.onPause`**. Bump the version and pass `migrate(old)` when the shape changes.
- All `localStorage` keys must start with the game id (the check fails otherwise). Only `save.js` and `createSettings` should touch `localStorage`.

### Audio (`audio.js`)

- `const audio = createAudio({ settings })`: buses `master`, `music`, `sfx`; `audio.tone()`, `audio.noise()` for generated SFX, `audio.load()` + `audio.play()` for bundled files, `audio.setVolume()`.
- Browsers only start audio after a user gesture. `audio.js` unlocks itself on the first key, click, tap or gamepad press and mutes on pause; the launcher allows autoplay, a normal browser doesn't, so never assume sound is running before the first input and don't rely on music playing on the title screen before a press. Draw the first frame immediately; never wait for a click or for audio before drawing.
- Every action has a sound; a music loop fits the mood; both obey the Settings sliders.

### Flow

- Screens: `title` → `playing` ↔ `paused` → `gameover`, plus `settings` (and `lobby` between `title` and `playing` in an online or party game). Keep the current one in `state.screen` with exactly those names, and expose `window.__game = { state, TUNING }` (the check presses Start and expects `'paused'`).
- The title screen is the first thing drawn, and its menu is how the game starts. Game over shows score, best and retries in one press.
- Restart (from pause or game over) resets everything the run touched: timers, particles, audio loops, RNG seed if seeded.

### Offline and self-contained

- No CDNs, remote fonts, analytics or network calls. Bundle everything inside this repo (or install it with npm in a `--vite` game). The check fails on internet requests and on WebSockets.
- Exception: online multiplayer, with `"online": true` in the manifest. Scaffold it with `--online`: it plays through the shared relay with no setup, and only the relay connection is allowed. Follow [`docs/game-design/multiplayer.md`](docs/game-design/multiplayer.md) and don't edit the provided `net.js` or `lobby.js` (see *Online multiplayer*).
- Same for party games (`"party": true`, scaffolded with `--party`): phones join through the same relay (see *Party games*).
- Saves persist per game on the handheld via `localStorage` (see *Saves*).

### Online multiplayer (`net.js`, `lobby.js`)

- `npm run new-game <id> --online --players <min>-<max>` adds `net.js` (connection, rooms, synced state) and `lobby.js` (Quick match / Host / Join, no text entry). Both are runtime files: import them, never edit them. Details and the full API: [`docs/game-design/multiplayer.md`](docs/game-design/multiplayer.md).
- **The host runs the game.** Every copy calls `net.setInput({...})` each frame and draws `net.view`; only the host runs the rules in `hostUpdate(dt)`, reading `net.inputs[id]` and writing `net.state`. `net.js` sends only what changed. Put only what players must see in `net.state`; particles and shake come from `net.event`.
- **Flow:** `title` → `lobby` (`lobby.update()` returns `'start'` or `'back'`) → `playing` ↔ `paused`. Keep it, and keep `state.screen` and `window.__game`: the check plays two copies together through a local relay and still presses `menu` expecting `'paused'`.
- **Pause can't freeze a shared world.** `menu` (Start / Esc / P / on-screen button) still opens a `menu.js` pause menu (Resume, Settings, Leave game), but it only stops your own controls (`net.setInput({})`) while the host keeps running. `'back'` resumes; Leave game calls `net.leave()` and returns to the lobby. Everything in *Exit and pause* still applies: the launcher owns quitting.
- Show who's who ("You", colours by `net.slot(id)`). Tag it `"online multiplayer"`, set `players` to e.g. `"2-4"` and `"online": true` (the scaffold does). Bump `version` when the netcode changes: only builds with the same version play together.
- **Dropped connections:** phones suspend the socket when the app is hidden; `net.js` reconnects to the same room and seat and resumes in place. `net.status` gains `'reconnecting'` next to its usual values, and `net.connection` is `'connected' | 'reconnecting' | 'offline'`: show "Reconnecting…" over play and on the pause screen while `net.status === 'reconnecting'`, and "Connection lost" with a way back to the lobby when `net.connection === 'offline'`. `net.away` lists players who dropped and `away` / `back` / `reconnected` events fire.
- **Secrets (a hand of cards, a hidden role):** `net.state` reaches every player, so never put them there. The host writes `net.privateView(id).hand = [...]`; only that player gets it, as `net.mine.hand`.

### Party games (TV + phones: `party.js`, `party-lobby.js`, `controller.html`)

A party game runs on the handheld or PC plugged into a TV. Players join from their phones (scan the QR code, or type the room code at the address on screen) or from any browser, and controllers plugged into the machine can join too. Think Jackbox: a quiz, drawing or bluffing game, a card game with hidden hands, or an action game with phones as gamepads. Full guide: [`docs/game-design/party.md`](docs/game-design/party.md).

- `npm run new-game <id> --party [--controller pad|custom|motion] [--players 3-8]` (up to 16 players). `pad` (default) gives every phone a stick and A/B; `custom` starts a phone screen of the game's own; `motion` makes the phone a motion controller and adds `motion.js` to read it on the TV (tilt, steering wheel, swings timed on the phone; see [`docs/game-design/motion.md`](docs/game-design/motion.md): phones can't point at the screen). The runtime files (`party.js`, `party-lobby.js`, `qr.js`, `controller.js`, `net.js`) are never edited; `controller.html` and `game.js` are yours.
- **The TV runs everything.** Each frame, after `input.update(dt)`, call `party.update()`; then read `party.players` (`{ id, name, color, kind: 'phone' | 'local', connected }`), `party.inputs[id]` (`{ x, y, a, b }`, the same from a phone pad and a local controller) and `party.pressed(id, 'a')`.
- **Who sees what.** `party.public` goes to every phone (prompt, choices, whose turn); `party.view(id)` goes only to that player's phone (their hand, secret role, private score); everything else stays on the TV. **Secrets never go in `party.public`.** Both are sent as changes only: write them freely.
- **Phone → TV:** the phone screen calls `controller.send(data)` (→ `party.on('msg', ({ from, data }) => …)`) for choices and text, `controller.input({...})` for held controls.
- **`controller.html` is one file** with its HTML, CSS and JS inline (images as `data:` URLs): the TV sends it to each phone, where it runs with no network. It reads `controller.public`, `controller.mine`, `controller.players`, `controller.me` and re-renders on `controller.on('update', fn)`. Design it for a phone held in one hand: big tap targets, portrait for custom screens. The kit's lobby screen covers the phones until the game starts.
- **Flow:** `title` → `lobby` (`lobby.update()` returns `'start'` or `'back'`; the first phone or A on the TV starts) → `playing` ↔ `paused`. Unlike online games, **pause freezes the world**: the TV runs it. Set `party.public.paused` so phones can show it, and draw `drawJoinBadge()` during play so latecomers can join (or `party.lock()` to stop them).
- Phones that drop (screen lock, Wi-Fi) keep their seat for two minutes and come back with everything; their `party.inputs` go empty meanwhile, so nothing runs away. Show away players dimmed (`connected: false`).
- Latency is about 50–150 ms from phone to TV: great for party, quiz, card and brawler games, not for precise aiming. Tag it `"party"` (the scaffold sets `"party": true` and the tags).

### Performance

The Deck and the Legion Go have mid-range integrated GPUs. Aim for a steady 60fps at 1280×800 and no drops at DPR 2. Prefer canvas 2D or modest WebGL scenes, cap particle counts, avoid `shadowBlur` and huge textures.

### Tech

- Default: plain HTML + ES modules (`<script type="module">`) and canvas.
- Use `--vite` when you need npm packages (three.js, Phaser, physics engines). Install with `npm install <pkg>` and commit `package-lock.json`.
- Keep the game self-contained in this repo. The build ships the game's files and skips the rest: `tools/`, `mockups/`, `*.py`, `__pycache__/`, `DESIGN.md`, and the repo's `AGENTS.md`, `CLAUDE.md` and `docs/`. List anything else to skip (reference images, notes) in `.pushplayignore` at the root.
- For 3D games (three.js), follow the budgets in [`docs/game-design/3d.md`](docs/game-design/3d.md).
- Put all gameplay numbers in a `TUNING` object at the top of `game.js`, so tuning later is quick. Clamp `dt` (`Math.min(1/20, …)`).

### Verification

Do all of these before pushing; `npm run check` covers them headlessly, you cover them for real:

| Pass | How | Must be true |
|---|---|---|
| Controller | pad plugged into `npm run dev`, or on the Deck / Legion Go | every screen; Start pauses; B never quits anything without a menu |
| Keyboard only | hands off the mouse, no pad | Enter starts, Esc pauses, Backspace backs, every action reachable, prompts show key names |
| Mouse only | hands off the keyboard | every menu by click; pause button works; gameplay if `inputs` includes `"mouse"` (the check's mouse-only pass backs the Desktop label) |
| Touch | DevTools device mode (touch emulation) | every menu by tap; pause button; prompts say "Tap"; gameplay if `inputs` includes `"touch"` |
| Phone (games with `phone`) | DevTools device mode at 390×844 or 844×390, DPR 3, touch only | menus by tap; on-screen controls where needed and hidden with a controller; text ≥ 32px; nothing under the notch or home bar; `visibilitychange` pauses and saves |
| Scaling | resize the window to 1920×1080, then DevTools device mode at DPR 2 | centred, letterboxed in the right colour, crisp text, no blur or clipping |
| `npm run check` | | passes (gamepad, keyboard-only, mouse-only, touch, Start → `paused`, DPR 2, and the phone pass for phone games), screenshot shows real content, `window.__game.state.screen` exposed |
| Every screen, every input | the `input-walkthrough` skill, if your agent has it | every screen works with each input alone, or the report explains why not |

## Assets

Games can be fully procedural, or use the user's own sprites, audio, models and fonts. Copy them into `assets/` (never link to the internet), record where each came from and its license in `assets/CREDITS.md`, and keep files small (sprite sheets ≤ 2048px, music ≤ ~3 MB, < 30 MB total). Details: [`docs/game-design/assets.md`](docs/game-design/assets.md). Painted sprites and textures can also be generated with the user's own image API key (`npm run art`, see [`docs/game-design/generated-art.md`](docs/game-design/generated-art.md)); the images are bundled, never fetched at runtime.

**Never spend the user's money without their agreement.** Before anything that charges them (image generation or any other paid API), tell them what it costs and wait for a yes in the conversation. For `npm run art`: run `--dry`, give them the number of images and the estimate, and only after they agree run it with `--approve <that amount>`. Each new batch, redo or `--force` is a new charge and needs a new yes.

## Manifest (`pushplay.json`)

```json
{
  "$schema": "./.github/pushplay/manifest.schema.json",
  "id": "star-courier",
  "name": "Star Courier",
  "description": "Pilot a tiny courier ship through an asteroid field, grabbing parcels before the clock runs out.",
  "version": "1.0.0",
  "entry": { "web": "index.html" },
  "art": { "cover": "art/cover.svg", "hero": "art/hero.svg" },
  "controls": "gamepad",
  "inputs": ["gamepad", "keyboard", "mouse", "touch"],
  "players": "1",
  "tags": ["arcade", "space", "score attack"],
  "online": false,
  "phone": { "orientation": "landscape" }
}
```

- `id`: set by `new-game` (in a workshop it's also the folder name); never change it (players' saves and the PushPlay listing follow it).
- `description`: 1–3 sentences in plain language: what you do and what makes it fun. It's shown in the library.
- `players`: like `"1"` or `"1-4"`.
- `tags` (**required**; the check fails without it): 2–5 lowercase words players can filter the library by: genre first (`"racing"`, `"puzzle"`, `"platformer"`, `"shooter"`), then setting or style (`"space"`, `"pixel art"`, `"cozy"`), and `"local multiplayer"` if it supports more than one player. Letters, digits, spaces, `-`, `&` and `'`, up to 24 characters each, at most 8.
- `inputs` (**required**): which inputs the whole game, gameplay included, is playable with: any of `"gamepad"`, `"keyboard"`, `"mouse"`, `"touch"`. Menus must always support all four regardless; only drop `"mouse"` or `"touch"` when gameplay genuinely can't work with them, and say so on the title screen. `"gamepad"` and `"keyboard"` are always present.
- `phone` (only for games laid out for a phone): `{ "orientation": "portrait" | "landscape" | "any" }`, matching the space passed to `fitCanvas` (720×1280, 1280×720, or both). With `"touch"` in `inputs` and a green phone pass it earns the **Phone** label; leave it out for a 1280×800 game. `--phone` sets it.
- **Plays on** labels are derived, never typed in: Handheld & controller (every game), Desktop (`keyboard` + `mouse`, the keyboard and mouse-only passes), Tablet (landscape with `touch`; "Needs a controller" without), Phone (`phone` + `touch` + the phone pass), Party (`party`).
- `version`: bump it when you make a notable change.
- Vite games also have `"build": { "preset": "vite", "output": "dist" }` (the scaffold adds it).

## Art

Every game needs two images, written as **SVG** (or `.html` for art drawn with canvas). The check renders them to PNG. Both are required and must look good: they're the first thing anyone sees in the library.

| File | Size | Where it shows | Rules |
|---|---|---|---|
| `art/cover.svg` | 720×500 | Library tile (shown at ~216×150) | **Must include the game's title**, big and bold. Keep the **bottom 110px clear of important content** (the launcher draws badges there). |
| `art/hero.svg` | 1920×450 | Banner on the game's detail page, and cropped at the top of the phone app's library | **No title text**: the launcher writes the title in light text over the **bottom-left**, so keep that area calm and dark. Put the key visual in the **middle** (x 600–1320, top 250 px): the phone shows only that part (see the `cover-art` skill). |

Guidelines:
- Set `width`, `height` and `viewBox` on the root `<svg>` to the exact size.
- Show what the game *is*: its hero character, ship or key object, in the game's own palette. Composition and contrast beat detail. It must read at thumbnail size.
- Fill the frame with a background (no transparency). Use bold shapes, 2–4 main colors, and a clear focal point.
- **Fonts for art text:** use one of these (bundled, so they look identical everywhere): `Chakra Petch` (600, 700), `Rubik` (400, 700, 900), `Bungee`, `Lilita One`, `Press Start 2P`. Other fonts won't be available when the art is rendered.
- No external images or links inside the SVG. Embedded `<image href="data:...">` is fine.
- For a pixel-art or canvas look, an `art/cover.html` page that draws with the game's own code also works. Set `"cover": "art/cover.html"`. The page is rendered at exactly 720×500, after `load`.

The best covers are drawn by the game's own art code: `art/cover.html` and `art/hero.html` import the module the game draws with, so the library art always matches the game (see the `cover-art` skill and [Arcade Sampler's `art/`](https://github.com/Visual-Zone-Development/arcade-sampler/tree/main/art)). `npm run art:shots` renders them, any `art/gallery.html` contact sheet and a tile-size thumbnail to look at.

If you're truly unable to make art, remove the `art` field: the check will generate a basic cover from a screenshot. Hand-made art is strongly preferred.

## Commands

`npm run promote <id> [-- --repo owner/name] [--private] [--keep]`: in a workshop, move a finished game into its own repo (see the `promote-game` skill).

| Command | What it does |
|---|---|
| `npm run new-game <id> [--vite] [--online \| --party [--controller pad\|custom\|motion]] [--phone portrait\|landscape] [--players 2-4] [--name "Title"]` | Make a game: the repo's one game, or one more in a workshop with `--workshop` / an existing `games/` (`--online`: online multiplayer starter; `--party`: TV + phones party starter; `--phone`: a starter laid out in the portrait 720×1280 or landscape 1280×720 phone space, with `phone` set in the manifest) |
| `npm run dev [-- --host]` | Play it in a browser with live reload (http://localhost:5173). `--host` also serves it on your Wi-Fi, to try it on a phone. Online games: a local relay starts too, so open two windows. Party games: phones on the same Wi-Fi scan the lobby's QR code |
| `npm run check` | Validate, build, headless play test (gamepad, keyboard, mouse-only, touch, pause, a 16:9 window at DPR 2; a phone pass at 390×844 / 844×390 and DPR 3 for games with `phone`; online games also play two copies through a local relay; party games bring headless phones that join, play and reconnect), render art. Must pass before pushing. |
| `npm run art:shots` | Render the game's art pages (cover, hero, `art/gallery.html`) and a cover thumbnail to PNG to look at |
| `npm run art -- [--dry] [--approve <$>]` | Optional: generate painted art from `art/prompts.json` with your own image API key (`.env` or environment). It never charges before the user agrees: it asks in a terminal and, for agents, needs `--approve` covering the estimate |
| `npm run update-kit` | Refresh the build kit, these prompts and the runtime files (only when the user asks) |

## Don'ts

- Don't edit `.github/` unless asked: it holds the build kit and workflow.
- Don't edit the runtime files (`input.js`, `menu.js`, `fit.js`, `audio.js`, `save.js`, `settings.js`, `prompts.js`, `touch.js`, `net.js` / `lobby.js` in online games, and `party.js` / `party-lobby.js` / `qr.js` / `controller.js` in party games).
- Don't bind F10, Start+Select or a held Esc; don't build an "exit to launcher" of your own (`menu.js` adds Quit to library to the pause menu inside the launcher).
- Don't commit `node_modules/`, `dist/`, `mockups/`, `*.py` or `__pycache__/` (the repo's `tools/` folder is shared tooling and belongs in git; the build never ships it).
- Don't start a second game in a one-game repo; don't delete or rewrite other games in a workshop.
