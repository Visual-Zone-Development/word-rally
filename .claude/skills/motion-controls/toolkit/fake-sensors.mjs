// Drive a party game's controller.html with a fake sensor stream, headlessly, to test gestures
// without a phone. It loads the page with a stub `controller`, posts sensor samples the way the
// join page does, and collects what the page sends.
//
//   node .claude/skills/motion-controls/toolkit/fake-sensors.mjs controller.html
//   (or public/controller.html in a --vite game). Edit the scenarios at the bottom for your gestures.
//
// A scenario is a function of time t (s) returning { a: [x, y, z] m/s² without gravity,
// w: [alpha, beta, gamma] deg/s }, played at `rate` Hz with the phone held at `o` = [beta, gamma, alpha].
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(resolve('.github/pushplay/package.json'))
const { chromium } = require('playwright')

const file = resolve(process.argv[2] ?? '')
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.on('pageerror', (e) => console.log('page error:', e.message))
await page.addInitScript(() => {
  window.__sent = []
  window.__angle = 0
  Object.defineProperty(ScreenOrientation.prototype, 'angle', { get: () => window.__angle })
  window.controller = {
    public: { cfg: {} },
    mine: {},
    me: { name: 'Test', color: '#ffb547' },
    players: [],
    on() {},
    input(d) {
      window.__input = d
    },
    send(d) {
      window.__sent.push(d)
    },
    vibrate() {}
  }
})
await page.goto('file://' + file)
await page.evaluate(() => window.postMessage({ type: 'motion', state: 'on' }, '*'))

/** Play a scenario; returns what the page sent and the phone-clock time it started. */
export async function play(fn, { cfg = {}, mine = {}, pub = {}, o = [35, 0, 10], angle = 0, dur = 0.4, rate = 200 } = {}) {
  await page.waitForTimeout(1600) // keep scenarios apart in time (cooldowns, ordering)
  return page.evaluate(
    ({ src, cfg, mine, pub, o, angle, dur, rate }) => {
      const fn = eval(src)
      Object.assign(window.controller.public, pub, { cfg })
      Object.assign(window.controller.mine, mine)
      window.__angle = angle
      window.__sent = []
      const at = performance.now()
      const start = at - dur * 1000 - 300
      const s = []
      const still = (t) => ({ age: at - t, a: [0, 0, 0], g: [0, 0, 9.8], w: [0, 0, 0], o })
      for (let i = 0; i < 60; i++) s.push(still(start - 300 + i * 5))
      for (let i = 0; i <= dur * rate; i++) {
        const t = i / rate
        const { a, w } = fn(t)
        s.push({ age: at - (start + t * 1000), a, g: a.map((v, k) => v + (k === 2 ? 9.8 : 0)), w, o })
      }
      for (let i = 0; i < 30; i++) s.push(still(start + dur * 1000 + i * 5))
      window.postMessage({ type: 'motion', s }, '*')
      return start
    },
    { src: fn.toString(), cfg, mine, pub, o, angle, dur, rate }
  )
}
export const sent = () => page.evaluate(() => window.__sent)
export const input = () => page.evaluate(() => window.__input)

// ---- scenarios: edit for your game -----------------------------------------------------------
const report = async (label, start, want) => {
  await page.waitForTimeout(100)
  const swings = (await sent()).filter((d) => d.swing).map((d) => d.swing)
  if (!swings.length) return console.log(`${label}: no swing (want ${want})`)
  for (const s of swings) console.log(`${label}: dir ${s.dir}, power ${s.p}, at +${Math.round(s.pt - start)} ms (want ${want})`)
}
const flickRight = (t) => ({ a: [t < 0.2 ? 25 * Math.sin((2 * Math.PI * t) / 0.2) : 0, 0, 0], w: [0, 0, 0] })
const lift = (t) => ({ a: [0, 0, t < 0.2 ? 25 * Math.sin((2 * Math.PI * t) / 0.2) : 0], w: [0, 0, 0] })
const wristSwing = (t) => ({ a: [0.5, 0, 0], w: [0, t < 0.3 ? 700 * Math.sin((Math.PI * t) / 0.3) : 0, 0] })

await report('flick right, peak timing', await play(flickRight, { cfg: { thr: 12 } }), 'right at ~50 ms')
await report('flick right, bat timing', await play(flickRight, { cfg: { thr: 12, at: 'flip', cd: 600 } }), 'right at ~100 ms')
await report('flat phone lifted', await play(lift, { cfg: { thr: 12 }, o: [0, 0, 0] }), 'up')
await report('landscape flick', await play((t) => ({ a: [0, t < 0.2 ? -25 * Math.sin((2 * Math.PI * t) / 0.2) : 0, 0], w: [0, 0, 0] }), { cfg: { thr: 12 }, angle: 90 }), 'right')
await report('wrist swing (gyro)', await play(wristSwing, { cfg: { thr: 12, at: 'flip', cd: 600, gk: 1 / 30 } }), 'a swing at ~150 ms, dir null')
await browser.close()
