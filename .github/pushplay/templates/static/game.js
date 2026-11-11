// {{NAME}}: starter game. Replace the gameplay in play()/drawPlay() and keep the screens:
// title (Play / Settings), pause (Resume / Restart / Settings / Quit to title), settings, game over.
// Everything works with a controller, a keyboard, a mouse and touch through the runtime modules.
import { input } from './input.js'
import { createMenu } from './menu.js'
import { fitCanvas } from './fit.js'
import { createAudio } from './audio.js'
import { createSave, createSettings } from './save.js'
import { createSettingsScreen } from './settings.js'
import { drawPrompts } from './prompts.js'
import { createTouchControls } from './touch.js'

const ID = '{{ID}}'
// The drawing space: 1280×800 (a Deck's screen), or a phone's 720×1280 / 1280×720 for a phone game.
const W = {{W}}
const H = {{H}}
/** A phone game: thumbs on glass, a notch and a home bar (fit.safe), text that reads at arm's length. */
const PHONE = {{PHONE}}
const canvas = document.getElementById('game')
const fit = fitCanvas(canvas, { w: W, h: H, letterbox: '#0d0f14'{{ORIENTATION}} })
const ctx = fit.ctx
input.attach(canvas, W, H)

const settings = createSettings(ID) // <id>-settings-v1: volumes, reduced shake, text size
const audio = createAudio({ settings })
const save = createSave(ID, 1, { best: 0 }) // <id>-save-v1
// On-screen stick and A button for touch play; they only show while the player uses touch.
const touch = createTouchControls(input, { buttons: ['a'], labels: { a: 'Boost' } })

/** Numbers worth tuning live here so they're easy to find (and to change from the ?debug console). */
const TUNING = { speed: 460, radius: 24, roundSeconds: 30, orbRadius: 18 }
/** Text sizes: phone text stays at 32px or more (the check's phone pass measures every fillText). */
const UI = PHONE ? 1.35 : 1
const PROMPT_SIZE = PHONE ? 44 : 24
const MENU_WIDTH = Math.min(PHONE ? 560 : 420, W - 120)

const state = {
  screen: 'title', // title | playing | paused | settings | gameover
  from: 'title', // where Settings returns to
  player: { x: W / 2, y: H / 2 },
  orb: { x: W / 3, y: H / 3 },
  score: 0,
  time: TUNING.roundSeconds,
  shake: 0
}
// The check presses Start and expects state.screen 'paused', taps titleMenu's first item, clicks
// and taps pauseButton, and taps pauseMenu's first item (Resume) on a phone.
window.__game = { state, TUNING, save, settings, get titleMenu() { return titleMenu }, get pauseMenu() { return pauseMenu }, get pauseButton() { return pauseButton() } }
const debug = new URLSearchParams(location.search).has('debug')

const menuOptions = { x: W / 2, width: MENU_WIDTH, height: PHONE ? 80 : 64, gap: PHONE ? 18 : 14 }
const titleMenu = createMenu(
  [
    { id: 'play', label: 'Play' },
    { id: 'settings', label: 'Settings' }
  ],
  { ...menuOptions, y: H / 2 + 20 }
)
const pauseMenu = createMenu(
  [
    { id: 'resume', label: 'Resume' },
    { id: 'restart', label: 'Restart' },
    { id: 'settings', label: 'Settings' },
    { id: 'title', label: 'Quit to title' }
  ],
  { ...menuOptions, y: H / 2 - 60 }
)
const overMenu = createMenu(
  [
    { id: 'again', label: 'Play again' },
    { id: 'title', label: 'Title' }
  ],
  { ...menuOptions, y: H / 2 + 40 }
)
const settingsScreen = createSettingsScreen({ settings, audio, x: W / 2, y: PHONE ? Math.max(190, fit.safe.top + 160) : 190, width: Math.min(680, W - 80) })

// On-screen pause button for mouse and touch players (a controller uses Start, a keyboard Esc).
// Top-right, inside the safe area (a phone's notch and corners), ≥ 56×56.
const pauseButton = () => ({ x: W - fit.safe.right - 88, y: fit.safe.top + 32, w: 56, h: 56 })
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h

// The launcher opened its overlay, the window lost focus or was hidden (a phone's screen locked),
// or every controller disconnected.
input.onPause(() => {
  if (state.screen === 'playing') pause()
})

function startRound() {
  Object.assign(state, { score: 0, time: TUNING.roundSeconds, shake: 0, screen: 'playing' })
  state.player = { x: W / 2, y: H / 2 }
  placeOrb()
}
function pause() {
  pauseMenu.select('resume')
  state.screen = 'paused'
  save.save()
}
function openSettings(from) {
  state.from = from
  state.screen = 'settings'
}
function placeOrb() {
  const s = fit.safe
  state.orb = { x: s.left + 80 + Math.random() * (W - s.left - s.right - 160), y: s.top + 120 + Math.random() * (H - s.top - s.bottom - 240) }
}
function endRound() {
  state.screen = 'gameover'
  overMenu.select('again')
  if (state.score > save.data.best) {
    save.data.best = state.score
    save.save()
  }
}

function update(dt) {
  touch.enabled = state.screen === 'playing'
  touch.update()
  switch (state.screen) {
    case 'title': {
      const choice = titleMenu.update(input, dt)
      if (choice === 'play') startRound()
      if (choice === 'settings') openSettings('title')
      return
    }
    case 'settings':
      if (settingsScreen.update(input, dt) === 'back') state.screen = state.from
      return
    case 'paused': {
      const choice = pauseMenu.update(input, dt)
      if (choice === 'resume' || choice === 'back') state.screen = 'playing'
      if (choice === 'restart') startRound()
      if (choice === 'settings') openSettings('paused')
      if (choice === 'title') state.screen = 'title'
      return
    }
    case 'gameover': {
      const choice = overMenu.update(input, dt)
      if (choice === 'again') startRound()
      if (choice === 'title' || choice === 'back') state.screen = 'title'
      return
    }
  }
  play(dt)
}

/** One frame of gameplay. */
function play(dt) {
  if (input.pointer.pressed && inside(input.pointer, pauseButton())) input.requestMenu()
  if (input.pressed('menu')) return pause()

  const p = state.player
  const speed = TUNING.speed * (input.held('a') ? 1.6 : 1)
  // Stick / keys / the on-screen stick move; a pointer (mouse, or a finger off the controls) drags the player towards it.
  let dx = input.x
  let dy = input.y
  if (input.pointer.down && !touch.active && (input.mode === 'mouse' || input.mode === 'touch')) {
    const ax = input.pointer.x - p.x
    const ay = input.pointer.y - p.y
    const d = Math.hypot(ax, ay)
    if (d > 8) (dx = ax / d), (dy = ay / d)
  }
  p.x = Math.max(TUNING.radius, Math.min(W - TUNING.radius, p.x + dx * speed * dt))
  p.y = Math.max(TUNING.radius, Math.min(H - TUNING.radius, p.y + dy * speed * dt))

  if (Math.hypot(state.orb.x - p.x, state.orb.y - p.y) < TUNING.radius + TUNING.orbRadius) {
    state.score++
    state.shake = settings.data.reducedShake ? 0 : 0.25
    audio.tone({ freq: 520 + state.score * 20, dur: 0.1, slide: 300 })
    placeOrb()
  }
  state.shake = Math.max(0, state.shake - dt)
  state.time -= dt
  if (state.time <= 0) {
    state.time = 0
    audio.tone({ freq: 220, dur: 0.4, type: 'triangle', slide: -120 })
    endRound()
  }
}

const font = (weight, px) => `${weight} ${Math.round(px * UI * settings.data.textScale)}px system-ui, sans-serif`
const promptSize = () => PROMPT_SIZE * settings.data.textScale
/** The title, sized to fit the width of the space. */
const titleFont = () => `800 ${Math.min(84, Math.floor(W / 8))}px system-ui, sans-serif`

function draw() {
  const safe = fit.safe
  ctx.save()
  if (state.shake > 0) ctx.translate((Math.random() - 0.5) * 12 * state.shake, (Math.random() - 0.5) * 12 * state.shake)
  ctx.fillStyle = '#141a2a'
  ctx.fillRect(-20, -20, W + 40, H + 40)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  if (state.screen === 'title') {
    ctx.fillStyle = '#eef0f5'
    ctx.font = titleFont()
    ctx.fillText('{{NAME}}', W / 2, H / 2 - 150)
    ctx.font = font(500, 26)
    ctx.fillStyle = '#9aa3b5'
    ctx.fillText(`Collect orbs for ${TUNING.roundSeconds} seconds${save.data.best ? ` · Best ${save.data.best}` : ''}`, W / 2, H / 2 - 70)
    titleMenu.draw(ctx, font(600, 30))
    drawPrompts(ctx, input, [['a', 'Choose'], ['menu', 'Pause in game']], { x: W / 2, y: H - safe.bottom - 40, size: promptSize() })
  } else if (state.screen === 'settings') {
    settingsScreen.draw(ctx, { font: font(600, 28) })
    drawPrompts(ctx, input, [['left', 'Change'], ['b', 'Back']], { x: W / 2, y: H - safe.bottom - 40, size: promptSize() })
  } else {
    drawPlay()
    if (state.screen === 'paused' || state.screen === 'gameover') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = '#eef0f5'
      ctx.font = font(700, 60)
      if (state.screen === 'paused') {
        ctx.fillText('Paused', W / 2, H / 2 - 150)
        pauseMenu.draw(ctx, font(600, 30))
      } else {
        ctx.fillText(`${state.score} orbs`, W / 2, H / 2 - 80)
        ctx.font = font(500, 28)
        ctx.fillStyle = '#c9cfdb'
        ctx.fillText(`Best ${save.data.best}`, W / 2, H / 2 - 20)
        overMenu.draw(ctx, font(600, 30))
      }
    }
  }
  ctx.restore()
  if (debug) drawDebug()
}

function drawPlay() {
  const safe = fit.safe
  ctx.fillStyle = '#5cc8ff'
  ctx.beginPath()
  ctx.arc(state.orb.x, state.orb.y, TUNING.orbRadius, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffb547'
  ctx.beginPath()
  ctx.arc(state.player.x, state.player.y, TUNING.radius, 0, Math.PI * 2)
  ctx.fill()

  // HUD inside the safe area: a phone's notch or rounded corners never cover it.
  ctx.fillStyle = '#eef0f5'
  ctx.font = font(700, 32)
  ctx.textAlign = 'left'
  ctx.fillText(`Orbs ${state.score}`, safe.left + 32, safe.top + 56)
  ctx.textAlign = 'right'
  ctx.fillStyle = state.time < 5 ? '#ff7a6b' : '#eef0f5'
  ctx.fillText(`${Math.ceil(state.time)}s`, W - safe.right - 120, safe.top + 56)
  if (state.screen === 'playing') {
    touch.draw(ctx)
    // Pause button: two bars, top-right, clear of the outermost 32px.
    const b = pauseButton()
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.beginPath()
    ctx.roundRect(b.x, b.y, b.w, b.h, 12)
    ctx.fill()
    ctx.fillStyle = '#eef0f5'
    ctx.fillRect(b.x + 18, b.y + 16, 7, 24)
    ctx.fillRect(b.x + 31, b.y + 16, 7, 24)
    // The on-screen controls say what A does; the prompt row is for the other devices.
    if (!touch.visible) drawPrompts(ctx, input, [['a', 'Boost'], ['menu', 'Pause']], { x: W / 2, y: H - safe.bottom - 40, size: promptSize() })
  }
}

/** ?debug: live state in the corner. Add whatever helps while tuning. */
function drawDebug() {
  ctx.save()
  ctx.font = '500 16px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(8, 8, 320, 76)
  ctx.fillStyle = '#9fe'
  ctx.fillText(`screen ${state.screen}  mode ${input.mode}${input.gamingMode ? ' (gaming mode)' : ''}`, 16, 16)
  ctx.fillText(`fps ${fps.toFixed(0)}  scale ${fit.scale.toFixed(2)}  dpr ${fit.dpr}  ${fit.orientation}`, 16, 36)
  ctx.fillText(`pointer ${input.pointer.x.toFixed(0)},${input.pointer.y.toFixed(0)}  pads ${input.pads.filter((p) => p.connected).length}`, 16, 56)
  ctx.restore()
}

let last = performance.now()
let fps = 60
function frame(now) {
  const dt = Math.min(1 / 20, (now - last) / 1000)
  last = now
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05
  input.update(dt)
  update(dt)
  draw()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
