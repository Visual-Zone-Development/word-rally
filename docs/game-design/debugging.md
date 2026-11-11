# Debugging

Reproduce first, then fix the root cause. `npm run check` is the first tool. It reports crashes, console errors, 404s, network requests (WebSockets too), dialogs and blank screens, and saves a screenshot. It plays several short passes: a **gamepad** pass (A around 1.2s, stick right around 1.5–2.2s, then Start, expecting `window.__game.state.screen === 'paused'`), a **keyboard-only** pass (Enter, then Esc must change the screen), a **mouse-only** pass (menus by click, the pause button), a **touch** pass (tap on the title menu) and a render at **1920×1080 with DPR 2**. A game with `phone` in its manifest also gets a **phone** pass: touch only at 390×844 or 844×390 with DPR 3, menus by tap, the pause button, `visibilitychange` must pause, and text under 32 px in the phone space fails ([phone.md](phone.md)). It also checks the code statically: `menu.js` imported and `input.attach` called (warnings), no F10 binding, `tags` and `inputs` present (failures), `localStorage` keys prefixed with the game id (warning). For anything deeper, write a repro script (below).

## Common failures

| Symptom | Likely cause | Fix |
|---|---|---|
| Controller does nothing | `input.update()` not called each frame, or called after reading input | Call `input.update()` once at the top of the frame, before `update()` |
| Mouse or touch does nothing | `input.attach(canvas, 1280, 800)` never called, or called on a canvas under another element | Attach once, on the top-most canvas |
| A press triggers twice, or skips a screen | `held()` used where `pressed()` was meant; or two screens both read the same press in one frame | Use `pressed()` for one-shot actions; `return` after changing screens |
| Esc quits the run / B pauses | `b` and `menu` confused | Pause only on `input.pressed('menu')`; `b` is back in menus and a gameplay button otherwise |
| Check: Start didn't pause | `state.screen` isn't `'paused'` after Start, or `window.__game` missing | Set `state.screen = 'paused'` on `menu` and expose `window.__game = { state, TUNING }` |
| Pauses by itself / stays paused | `input.onPause` fired (blur, hidden tab, overlay, every pad disconnected); Resume doesn't clear the game's own paused flag | Expected on blur; make Resume the only way out and reset `state.screen = 'playing'` |
| Black or blank screen | Exception in the first frame; drawing before the canvas is sized; waiting on assets or fonts before drawing anything | Look for "the game crashed" in the check; draw a loading screen immediately |
| Blurry, offset or clipped image; wrong letterbox colour | Hand-written resize code instead of `fitCanvas`; smoothing on pixel art; `devicePixelRatio` read directly | `fitCanvas(canvas, { w: 1280, h: 800, maxDpr: 2, letterbox })`; `integer: true` + `ctx.imageSmoothingEnabled = false` for pixel art |
| Soft at DPR 2 (Legion Go, DevTools DPR 2) | Bitmaps or cached text pre-rendered at 1× | Render caches at 2×, or draw with vector calls |
| No sound | `AudioContext` never unlocked (no gesture yet in a plain browser) or muted after pause | Use `audio.js` (unlocks on the first input, mutes on pause); don't play music before the first input and expect to hear it outside the launcher |
| Sound keeps playing under the launcher overlay | Audio not routed through `audio.js` buses | Route everything through `createAudio({ settings })` |
| Game runs fast or slow on some screens | Movement per frame instead of per second | Multiply by `dt`; clamp `dt = Math.min(1/20, …)` |
| Stutters, frame drops | Unbounded particles or entities; allocations in the frame loop; heavy `shadowBlur`; too many draw calls in three.js; DPR 2 doubling fill cost | Cap arrays; reuse objects; pre-render glows; see [3d.md](3d.md) budgets |
| Old save breaks after an update | Save shape changed | Bump the `createSave` version (`<id>-save-v2`) with a `migrate`; `save.js` already guards `JSON.parse` |
| Check: save key not prefixed | Raw `localStorage.setItem('best', …)` | Go through `createSave(id, …)` / `createSettings(id, …)` |
| Check: "loads … from the internet" | CDN script, Google Font, remote image, WebSocket | Bundle the file in the game folder ([assets.md](assets.md)) |
| Check: "missing file … (404)" | Wrong relative path or filename case | Paths are case-sensitive on Linux; use paths relative to `index.html` |
| Check: dialog error | `alert()` / `confirm()` / `prompt()` | Draw the message in-game |
| Check: F10 bound / Start+Select used | The game built its own quit | Remove it; the launcher owns quitting |
| `update-kit` reports a hand-edited runtime file | A fix was patched into `input.js` etc. | Move it into `game.js` (`input.extendKeys` for keys); `npm run update-kit` restores the files |
| Text unreadable on the handheld | Under 24px, low contrast, at the screen edge | ≥ 24px, strong contrast, ≥ 32px from the edges |
| Check (phone pass): text under 32 px | A 1280×800 HUD size kept in a phone space | ≥ 32px in the phone space, × `textScale`; headings ≥ 44px |
| Check (phone pass): hidden page didn't pause | `input.onPause` handler only pauses from `playing`, or sets its own flag without `state.screen = 'paused'` | Pause from every playable screen and save; `visibilitychange` is one of the events `onPause` wraps |
| Check (phone pass): tap did nothing / pause button missed | Target under the notch or home bar, under 56 px, or `input.attach` given 1280×800 while `fitCanvas` got the phone space | Place from `fit.safe`, ≥ 56 px; the same `w, h` to `fitCanvas` and `input.attach` |
| On-screen controls show with a controller plugged in | The game draws its own touch controls regardless of mode | Use `touch.js` (draws only when `input.mode === 'touch'`), or guard your drawing with that check |
| Stick and drag fight on touch | The game reads `input.pointer` for movement as well as `touch.js`'s stick | One movement source per mode: the stick writes `input.x / y`; drop the pointer drag or use it only when there's no stick |
| Huge jump after the phone comes back | `dt` not clamped; timers counted wall-clock | `dt = Math.min(1/20, …)`; round timers pause with the game |
| Online: stuck after a screen lock | `net.status` ignored | Show "Reconnecting…" while `net.status === 'reconnecting'`; offer Back to lobby when `net.connection === 'offline'` |

## Debug overlay convention

Every game should have a debug overlay that's **off by default**:

- Enabled by the `?debug` URL parameter (`new URLSearchParams(location.search).has('debug')`). Optionally, also toggled at runtime by holding **Tab + F** (`select` + `y`) for a second, which works on keyboard and controller alike. Never Start+Select, F10 or Esc: the launcher owns those.
- Shows FPS and frame time (ms), entity and particle counts, `state.screen`, `input.mode`, and raw input (`input.x`, `input.y`, held buttons, `input.paused`).
- Drawn last, top-left inside the 32px safe margin, in small monospace text. This is the one place where text under 24px is fine.

## Test hooks

Expose state for scripts and the console:

```js
const params = new URLSearchParams(location.search)
const seed = Number(params.get('seed')) || Date.now()   // seeded RNG → reproducible runs
window.__game = {
  state,                  // the live state object; state.screen is title | playing | paused | settings | gameover
  TUNING,                 // tweak live: __game.TUNING.enemySpeed = 300
  start: () => reset(),   // skip the title screen
  jumpTo: (level) => { /* load a specific level/wave */ },
}
```

`state` and `TUNING` are required (the check reads `__game.state.screen` after pressing Start); the rest is optional but cheap.

With a seeded RNG (e.g. mulberry32) instead of `Math.random()`, `?seed=123` replays the same layout every time. That makes bugs reproducible.

## Repro script

When the bug happens after the first 3 seconds, or needs specific inputs, write a scratch script outside the game folder (e.g. in your scratch or temp directory). It uses the build kit's Playwright and a virtual gamepad driven by a timeline:

```js
// repro.mjs: node repro.mjs <repo-root> <game-id>
import { spawn } from 'node:child_process'
import { join } from 'node:path'
const [root, id] = process.argv.slice(2)
const { chromium } = await import(join(root, '.github/pushplay/node_modules/playwright/index.mjs'))

// 1. Serve the game (vite dev server, works for plain and --vite games)
const dev = spawn('npm', ['run', 'dev', id], { cwd: root, stdio: 'ignore', detached: true })
await new Promise((r) => setTimeout(r, 2500))

// 2. Input timeline: [startMs, endMs, { buttons: [indices], axes: [lx, ly, rx, ry] }]
//    Standard mapping: 0=A 1=B 2=X 3=Y 4=LB 5=RB 6=LT 7=RT 8=Select 9=Start 12=Up 13=Down 14=Left 15=Right
const timeline = [
  [500, 600, { buttons: [0] }],          // A: start game
  [1000, 4000, { axes: [1, 0, 0, 0] }],  // hold right
  [4200, 4300, { buttons: [0] }],        // A: action
]

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
// Phone game: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true } and page.tap() instead of the pad
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.addInitScript((timeline) => {
  const t0 = performance.now()
  const pad = () => {
    const t = performance.now() - t0
    const active = timeline.filter(([a, b]) => t >= a && t < b).map(([, , s]) => s)
    const buttons = new Set(active.flatMap((s) => s.buttons ?? []))
    const axes = active.find((s) => s.axes)?.axes ?? [0, 0, 0, 0]
    return {
      id: 'Repro pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: t, axes,
      buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.has(i), touched: buttons.has(i), value: buttons.has(i) ? 1 : 0 })),
      vibrationActuator: null,
    }
  }
  Object.defineProperty(Navigator.prototype, 'getGamepads', { value: () => [pad(), null, null, null] })
}, timeline)
page.on('console', (m) => console.log(`[${m.type()}] ${m.text()}`))
page.on('pageerror', (e) => console.log(`[CRASH] ${e.message}`))

await page.goto('http://localhost:5173/?debug&seed=1')
let elapsed = 0
for (const ms of [1000, 3000, 5000, 8000]) {
  await page.waitForTimeout(ms - elapsed)
  elapsed = ms
  await page.screenshot({ path: `shot-${ms}.png` })
  console.log(ms, JSON.stringify(await page.evaluate(() => window.__game?.state?.screen)))
}
await browser.close()
process.kill(-dev.pid) // stop npm and the vite server it started
```

Run it, read the console output, and **look at the screenshots**. Use `page.evaluate(() => window.__game...)` to read or set state directly (e.g. jump to wave 10).

If the Chromium download isn't available in your environment, fall back to reading code carefully, adding `console.error` traces, and running `npm run check`.

## Performance

- Check FPS in the debug overlay during the busiest moment (late waves, max particles).
- In desktop Chrome DevTools → Performance, enable **4× CPU slowdown** as a rough Deck / Legion Go proxy (and device mode at DPR 2 for the Legion Go's fill cost), and record a few seconds of heavy play. Look for long frames, garbage-collection spikes (allocations in the loop) and expensive draw calls.
- three.js: log `renderer.info.render.calls` and `.triangles` against the [3d.md](3d.md) budget.
