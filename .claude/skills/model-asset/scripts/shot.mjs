// Render pages of a game to PNG with headless Chromium (WebGL via SwiftShader), for comparing assets
// with their reference and before/after. Works for any game (2D canvas, SVG, WebGL): it starts
// Vite on the game's folder (the repo root in a one-game repo,  in a collection), takes every shot, then stops it.
//
//   node .claude/skills/model-asset/scripts/shot.mjs <game-id> <outDir> "<page>|<name>.png[|options]" ...
//
// Each shot waits for document.title === 'ready' (asset galleries and viewers set it), unless options say:
//   wait=<ms>        just wait this long (for pages that never set 'ready', e.g. the game itself)
//   keys=Enter,Space press these keys first (e.g. to leave the title screen), then wait
//   size=WxH         viewport (default 1280x800)
// e.g. node .claude/skills/model-asset/scripts/shot.mjs my-game /tmp/shots \
//        "gallery.html?asset=hero&anim=run&frames=8|hero-run.png" "index.html|play.png|keys=Enter|wait=2500"
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const [id, outDir, ...shots] = process.argv.slice(2)
if (!id || !outDir || !shots.length) {
  console.error('usage: shot.mjs <game-id> <outDir> "<page>|<name>.png[|wait=ms][|keys=Enter][|size=1280x800]" ...')
  process.exit(1)
}
mkdirSync(outDir, { recursive: true })
const { chromium } = await import(path.join(root, '.github/pushplay/node_modules/playwright-core/index.mjs'))
const port = 5300 + Math.floor(Math.random() * 400)
const gameDir = existsSync(path.join(root, 'games', id)) ? `games/${id}` : '.'
const vite = spawn('npx', ['vite', gameDir, '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' })
const base = `http://localhost:${port}/`
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(base)).ok) break
  } catch {}
  await new Promise((r) => setTimeout(r, 500))
}
// Use the preinstalled Chromium when there is one (cloud sandboxes), otherwise Playwright's own.
const exe = ['/opt/pw-browsers/chromium'].find(existsSync)
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
let failed = null
try {
  for (const shot of shots) {
    const [url, name, ...rest] = shot.split('|')
    const opt = Object.fromEntries(rest.map((o) => o.split('=')))
    const [w, h] = (opt.size ?? '1280x800').split('x').map(Number)
    const page = await browser.newPage({ viewport: { width: w, height: h } })
    failed = null
    page.on('pageerror', (e) => {
      console.log('pageerror:', e.message)
      failed ??= e.message
    })
    page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && console.log('console:', m.text().slice(0, 200)))
    await page.goto(base + url)
    if (opt.keys) {
      await page.waitForTimeout(800)
      for (const k of opt.keys.split(',')) {
        await page.keyboard.press(k)
        await page.waitForTimeout(250)
      }
    }
    if (opt.wait || opt.keys) await page.waitForTimeout(+(opt.wait ?? 1500))
    else {
      let tick
      try {
        await Promise.race([
          page.waitForFunction(() => document.title === 'ready', null, { timeout: 120000 }),
          new Promise((_, reject) => {
            tick = setInterval(() => failed && reject(new Error(`page error: ${failed}`)), 200)
          })
        ])
      } finally {
        clearInterval(tick)
      }
      await page.waitForTimeout(300)
    }
    const file = path.join(outDir, name)
    await page.screenshot({ path: file })
    console.log('wrote', file)
    await page.close()
  }
} finally {
  await browser.close()
  vite.kill()
}
