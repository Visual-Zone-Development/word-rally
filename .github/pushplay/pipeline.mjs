import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join } from 'node:path'
import { chromium } from 'playwright'
import { ART, ART_FONTS, CHECK_RUN_MS, MANIFEST_FILE, NET_MEET_MS, NET_PLAY_MS, NET_WARN_BYTES_PER_SEC, ONLINE_RUNTIME_FILES, PARTY_RUNTIME_FILES, PHONE_MIN_TEXT_PX, RUNTIME_FILES, RUNTIME_HEADER_RE, VIEWPORT, VIEWPORT_DENSE, VIEWPORT_PHONE } from './config.mjs'
import { startLocalRelay } from './local-relay.mjs'
import { buildMode, display, distDir, GameError, ignored, ignorePatterns, npmSpawn, outDir, quote, readManifest, ROOT, validateManifest } from './repo.mjs'
import { serve } from './server.mjs'

/** Generated art lives here inside each build, away from the game's own asset folders. */
export const ART_DIR = '__art'
/** Folder holding the @fontsource packages, wherever npm put them. */
const FONTSOURCE = dirname(dirname(createRequire(import.meta.url).resolve('@fontsource/rubik/package.json')))
/** Never shipped: tooling, dependencies, VCS, and the kit itself (dot-folders are skipped too). */
const SKIP = new Set(['node_modules', 'dist', 'package.json', 'package-lock.json', 'README.md', 'LICENSE', MANIFEST_FILE])

/**
 * Headless Chromium. Where Playwright's browser download is blocked (some sandboxes), point
 * KIT_BROWSER at an installed Chrome or Chromium and the check uses that instead.
 */
export function launchBrowser() {
  // SwiftShader gives headless Chromium software WebGL, so three.js/WebGL games can be checked in CI.
  return chromium.launch({
    executablePath: process.env.KIT_BROWSER || undefined,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      // 2D canvas on the CPU: through the software GPU, glow and blend effects take seconds a
      // frame on a CI runner. WebGL still uses SwiftShader.
      '--disable-accelerated-2d-canvas',
      // The online check runs two copies at once; neither may be throttled as a background window.
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows'
    ]
  })
}

/**
 * Build one game end to end: validate → build → headless play check → art → package.
 * Throws GameError listing every problem if the game isn't shippable.
 * `beforePack(out, manifest)` runs on the finished build just before it's zipped; it may return warnings.
 */
export async function buildGame(game, browser, { pack = true, beforePack } = {}) {
  const { id } = game
  const manifest = readManifest(game)
  const { errors, warnings } = validateManifest(game, manifest)
  if (errors.length) throw new GameError(id, errors.join('\n'))

  const out = outDir(id)
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })

  // 1. Build
  let webEntry
  if (buildMode(game, manifest) === 'npm') {
    runBuild(game)
    const built = join(game.dir, manifest.build?.output ?? 'dist')
    if (!existsSync(join(built, 'index.html'))) throw new GameError(id, `the build didn't produce ${display(built)}/index.html`)
    cpSync(built, out, { recursive: true })
    webEntry = 'index.html'
  } else {
    copyGameFiles(game.dir, out, ignorePatterns(game))
    webEntry = manifest.entry.web
  }
  const source = sourceChecks(game, manifest)
  warnings.push(...source.warnings)
  if (source.errors.length) throw new GameError(id, source.errors.join('\n'))

  // 2. Play it headlessly (online games against a local relay, then two copies together), 3. render art
  mkdirSync(join(out, ART_DIR), { recursive: true })
  if (!browser) {
    // No headless browser here (its download was blocked): the static checks above still ran.
    warnings.push('no headless browser, so the play passes (controller, keyboard, mouse, touch, phone), the art and the screenshot were skipped. Run `npm run setup` (or set KIT_BROWSER to a Chrome/Chromium executable) to run them; GitHub Actions runs them on push')
    const { $schema: _schema, build: _build, ...rest } = manifest
    return { id, manifest: { ...rest, entry: { web: webEntry } }, out, files: {}, warnings, skipped: true }
  }
  const net = manifest.online ? netLibrary(game.dir) : null
  if (net) warnings.push(...net.warnings)
  const relay = net || manifest.party ? await startLocalRelay() : null
  const server = await serve({ '/': out, '/__src/': game.dir, '/__fonts/': FONTSOURCE }, relay ? { '/__net.json': JSON.stringify({ url: relay.url }) } : {})
  try {
    const play = await playCheck(browser, server, out, webEntry, manifest)
    if (manifest.party && !play.errors.length) {
      const phones = await partyCheck(browser, server, webEntry, relay, manifest)
      play.errors.push(...phones.errors)
      play.warnings.push(...phones.warnings)
    }
    if (net && !play.errors.length) {
      const together = await netCheck(browser, server, webEntry, relay)
      play.errors.push(...together.errors)
      play.warnings.push(...together.warnings)
    }
    warnings.push(...play.warnings)
    if (play.errors.length) throw new GameError(id, play.errors.join('\n'))
    for (const kind of ['cover', 'hero']) await renderArt(browser, server, manifest, kind, join(out, ART_DIR, `${kind}.png`))
  } finally {
    await server.close()
    await relay?.close()
  }

  // 4. The manifest the launcher sees: built entry and generated art.
  const { $schema: _schema, build: _build, ...rest } = manifest
  const shipped = {
    ...rest,
    entry: { web: webEntry },
    art: { cover: `${ART_DIR}/cover.png`, hero: `${ART_DIR}/hero.png`, screenshots: [`${ART_DIR}/screenshot.png`] }
  }
  writeFileSync(join(out, MANIFEST_FILE), JSON.stringify(shipped, null, 2) + '\n')
  if (beforePack) warnings.push(...((await beforePack(out, shipped)) ?? []))

  return { id, manifest: shipped, out, files: pack ? packageGame(id, out) : {}, warnings }
}

/**
 * Copy a game without a build step. Hand-rolled because in a single-game repo the output folder
 * sits inside the game folder (under the hidden kit dir), which cpSync refuses even with a filter.
 */
function copyGameFiles(from, to, patterns = [], rel = '') {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue
    const path = rel ? `${rel}/${entry.name}` : entry.name
    if (ignored(path, patterns, entry.isDirectory())) continue
    const src = join(from, entry.name)
    if (entry.isDirectory()) copyGameFiles(src, join(to, entry.name), patterns, path)
    else if (entry.isFile()) copyFileSync(src, join(to, entry.name))
  }
}

/** Source files of a game (its own code, not the runtime modules, dependencies or build output). */
function sourceFiles(dir, out = [], rel = '') {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || ['node_modules', 'dist', 'build', 'out', 'vendor', 'lib', 'libs'].includes(entry.name)) continue
    const path = rel ? `${rel}/${entry.name}` : entry.name
    const full = join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(full, out, path)
    else if (/\.(m?js|ts|html)$/.test(entry.name)) {
      const text = readFileSync(full, 'utf8')
      if ((RUNTIME_FILES.includes(entry.name) || PARTY_RUNTIME_FILES.includes(entry.name) || ONLINE_RUNTIME_FILES.includes(entry.name)) && RUNTIME_HEADER_RE.test(text)) continue
      out.push({ path, text })
    }
  }
  return out
}

/**
 * Static checks on the game's own code: the conventions that make a game playable on every
 * device (menu.js for menus, input.attach for mouse/touch, no F10, saves keyed by the game id).
 */
function sourceChecks(game, manifest) {
  const errors = []
  const warnings = []
  const files = sourceFiles(game.dir)
  const code = files.filter((f) => !f.path.endsWith('.html'))
  const all = files.map((f) => f.text).join('\n')
  const usesInput = /from\s+['"][^'"]*\/input\.js['"]/.test(all)
  if (!/from\s+['"][^'"]*\/menu\.js['"]/.test(all) && !/createMenu\(/.test(all)) {
    warnings.push('nothing imports menu.js: every menu (title, pause, settings, game over) must work with a controller, a keyboard, a mouse and touch, which createMenu does for you')
  }
  if (usesInput && !/input\.attach\(/.test(all)) warnings.push('input.js is imported but input.attach(canvas) is never called, so mouse and touch never reach the game')
  if (!/window\.__game\s*=/.test(all)) {
    warnings.push("set window.__game = { state, TUNING } with state.screen ('title' | 'playing' | 'paused' | 'settings' | 'gameover'), so the check can verify pausing and the debug overlay can read it")
  }
  for (const file of code) {
    if (/['"`]F10['"`]/.test(file.text)) errors.push(`${file.path} binds F10, which the launcher uses to open its own menu. Pause on input.pressed('menu') instead`)
    for (const m of file.text.matchAll(/localStorage\.(?:setItem|getItem|removeItem)\(\s*['"`]([^'"`$]+)['"`]/g)) {
      if (!m[1].startsWith(game.id)) warnings.push(`${file.path} uses the localStorage key "${m[1]}", which other games on the same device can clash with: use createSave('${game.id}', 1, { ... }) from save.js (keys become ${game.id}-save-v1)`)
    }
    for (const m of file.text.matchAll(/create(?:Save|Settings)\(\s*['"`]([^'"`$]+)['"`]/g)) {
      if (m[1] !== game.id) warnings.push(`${file.path} calls createSave/createSettings with "${m[1]}"; use the game id "${game.id}" so saves don't clash`)
    }
    if (/new\s+(?:window\.)?(?:webkit)?AudioContext\b/.test(file.text) && !/\.resume\(/.test(all)) {
      warnings.push(`${file.path} creates an AudioContext but nothing calls resume(): outside the launcher, browsers keep audio silent until the first key, tap or click. createAudio() from audio.js handles it`)
    }
  }
  if (manifest.inputs && !manifest.inputs.includes('gamepad')) warnings.push('"inputs" leaves out "gamepad": every kit game should play with a controller')
  if (manifest.phone) {
    if (!/from\s+['"][^'"]*\/touch\.js['"]/.test(all)) warnings.push('a phone game is played with thumbs: import createTouchControls from touch.js (a floating stick and buttons that feed input.x/y and input.held) unless the game is tap-only by design')
    if (!/\.safe\b/.test(all)) warnings.push('nothing reads fit.safe: on a phone the notch and the home bar cover part of the canvas. Keep the HUD and buttons inside fit.safe ({ top, right, bottom, left } in game units)')
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] }
}

/**
 * Run the game's npm "build" script. Games inside a workspace-enabled repo (the template) build
 * through the workspace; anything else installs its own dependencies first if needed.
 */
function runBuild(game) {
  const run = (args, cwd) => spawnSync('npm', quote(args), { ...npmSpawn, cwd, encoding: 'utf8', env: { ...process.env, CI: 'true' } })
  let result
  const rootPkg = existsSync(join(ROOT, 'package.json')) ? JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) : null
  if (game.rel && rootPkg?.workspaces) {
    result = run(['run', 'build', '--workspace', game.rel], ROOT)
  } else {
    if (!existsSync(join(game.dir, 'node_modules'))) {
      const install = existsSync(join(game.dir, 'package-lock.json')) ? ['ci', '--no-audit', '--no-fund'] : ['install', '--no-audit', '--no-fund']
      const installed = run(install, game.dir)
      if (installed.status !== 0) throw new GameError(game.id, `npm ${install[0]} failed:\n${tail(installed)}`)
    }
    result = run(['run', 'build'], game.dir)
  }
  if (result.status !== 0) throw new GameError(game.id, `npm run build failed in ${display(game.dir)}:\n${tail(result)}`)
}

const tail = (result) => `${result.stdout}\n${result.stderr}`.trim().split('\n').slice(-25).join('\n')

/**
 * Load the game like the launcher would and watch for crashes, missing files and internet use,
 * then make sure it can be played and paused with a controller, a keyboard and touch, and that
 * it fits a denser screen. Games exposing window.__game.state.screen get the strict version.
 */
async function playCheck(browser, server, out, entry, manifest) {
  // (phone games also write __art/screenshot-phone-<orientation>.png, see the phone pass)
  const errors = []
  const warnings = []
  const url = `${server.url}/${entry}`
  const offline = async (context) => {
    // A frame clock, so the passes time their input from the game's first frame rather than
    // from page load: on a slow CI runner the software renderer's first frame can take a second.
    await context.addInitScript(() => {
      window.__kitFrames = 0
      window.__kitFirstFrame = null
      const raf = window.requestAnimationFrame.bind(window)
      window.requestAnimationFrame = (cb) =>
        raf((ts) => {
          window.__kitFrames++
          window.__kitLastFrame = performance.now()
          if (window.__kitFirstFrame === null) window.__kitFirstFrame = performance.now()
          cb(ts)
        })
    })
    await context.route('**/*', (route) => {
      const target = route.request().url()
      if (target.startsWith(server.url) || target.startsWith('data:') || target.startsWith('blob:') || manifest.online || manifest.party) return route.continue()
      errors.push(`the game loads ${target} from the internet. Games must work offline: bundle it into the game folder (or set "online": true for multiplayer games)`)
      return route.abort()
    })
    await context.routeWebSocket(() => true, (ws) => {
      const target = ws.url()
      if (manifest.online || manifest.party || target.startsWith(server.url.replace('http', 'ws'))) return ws.connectToServer()
      errors.push(`the game opens a WebSocket to ${target}. Games must work offline (or set "online": true for multiplayer games)`)
      ws.close()
    })
  }
  const watch = (page) => {
    page.on('pageerror', (err) => errors.push(`the game crashed: ${err.message}`))
    page.on('console', (msg) => {
      if (msg.type() === 'error') warnings.push(`console error: ${msg.text().slice(0, 200)}`)
    })
    page.on('dialog', (dialog) => {
      errors.push(`the game opened a ${dialog.type()}() dialog, which blocks controller input; draw UI in the game instead`)
      void dialog.dismiss()
    })
  }
  const open = async (page, label) => {
    await page.goto(url, { waitUntil: 'load', timeout: 20_000 }).catch((err) => errors.push(`the game didn't load${label}: ${err.message}`))
  }
  const screen = (page) => page.evaluate(() => (window.__game?.state?.screen === undefined ? null : String(window.__game.state.screen)))
  /** The game has drawn a couple of frames and had a moment to settle on its title. */
  const drawn = async (page) => {
    await page.waitForFunction(() => window.__kitFrames >= 2, null, { timeout: 10_000 }).catch(() => {})
    await page.waitForTimeout(600)
  }
  /**
   * Give the game time to act on an input: until state.screen is `want` (when given), or the game
   * has drawn `frames` more frames, with a floor of `floor` ms and a cap of `timeout` ms. A fixed
   * wait isn't enough: a three.js game on a CI runner's software renderer can take over a second
   * per frame, so the input hasn't been processed when the state is read.
   */
  const acted = async (page, want = null, { frames = 3, floor = 400, timeout = 4000 } = {}) => {
    const started = Date.now()
    const target = (await page.evaluate(() => window.__kitFrames ?? 0).catch(() => 0)) + frames
    await page
      .waitForFunction(
        ([t, w]) => (w !== null && window.__game?.state?.screen === w) || (window.__kitFrames ?? 0) >= t,
        [target, want],
        { timeout }
      )
      .catch(() => {})
    await page.waitForTimeout(Math.max(0, floor - (Date.now() - started)))
  }
  /**
   * A screenshot needs the page to produce a frame. When it can't in time, say what the frame
   * clock saw instead of failing every later step with a bare timeout.
   */
  const capture = async (page, label, timeout = 15_000) => {
    try {
      return await page.screenshot({ type: 'png', timeout })
    } catch (err) {
      const clock = await Promise.race([
        page.evaluate(() => ({ frames: window.__kitFrames, sinceLast: Math.round(performance.now() - (window.__kitLastFrame ?? 0)) })).catch(() => null),
        new Promise((r) => setTimeout(() => r(null), 3000))
      ])
      const seen = clock ? `${clock.frames} frame(s) were drawn, the last one ${clock.sinceLast} ms before the capture gave up` : 'the page did not answer either'
      errors.push(
        `the screen couldn't be captured${label} within ${timeout / 1000} s (${seen}). The game must keep producing frames: check for work that takes seconds per frame on a slow machine (large blurs, thousands of draw calls) or a loop that never yields. ${String(err.message).split('\n')[0]}`
      )
      return null
    }
  }
  /**
   * A busy loop in the game would make every later step time out with no clue, so before the
   * first screenshot: if the page can't answer a trivial call in 5 s, pause its JavaScript with
   * the debugger and report where it is.
   */
  const responsive = async (page, label) => {
    const answered = await Promise.race([page.evaluate(() => true).catch(() => false), new Promise((r) => setTimeout(() => r(null), 5000))])
    if (answered !== null) return true
    let where = 'unknown (the debugger could not pause it)'
    try {
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Debugger.enable')
      const paused = new Promise((resolve) => cdp.once('Debugger.paused', resolve))
      await cdp.send('Debugger.pause')
      const event = await Promise.race([paused, new Promise((r) => setTimeout(() => r(null), 3000))])
      if (event) {
        where = event.callFrames
          .slice(0, 6)
          .map((f) => `${f.functionName || '(anonymous)'} at ${f.url.replace(server.url, '')}:${f.location.lineNumber + 1}`)
          .join(' ← ')
        await cdp.send('Debugger.resume').catch(() => {})
      }
      await cdp.detach().catch(() => {})
    } catch {
      /* diagnostics only */
    }
    errors.push(
      `the game's main thread is stuck${label}: it stopped answering for 5 s. Its JavaScript was paused at: ${where}. Look for a loop that never ends (a fixed-step accumulator with an unclamped dt, a while loop waiting on time) or work that takes seconds per frame`
    )
    return false
  }

  /**
   * The game's logical space: fitCanvas's live size when the game uses it (a fill game's space
   * follows the window), else from the canvas' shape: 1280×800 (the default), or a phone space
   * (720×1280 portrait, 1280×720 landscape). Pointer spots in game units are mapped through it.
   */
  const space = (page) =>
    page.evaluate(() => {
      const fit = document.querySelector('canvas')?.__fit
      if (fit && fit.w > 0 && fit.h > 0) return { w: fit.w, h: fit.h }
      const r = document.querySelector('canvas')?.getBoundingClientRect()
      if (!r?.width || !r?.height) return { w: 1280, h: 800 }
      const ratio = r.width / r.height
      const spaces = [
        { w: 1280, h: 800 },
        { w: 720, h: 1280 },
        { w: 1280, h: 720 }
      ]
      return spaces.sort((a, b) => Math.abs(a.w / a.h - ratio) - Math.abs(b.w / b.h - ratio))[0]
    })
  /** Where the title menu's first item is (window.__game.titleMenu, a createMenu), else where the default menu puts it; in CSS pixels. */
  const titleSpot = async (page) => {
    const sp = await space(page)
    const first = await page.evaluate(
      ([w, h]) => {
        const menu = window.__game?.titleMenu
        const r = typeof menu?.rect === 'function' ? menu.rect(0) : { x: w / 2 - 210, y: h / 2 + 20, w: 420, h: 64 }
        return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
      },
      [sp.w, sp.h]
    )
    return pageSpot(page, first.x, first.y, sp)
  }
  /**
   * Where the on-screen pause button is: window.__game.pauseButton (a { x, y, w, h }) when the game
   * exposes it, else the spots kit games have put it (top-right, top-centre, top-left); in CSS pixels.
   */
  const pauseSpots = async (page) => {
    const sp = await space(page)
    const spots = await page.evaluate(([w]) => {
      const b = window.__game?.pauseButton
      if (b && typeof b.x === 'number') return [{ x: b.x + (b.w ?? 56) / 2, y: b.y + (b.h ?? 56) / 2 }]
      return [
        { x: w - 60, y: 60 },
        { x: w / 2, y: 52 },
        { x: 60, y: 60 }
      ]
    }, [sp.w])
    return Promise.all(spots.map((r) => pageSpot(page, r.x, r.y, sp)))
  }
  /** Click or tap the pause button (each likely spot until one pauses). Returns the screen after, and where it tried. */
  const pressPause = async (page, tap) => {
    const spots = await pauseSpots(page)
    let after = null
    for (const spot of spots) {
      if (tap) await page.touchscreen.tap(spot.x, spot.y)
      else {
        await page.mouse.move(spot.x - 30, spot.y + 10)
        await page.mouse.move(spot.x, spot.y, { steps: 3 })
        await page.mouse.click(spot.x, spot.y)
      }
      await acted(page, 'paused')
      after = await screen(page)
      if (after === 'paused') break
    }
    return { after, tried: spots.map(describeSpot).join(' / ') }
  }
  const pageSpot = (page, gx, gy, sp) =>
    page.evaluate(
      ([gx, gy, w, h]) => {
        const r = document.querySelector('canvas')?.getBoundingClientRect()
        return r && r.width ? { x: r.left + (gx / w) * r.width, y: r.top + (gy / h) * r.height } : { x: gx, y: gy }
      },
      [gx, gy, sp.w, sp.h]
    )
  const describeSpot = (s) => `${Math.round(s.x)},${Math.round(s.y)}`

  // --- Pass 1: controller. A once (most games start on A), the stick nudges right, then Start must pause.
  {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
    await offline(context)
    const page = await context.newPage()
    try {
      await page.addInitScript(() => {
        // The check drives A and Start itself (press() below), held and released over whole frames.
        const check = (window.__kitCheck = { a: false, start: false, audio: [] })
        const button = (pressed) => ({ pressed, touched: pressed, value: pressed ? 1 : 0 })
        const pad = () => {
          const t = window.__kitFirstFrame === null ? 0 : performance.now() - window.__kitFirstFrame
          return {
            id: 'Headless check gamepad (STANDARD GAMEPAD)',
            index: 0,
            connected: true,
            mapping: 'standard',
            timestamp: t,
            axes: [t > 1500 && t < 2200 ? 0.8 : 0, 0, 0, 0],
            buttons: Array.from({ length: 17 }, (_, i) => button((i === 0 && check.a) || (i === 9 && check.start))),
            vibrationActuator: null
          }
        }
        Object.defineProperty(Navigator.prototype, 'getGamepads', { value: () => [pad(), null, null, null] })
        window.addEventListener('load', () => {
          setTimeout(() => window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: pad() })), 100)
        })
        for (const name of ['AudioContext', 'webkitAudioContext']) {
          const Original = window[name]
          if (!Original) continue
          window[name] = class extends Original {
            constructor(...args) {
              super(...args)
              check.audio.push(this)
            }
          }
        }
      })
      watch(page)
      /** Hold a pad button for three of the game's frames, then release it for three. */
      const press = async (button) => {
        const frames = () => page.evaluate(() => window.__kitFrames).catch(() => 0)
        const waitFrames = async (n) => {
          const target = (await frames()) + n
          await page.waitForFunction((t) => window.__kitFrames >= t, target, { timeout: 5000 }).catch(() => {})
        }
        await page.evaluate((b) => (window.__kitCheck[b] = true), button)
        await waitFrames(3)
        await page.evaluate((b) => (window.__kitCheck[b] = false), button)
        await waitFrames(3)
      }
      const started = Date.now()
      await open(page, '')
      await drawn(page)
      await page.waitForTimeout(600)
      // A on the title, again (up to three times) while a game that exposes its screen still shows it.
      for (let i = 0; i < 3; i++) {
        await press('a')
        if ((await screen(page)) !== 'title') break
      }
      await page.waitForTimeout(Math.max(500, CHECK_RUN_MS - (Date.now() - started)))
      for (const path of server.missing) if (!path.startsWith('/__')) errors.push(`missing file: ${path} (404)`)
      if (!(await responsive(page, ''))) return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] }

      const shot = await capture(page, '')
      if (shot) {
        writeFileSync(join(out, ART_DIR, 'screenshot.png'), shot)
        if (await looksBlank(page, shot)) {
          errors.push(`after ${CHECK_RUN_MS / 1000}s the screen is one flat color. The game should draw something right away (a title screen counts)`)
        }
      }

      const before = await screen(page)
      if (before === null) {
        warnings.push("window.__game.state.screen is missing, so the check can't verify that Start / Esc pause the game. Expose it: window.__game = { state, TUNING }")
      } else if (before !== 'playing' && !((manifest.online || manifest.party) && before === 'lobby')) {
        // Online and party games go to their lobby first (one copy can't play alone); netCheck
        // plays two together, partyCheck brings phones.
        errors.push(`pressing A on the title didn't start the game: after ${CHECK_RUN_MS / 1000}s state.screen is "${before}", not "playing"${manifest.online || manifest.party ? ' (or "lobby")' : ''}. The title menu's first item must start play`)
      } else {
        await press('start')
        await page.waitForTimeout(200)
        const after = await screen(page)
        if (after !== 'paused') errors.push(`pressing Start during play didn't pause: state.screen is "${after}", not "paused". Open the pause menu on input.pressed('menu')`)
      }
      const audio = await page.evaluate(() => {
        const list = window.__kitCheck?.audio ?? []
        return { created: list.length, running: list.some((c) => c.state === 'running') }
      })
      if (audio.created && !audio.running) warnings.push('an AudioContext was created but never started running after input: resume it on the first key, tap or button press (createAudio from audio.js does this)')
    } finally {
      await context.close()
    }
  }

  // --- Pass 2: keyboard only, no controller. Enter starts, Escape must pause.
  {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
    await offline(context)
    const page = await context.newPage()
    try {
      watch(page)
      await open(page, ' (keyboard pass)')
      await drawn(page)
      const before = await capture(page, ' (keyboard pass)')
      await page.keyboard.press('Enter')
      await acted(page, null, { floor: 600 })
      await page.waitForFunction(() => window.__game?.state?.screen !== 'title', null, { timeout: 1500 }).catch(() => {})
      await page.keyboard.press('Escape')
      await acted(page, 'paused')
      const state = await screen(page)
      if (state !== null) {
        if (state !== 'paused') errors.push(`with only a keyboard, Enter then Escape didn't pause the game: state.screen is "${state}", not "paused". Enter chooses (a), Escape opens the pause menu (menu)`)
      } else if (before && before.equals(await capture(page, ' (keyboard pass)'))) {
        warnings.push('with only a keyboard, pressing Enter then Escape changed nothing on screen. Menus must work with Enter / arrows and Escape must pause')
      }
    } finally {
      await context.close()
    }
  }

  // --- Pass 3: touch only. Tapping the first title menu item should leave the title.
  {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, hasTouch: true })
    await offline(context)
    const page = await context.newPage()
    try {
      watch(page)
      await open(page, ' (touch pass)')
      await drawn(page)
      const before = await capture(page, ' (touch pass)')
      const state = await screen(page)
      const spot = await titleSpot(page)
      await page.touchscreen.tap(spot.x, spot.y)
      await page.waitForTimeout(500)
      const after = await screen(page)
      if (state !== null) {
        if (after === state) warnings.push(`with touch only, tapping the first title menu item (at ${describeSpot(spot)}) changed nothing: state.screen is still "${after}". Menus must be tappable; expose the title menu as window.__game.titleMenu so the check knows where to tap`)
      } else if (before && before.equals(await capture(page, ' (touch pass)'))) {
        warnings.push('with touch only, tapping the title menu changed nothing on screen. Menus must be tappable')
      }
    } finally {
      await context.close()
    }
  }

  // --- Pass 3b: mouse only, no keyboard or controller. Click the first title item, then the on-screen pause button.
  // Gameplay with a mouse is promised by "mouse" in inputs (the Desktop label); menus must work with one regardless.
  {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
    await offline(context)
    const page = await context.newPage()
    const promised = Boolean(manifest.inputs?.includes('mouse'))
    const report = (text) => (promised ? errors : warnings).push(text)
    try {
      watch(page)
      await open(page, ' (mouse pass)')
      await drawn(page)
      const state = await screen(page)
      const spot = await titleSpot(page)
      await page.mouse.move(spot.x - 40, spot.y - 20)
      await page.mouse.move(spot.x, spot.y, { steps: 3 })
      await page.mouse.click(spot.x, spot.y)
      await page.waitForTimeout(500)
      if (state === null) {
        /* nothing to verify without window.__game (the controller pass already warned) */
      } else if ((await screen(page)) === state) {
        report(`with only a mouse, clicking the first title menu item (at ${describeSpot(spot)}) changed nothing: state.screen is still "${state}". Menus must work by click (createMenu does); expose the title menu as window.__game.titleMenu so the check knows where to click`)
      } else {
        await page.waitForFunction(() => window.__game?.state?.screen !== 'title', null, { timeout: 1500 }).catch(() => {})
        if ((await screen(page)) === 'playing') {
          const { after, tried } = await pressPause(page, false)
          if (after !== 'paused') {
            report(
              `with only a mouse, clicking the on-screen pause button (tried ${tried}) didn't pause: state.screen is "${after}", not "paused". Keep a ≥ 56×56 px pause button during play that calls input.requestMenu(), and expose its rect as window.__game.pauseButton = { x, y, w, h } so the check knows where it is`
            )
          }
        }
      }
    } finally {
      await context.close()
    }
  }

  // --- Pass 4: a denser 16:9 screen (Legion Go class, launcher zoom). Not blank, canvas centred.
  {
    const { deviceScaleFactor, ...viewport } = VIEWPORT_DENSE
    const context = await browser.newContext({ viewport, deviceScaleFactor })
    await offline(context)
    const page = await context.newPage()
    try {
      watch(page)
      await open(page, ` (${viewport.width}×${viewport.height} @${deviceScaleFactor}x)`)
      await drawn(page)
      await page.waitForTimeout(900)
      // Twice the pixels through a software GPU: give the capture longer.
      const shot = await capture(page, ` (${viewport.width}×${viewport.height} @${deviceScaleFactor}x)`, 45_000)
      if (shot && (await looksBlank(page, shot))) errors.push(`at ${viewport.width}×${viewport.height} with ${deviceScaleFactor}× pixels the screen is one flat color. Use fitCanvas from fit.js to size and centre the game`)
      const placement = await page.evaluate(() => {
        const canvases = [...document.querySelectorAll('canvas')].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0)
        if (!canvases.length) return null
        const r = canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0]
        return { dx: r.left + r.width / 2 - innerWidth / 2, dy: r.top + r.height / 2 - innerHeight / 2, w: r.width, h: r.height }
      })
      if (placement && (Math.abs(placement.dx) > 2 || Math.abs(placement.dy) > 2)) {
        warnings.push(`at ${viewport.width}×${viewport.height} the canvas (${Math.round(placement.w)}×${Math.round(placement.h)}) isn't centred (off by ${Math.round(placement.dx)},${Math.round(placement.dy)}px). fitCanvas from fit.js letterboxes and centres it`)
      }
    } finally {
      await context.close()
    }
  }

  // --- Pass 5: phone games. Touch only on a phone (390×844 or 844×390 at 3×): tap the title menu, the
  // screen locking (visibilitychange) must pause, the on-screen pause button must pause, and no text may be
  // drawn smaller than PHONE_MIN_TEXT_PX game units of a 720-wide space.
  if (manifest.phone) {
    const orientations = manifest.phone.orientation === 'any' ? ['portrait', 'landscape'] : [manifest.phone.orientation]
    for (const orientation of orientations) {
      const { deviceScaleFactor, ...viewport } = VIEWPORT_PHONE[orientation]
      const label = ` (phone pass, ${orientation} ${viewport.width}×${viewport.height} @${deviceScaleFactor}x)`
      const context = await browser.newContext({ viewport, deviceScaleFactor, hasTouch: true, isMobile: true })
      await offline(context)
      const page = await context.newPage()
      try {
        await page.addInitScript((min) => {
          // Every fillText, with its size in game units of a 720-wide (short side) space: font px ×
          // the context's scale → canvas px, then relative to the canvas' short side.
          const small = (window.__kitSmallText = new Map())
          const proto = CanvasRenderingContext2D.prototype
          const original = proto.fillText
          proto.fillText = function (text, ...rest) {
            try {
              const px = parseFloat(String(this.font).match(/(\d+(?:\.\d+)?)px/)?.[1] ?? '0')
              const m = this.getTransform()
              const scale = Math.hypot(m.a, m.b) || 1
              const short = Math.min(this.canvas.width, this.canvas.height) || 1
              const game = (px * scale * 720) / short
              const s = String(text).trim()
              if (px > 0 && s && game < min) {
                const key = this.font
                const seen = small.get(key)
                if (!seen) small.set(key, { font: this.font, game, samples: [s.slice(0, 40)] })
                else if (seen.samples.length < 3 && !seen.samples.includes(s.slice(0, 40))) seen.samples.push(s.slice(0, 40))
              }
            } catch {
              /* measuring only */
            }
            return original.call(this, text, ...rest)
          }
        }, PHONE_MIN_TEXT_PX)
        watch(page)
        await open(page, label)
        await drawn(page)
        const state = await screen(page)
        const spot = await titleSpot(page)
        await page.touchscreen.tap(spot.x, spot.y)
        await page.waitForTimeout(500)
        await page.waitForFunction(() => window.__game?.state?.screen !== 'title', null, { timeout: 1500 }).catch(() => {})
        const after = await screen(page)
        if (state !== null && after === state) {
          errors.push(`on a phone, tapping the first title menu item (at ${describeSpot(spot)}) changed nothing: state.screen is still "${state}". Build menus with createMenu, lay them out for the ${orientation} space (${orientation === 'portrait' ? '720×1280' : '1280×720'}; pass x: W / 2), and expose the title menu as window.__game.titleMenu`)
        } else if (state !== null && after === 'playing') {
          // The screen locks / the app goes to the background: input.onPause must pause the game.
          await page.waitForTimeout(800)
          await page.evaluate(() => {
            Object.defineProperty(document, 'hidden', { get: () => true, configurable: true })
            Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true })
            document.dispatchEvent(new Event('visibilitychange'))
          })
          await acted(page, 'paused')
          const hidden = await screen(page)
          if (hidden !== 'paused') errors.push(`on a phone, the screen locking (visibilitychange → hidden) didn't pause: state.screen is "${hidden}", not "paused". Pause in input.onPause(cb) (the runtime fires it) and save there`)
          await page.evaluate(() => {
            Object.defineProperty(document, 'hidden', { get: () => false, configurable: true })
            Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true })
            document.dispatchEvent(new Event('visibilitychange'))
          })
          // Back to play through the pause menu (its first item resumes), then the on-screen pause button.
          const resume = await space(page).then(async (sp) => {
            const r = await page.evaluate(() => {
              const menu = window.__game?.pauseMenu
              const rect = typeof menu?.rect === 'function' ? menu.rect(0) : null
              return rect ? { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 } : null
            })
            return r ? pageSpot(page, r.x, r.y, sp) : null
          })
          if (hidden === 'paused' && resume) {
            await page.touchscreen.tap(resume.x, resume.y)
            await acted(page, 'playing')
          }
          if ((await screen(page)) === 'playing') {
            const { after: paused, tried } = await pressPause(page, true)
            if (paused !== 'paused') {
              errors.push(`on a phone, tapping the on-screen pause button (tried ${tried}) didn't pause: state.screen is "${paused}", not "paused". Keep a ≥ 56×56 px pause button inside fit.safe during play that calls input.requestMenu(), and expose it as window.__game.pauseButton = { x, y, w, h }`)
            }
          } else if (hidden === 'paused') {
            warnings.push(`on a phone, the pause button couldn't be checked: expose the pause menu as window.__game.pauseMenu (its first item should resume) so the check can get back to play`)
          }
        }
        const shot = await capture(page, label, 30_000)
        if (shot) writeFileSync(join(out, ART_DIR, `screenshot-phone-${orientation}.png`), shot)
        if (shot && (await looksBlank(page, shot))) errors.push(`on a ${orientation} phone the screen is one flat color. Use fitCanvas from fit.js with the ${orientation} space (${orientation === 'portrait' ? 'w: 720, h: 1280' : 'w: 1280, h: 720'})`)
        const small = await page.evaluate(() => [...window.__kitSmallText.values()]).catch(() => [])
        if (small.length) {
          const list = small
            .slice(0, 5)
            .map((t) => `${Math.round(t.game)}px (font "${t.font}", e.g. ${t.samples.map((x) => `"${x}"`).join(', ')})`)
            .join('; ')
          errors.push(
            `on a phone, text is drawn too small to read: ${list}${small.length > 5 ? ` and ${small.length - 5} more` : ''}. Phone games keep every fillText at ${PHONE_MIN_TEXT_PX}px or more, measured in game units of a 720-wide space (settings.data.textScale applies on top). Prompts: drawPrompts(…, { size: 44 }); menus: menu.draw(ctx, '600 40px system-ui')`
          )
        }
      } finally {
        await context.close()
      }
    }
  }

  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] }
}

const NET_VERSION = /export const NET_VERSION = (\d+)/

/**
 * Online games that use the kit's net.js: find it and warn when the copy is older than the kit's.
 * Returns null for games that bring their own networking (they skip the two-copy check).
 */
function netLibrary(dir) {
  const find = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue
      const full = join(d, entry.name)
      if (entry.isDirectory()) {
        const found = find(full)
        if (found) return found
      } else if (entry.name === 'net.js' && NET_VERSION.test(readFileSync(full, 'utf8'))) return full
    }
    return null
  }
  const file = find(dir)
  if (!file) return null
  const theirs = Number(readFileSync(file, 'utf8').match(NET_VERSION)[1])
  const ours = Number(readFileSync(join(import.meta.dirname, 'templates/online/net.js'), 'utf8').match(NET_VERSION)[1])
  return {
    warnings: theirs < ours ? [`${display(file)} is version ${theirs}; the kit has version ${ours}. Copy ${display(join(import.meta.dirname, 'templates/online'))}/net.js and lobby.js over it`] : []
  }
}

/**
 * Online games: two copies quick-match through the local relay, the host starts, and they play
 * for a moment. Checks that they met, that the second copy received the host's game state, and
 * how much the game sends.
 */
async function netCheck(browser, server, entry, relay) {
  const errors = []
  const warnings = []
  const contexts = []
  const status = (p) => p.evaluate(() => window.__kitNet && { status: window.__kitNet.status, error: window.__kitNet.error, room: window.__kitNet.room }).catch(() => null)
  // Each copy in its own window, as on two Decks.
  const open = async () => {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
    contexts.push(context)
    await context.addInitScript(() => (window.__kitNetTest = true))
    const page = await context.newPage()
    page.on('pageerror', (err) => errors.push(`the game crashed during the two-player online check: ${err.message}`))
    await page.goto(`${server.url}/${entry}`, { waitUntil: 'load', timeout: 20_000 })
    return page
  }
  // Press A (Space) until the copy leaves the title; in the check, the lobby then quick-matches by itself.
  const enterRoom = async (page) => {
    const deadline = Date.now() + NET_MEET_MS
    while (Date.now() < deadline) {
      const s = await status(page)
      if (s?.room) return true
      if (!s || s.status === 'idle') {
        await page.keyboard.down('Space')
        await page.waitForTimeout(120)
        await page.keyboard.up('Space')
      }
      await page.waitForTimeout(400)
    }
    return false
  }
  const describe = (s) => (s ? `${s.status}${s.error ? `, "${s.error}"` : ''}` : 'no net')
  try {
    // The first copy opens a room before the second looks for one.
    const host = await open()
    await enterRoom(host)
    const guest = await open()
    await enterRoom(guest)
    const playing = () => window.__kitNet?.status === 'playing' && window.__kitNet.players.length >= 2
    const met = await Promise.all([host, guest].map((p) => p.waitForFunction(playing, null, { timeout: NET_MEET_MS }).then(() => true, () => false)))
    if (!met.every(Boolean)) {
      const s = await Promise.all([host, guest].map(status))
      if (s.some((x) => !x)) errors.push('this online game never created its net (createNet from net.js), so two copies could not meet')
      else
        errors.push(
          `two copies of the game didn't get into a match together within ${NET_MEET_MS / 1000}s (first: ${describe(s[0])}; second: ${describe(s[1])}). ` +
            `Keep the flow from the online template: title (A starts) → lobby (lobby.update) → play when it returns "start"`
        )
      return { errors, warnings }
    }
    const before = relay.stats.bytes
    await guest.waitForTimeout(NET_PLAY_MS)
    const perSecond = Math.round(((relay.stats.bytes - before) / NET_PLAY_MS) * 1000)
    const received = await guest.evaluate(() => JSON.stringify(window.__kitNet.state) !== '{}')
    if (!received) errors.push("the second player never received any game state. On the host, write what players need to see into net.state (net.js sends the changes)")
    // Private views (net.privateView(id)), when the game uses them, reach their player.
    const secret = await host.evaluate(() => {
      const net = window.__kitNet
      const id = net.players.find((p) => p !== net.me)
      return id && net.privateViews?.[id] && JSON.stringify(net.privateViews[id], (_k, x) => (typeof x === 'number' ? Math.round(x * 100) / 100 : x))
    })
    if (secret && secret !== '{}') {
      const mine = await guest.evaluate(() => JSON.stringify(window.__kitNet.mine ?? {}))
      if (mine !== secret) errors.push("the second player's net.mine doesn't match what the host wrote with net.privateView(id)")
    }
    if (perSecond > NET_WARN_BYTES_PER_SEC) {
      warnings.push(`two players used about ${Math.round(perSecond / 1024)} KB/s through the relay; aim for under ${NET_WARN_BYTES_PER_SEC / 1024} KB/s. Keep net.state to what players must see, and key things by id instead of array position`)
    }
  } catch (err) {
    errors.push(`the two-player online check failed: ${err.message}`)
  } finally {
    await Promise.all(contexts.map((c) => c.close()))
  }
  return { errors, warnings }
}

/**
 * Party games: the TV opens its party, phones join through the real join page, and the TV starts.
 * Checks that every phone got the controller, that phone controls reach party.inputs, that each
 * phone sees exactly its own party.view(id), and that a reloaded phone gets its seat back.
 */
async function partyCheck(browser, server, entry, relay, manifest) {
  const errors = []
  const warnings = []
  const contexts = []
  const count = Math.max(2, Math.min(4, Number(String(manifest.players ?? '2').split('-')[0]) || 2))
  const party = (page) => page.evaluate(() => window.__kitParty && { status: window.__kitParty.status, error: window.__kitParty.error, code: window.__kitParty.code, joinUrl: window.__kitParty.joinUrl, players: window.__kitParty.players.length, started: !window.__kitParty.public.lobby }).catch(() => null)
  const controllerFrame = (page) => page.frames().find((f) => f.url().endsWith('/frame.html'))
  const ctl = async (page, fn, arg) => {
    const frame = controllerFrame(page)
    return frame ? frame.evaluate(fn, arg).catch(() => null) : null
  }
  /** Wait for fn to return something truthy, polling; null on timeout. */
  const until = async (fn, ms = NET_MEET_MS) => {
    const deadline = Date.now() + ms
    while (Date.now() < deadline) {
      const v = await fn()
      if (v) return v
      await new Promise((r) => setTimeout(r, 200))
    }
    return null
  }
  // A view as the phones get it: numbers rounded like snapshot() in net.js.
  const round = (v) => JSON.stringify(v ?? {}, (_k, x) => (typeof x === 'number' ? Math.round(x * 100) / 100 : x))
  try {
    const tvContext = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
    contexts.push(tvContext)
    await tvContext.addInitScript(() => (window.__kitPartyTest = true))
    const tv = await tvContext.newPage()
    tv.on('pageerror', (err) => errors.push(`the game crashed during the party check: ${err.message}`))
    await tv.goto(`${server.url}/${entry}`, { waitUntil: 'load', timeout: 20_000 })
    const opened = await until(async () => {
      const s = await party(tv)
      if (s?.code) return s
      if (!s || s.status === 'idle') {
        await tv.keyboard.down('Space')
        await tv.waitForTimeout(120)
        await tv.keyboard.up('Space')
      }
      return null
    })
    if (!opened) {
      const s = await party(tv)
      errors.push(s ? `the party never opened (${s.status}${s.error ? `, "${s.error}"` : ''}). Keep the flow from the party template: title (A) → lobby.open()` : 'this party game never created its party (createParty from party.js)')
      return { errors, warnings }
    }
    if (!opened.joinUrl) errors.push('the party has no join link, so the lobby has no QR code')

    // Phones join through the join page, as people would.
    const phones = []
    for (let i = 0; i < count; i++) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
      contexts.push(context)
      const page = await context.newPage()
      page.on('pageerror', (err) => errors.push(`the phone controller crashed: ${err.message}`))
      await page.goto(`${relay.joinBase}/j/${opened.code}`, { waitUntil: 'load', timeout: 20_000 })
      await page.fill('#name', `Phone ${i + 1}`)
      await page.click('#go')
      phones.push(page)
    }
    const ids = []
    for (const [i, page] of phones.entries()) {
      const id = await until(() => ctl(page, () => window.controller?.me?.id))
      if (!id) {
        const notice = await page.textContent('#notice-text').catch(() => '')
        errors.push(`phone ${i + 1} joined but never got the game's controller ("${notice}"). Party games need a controller.html next to index.html (npm run new-game --party makes one)`)
        return { errors, warnings }
      }
      ids.push(id)
    }
    const started = await until(async () => (await party(tv))?.started, NET_MEET_MS)
    if (!started) errors.push(`with ${count} phones in, the party lobby never started the game. Keep lobby.update() from party-lobby.js and start when it returns "start"`)

    // Controls: a phone's input reaches the TV.
    await ctl(phones[0], () => window.controller.input({ x: 1, y: 0, a: true }))
    const moved = await until(() => tv.evaluate((id) => window.__kitParty.inputs[id]?.x === 1, ids[0]), 3000)
    if (!moved) errors.push("a phone's controller.input({ x: 1 }) never showed up in party.inputs on the TV")
    await ctl(phones[0], () => window.controller.input({}))

    // Private views: each phone sees exactly what the TV wrote for it.
    await tv.waitForTimeout(600)
    for (const [i, page] of phones.entries()) {
      const same = await until(async () => {
        const theirs = await ctl(page, () => JSON.stringify(window.controller.mine))
        const ours = await tv.evaluate((id) => window.__kitParty.views[id] ?? {}, ids[i]).then(round)
        return theirs !== null && JSON.stringify(JSON.parse(theirs)) === ours
      }, 3000)
      if (!same) errors.push(`phone ${i + 1} doesn't show its own party.view(id) (what the TV wrote for it): check that the game writes views by player id`)
    }

    // A latecomer, after the game started: the TV sends it everything at once, before and
    // while its controller page arrives, and it must still end up with its own view.
    const maxPlayers = Number(String(manifest.players ?? '').split('-').at(-1)) || count
    if (maxPlayers > count) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
      contexts.push(context)
      const late = await context.newPage()
      late.on('pageerror', (err) => errors.push(`the phone controller crashed: ${err.message}`))
      await late.goto(`${relay.joinBase}/j/${opened.code}`, { waitUntil: 'load', timeout: 20_000 })
      await late.fill('#name', 'Latecomer')
      await late.click('#go')
      const id = await until(() => ctl(late, () => window.controller?.me?.id))
      const same =
        id &&
        (await until(async () => {
          const theirs = await ctl(late, () => JSON.stringify(window.controller.mine))
          const ours = await tv.evaluate((pid) => window.__kitParty.views[pid] ?? {}, id).then(round)
          return theirs !== null && JSON.stringify(JSON.parse(theirs)) === ours
        }, 3000))
      if (!same) errors.push("a phone that joined after the game started doesn't show its own party.view(id)")
    }

    // A phone that reloads (or locks and comes back) gets its seat back.
    const before = relay.stats.bytes
    await phones[0].reload({ waitUntil: 'load' })
    const back = await until(() => ctl(phones[0], () => window.controller?.me?.id))
    if (back !== ids[0]) errors.push(`a phone that reloaded came back as ${back ?? 'nobody'} instead of its old seat ${ids[0]}`)
    await tv.waitForTimeout(NET_PLAY_MS)
    const perSecond = Math.round(((relay.stats.bytes - before) / (NET_PLAY_MS + 1000)) * 1000)
    if (perSecond > NET_WARN_BYTES_PER_SEC * count) {
      warnings.push(`${count} phones used about ${Math.round(perSecond / 1024)} KB/s through the relay. Keep party.public and views to what phones show; the game itself stays on the TV`)
    }
  } catch (err) {
    errors.push(`the party check failed: ${err.message}`)
  } finally {
    await Promise.all(contexts.map((c) => c.close()))
  }
  return { errors, warnings }
}

/** True when the screen is a single flat color (nothing drawn, or a crash to black). */
async function looksBlank(page, png) {
  return page.evaluate(async (dataUrl) => {
    const img = new Image()
    img.src = dataUrl
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 100
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, 160, 100)
    const { data } = ctx.getImageData(0, 0, 160, 100)
    const counts = new Map()
    for (let i = 0; i < data.length; i += 4) {
      const key = `${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    // Ignore single stray samples (scaling noise); anything else drawn counts.
    return [...counts.values()].filter((n) => n >= 2).length <= 1
  }, `data:image/png;base64,${png.toString('base64')}`)
}

/** @font-face rules for ART_FONTS, served by the local server. */
function fontFaces(base) {
  return Object.entries(ART_FONTS)
    .flatMap(([family, [pkg, weights]]) =>
      weights.map(
        (w) => `@font-face{font-family:'${family}';font-weight:${w};src:url(${base}/__fonts/${pkg}/files/${pkg}-latin-${w}-normal.woff2) format('woff2')}`
      )
    )
    .join('\n')
}

/** Render the game's own art (svg/html/image) at the exact size, or generate it from the screenshot. */
async function renderArt(browser, server, manifest, kind, target) {
  const size = ART[kind]
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 })
  try {
    const source = manifest.art?.[kind]
    if (source && /\.(svg|html)$/i.test(source)) {
      // Open SVG/HTML as a document (not an <img>) so it can use the bundled fonts.
      await page.goto(`${server.url}/__src/${encodeURI(source)}`, { waitUntil: 'load' })
      await page.evaluate(async (css) => {
        const doc = document.documentElement
        const style =
          doc.namespaceURI === 'http://www.w3.org/2000/svg'
            ? document.createElementNS('http://www.w3.org/2000/svg', 'style')
            : document.createElement('style')
        style.textContent = css
        ;(document.head ?? doc).appendChild(style)
        await Promise.all([...document.fonts].map((f) => f.load().catch(() => {})))
        await document.fonts.ready
      }, fontFaces(server.url))
    } else if (source) {
      await page.setContent(
        `<style>html,body{margin:0;background:#000}img{display:block;width:${size.width}px;height:${size.height}px;object-fit:cover}</style>` +
          `<img src="${server.url}/__src/${encodeURI(source)}">`
      )
      await page.locator('img').evaluate((img) => img.decode())
    } else {
      await page.setContent(fallbackArt(kind, manifest.name, server.url, size))
      await page.evaluate(() => document.fonts.ready)
      await page.locator('img').evaluate((img) => img.decode())
    }
    await page.waitForTimeout(150)
    await page.screenshot({ path: target, clip: { x: 0, y: 0, ...size } })
  } finally {
    await page.close()
  }
}

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/** Screenshot + title. Used only when a game ships no art. */
function fallbackArt(kind, name, base, size) {
  const cover = kind === 'cover'
  return `<style>${fontFaces(base)}
    html,body{margin:0;width:${size.width}px;height:${size.height}px;overflow:hidden;background:#0d0f14}
    img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(1.1)}
    .shade{position:absolute;inset:0;background:linear-gradient(to top,rgba(13,15,20,.92),rgba(13,15,20,.15) 65%)}
    h1{position:absolute;left:36px;right:36px;bottom:120px;margin:0;color:#fff;
      font:700 64px/1 'Chakra Petch',sans-serif;text-shadow:0 2px 12px rgba(0,0,0,.5)}
  </style><img src="${base}/${ART_DIR}/screenshot.png"><div class="shade"></div>${cover ? `<h1>${escapeHtml(name)}</h1>` : ''}`
}

/** Zip the build and copy art next to it under release-asset names. */
function packageGame(id, out) {
  mkdirSync(distDir, { recursive: true })
  const zip = join(distDir, `${id}-web.zip`)
  rmSync(zip, { force: true })
  const result = spawnSync('zip', ['-qr', '-X', zip, '.'], { cwd: out, encoding: 'utf8' })
  if (result.status !== 0) throw new GameError(id, `zip failed: ${result.stderr}`)

  const files = { web: describeFile(zip) }
  for (const kind of ['cover', 'hero', 'screenshot']) {
    const dest = join(distDir, `${id}-${kind}.png`)
    copyFileSync(join(out, ART_DIR, `${kind}.png`), dest)
    files[kind] = describeFile(dest)
  }
  return files
}

function describeFile(path) {
  return {
    path,
    name: basename(path),
    size: statSync(path).size,
    sha256: createHash('sha256').update(readFileSync(path)).digest('hex')
  }
}
