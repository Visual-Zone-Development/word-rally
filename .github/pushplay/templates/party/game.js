// {{NAME}}: party starter. The game runs here, on the TV; players join from their phones
// (controller.html) or with controllers plugged into this machine. Replace startRound(),
// playUpdate() and drawPlay() with the real game and keep the screens:
// title (Start a party / Settings), lobby (party-lobby.js), pause (Resume / Settings / End party), settings.
//
// What each player sees:
//   party.public       every phone (the prompt, the choices, whose turn it is)
//   party.view(id)     only that player's phone (their secret, their hand, their score)
//   everything else    only the TV
import { input } from './input.js'
import { createMenu } from './menu.js'
import { fitCanvas } from './fit.js'
import { createAudio } from './audio.js'
import { createSettings } from './save.js'
import { createSettingsScreen } from './settings.js'
import { drawPrompts } from './prompts.js'
import { createParty } from './party.js'
import { createPartyLobby, drawJoinBadge } from './party-lobby.js'

const ID = '{{ID}}'
const W = 1280
const H = 800
const canvas = document.getElementById('game')
const fit = fitCanvas(canvas, { w: W, h: H, letterbox: '#0d0f14' })
const ctx = fit.ctx
input.attach(canvas, W, H)

const settings = createSettings(ID) // <id>-settings-v1: volumes, reduced shake, text size
const audio = createAudio({ settings })

/** Numbers worth tuning live here so they're easy to find (and to change from the ?debug console). */
const TUNING = { speed: 420, radius: 26 }
const CHOICES = ['Red', 'Blue', 'Green', 'Gold']
const SECRETS = ['banana', 'rocket', 'teapot', 'cactus', 'walrus', 'lantern', 'pickle', 'comet']

const party = createParty({ input, minPlayers: {{MIN_PLAYERS}}, maxPlayers: {{MAX_PLAYERS}} })
const lobby = createPartyLobby(party, input, { title: '{{NAME}}' })

const state = {
  screen: 'title', // title | lobby | playing | paused | settings
  from: 'title', // where Settings returns to
  resumeTo: 'lobby',
  /** TV-only game state: phones never see this. */
  dots: {},
  picks: {}
}
// The check presses Start and expects state.screen 'paused', taps titleMenu's first item, and clicks PAUSE_BUTTON.
window.__game = { state, TUNING, party, settings, get titleMenu() { return titleMenu }, get pauseMenu() { return pauseMenu }, pauseButton: { x: W - 88, y: 32, w: 56, h: 56 } }
const debug = new URLSearchParams(location.search).has('debug')

const titleMenu = createMenu(
  [
    { id: 'play', label: 'Start a party' },
    { id: 'settings', label: 'Settings' }
  ],
  { y: H / 2 + 20 }
)
const pauseMenu = createMenu(
  [
    { id: 'resume', label: 'Resume' },
    { id: 'settings', label: 'Settings' },
    { id: 'title', label: 'End party' }
  ],
  { y: H / 2 - 40 }
)
const settingsScreen = createSettingsScreen({ settings, audio })

const PAUSE_BUTTON = window.__game.pauseButton
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h

input.onPause(() => {
  if (state.screen === 'playing') pause()
})

party.on('join', (p) => {
  audio.tone({ freq: 660, dur: 0.08, slide: 200 })
  // Joined mid-game: give them a seat at the table.
  if (state.screen === 'playing' || state.screen === 'paused') deal(p)
})
party.on('leave', (p) => delete state.dots[p.id])
// Phones send choices with controller.send(...).
party.on('msg', ({ from, data }) => {
  if (state.screen !== 'playing' || typeof data?.pick !== 'number') return
  state.picks[from] = data.pick
  party.view(from).picked = data.pick
  audio.tone({ freq: 520 + data.pick * 80, dur: 0.06 })
})
party.on('end', () => {
  if (state.screen === 'playing') state.screen = 'lobby'
})

function openLobby() {
  lobby.open()
  state.screen = 'lobby'
}
function pause() {
  state.resumeTo = state.screen
  pauseMenu.select('resume')
  state.screen = 'paused'
  party.public.paused = true
}
function resume() {
  state.screen = state.resumeTo
  party.public.paused = false
}
function openSettings(from) {
  state.from = from
  state.screen = 'settings'
}
function endParty() {
  party.close() // phones are told the game ended
  state.screen = 'title'
}

function startRound() {
  state.dots = {}
  state.picks = {}
  party.public.prompt = 'Pick a colour!'
  party.public.choices = CHOICES
  party.public.paused = false
  for (const p of party.players) deal(p)
}

/** A dot on the TV, and a secret only this player's phone shows. */
function deal(p) {
  const slot = party.slot(p.id)
  state.dots[p.id] = { x: W / 2 + (slot - (party.players.length - 1) / 2) * 110, y: H / 2 + 40 }
  party.view(p.id).secret = SECRETS[Math.floor(Math.random() * SECRETS.length)]
  delete party.view(p.id).picked
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function update(dt) {
  party.update()
  switch (state.screen) {
    case 'title': {
      const choice = titleMenu.update(input, dt)
      if (choice === 'play') openLobby()
      if (choice === 'settings') openSettings('title')
      break
    }
    case 'settings':
      if (settingsScreen.update(input, dt) === 'back') state.screen = state.from
      break
    case 'lobby': {
      if (input.pressed('menu')) {
        pause()
        break
      }
      const result = lobby.update()
      if (result === 'start') {
        startRound()
        state.screen = 'playing'
      }
      if (result === 'back') state.screen = 'title'
      break
    }
    case 'paused': {
      const choice = pauseMenu.update(input, dt)
      if (choice === 'resume' || choice === 'back') resume()
      if (choice === 'settings') openSettings('paused')
      if (choice === 'title') endParty()
      break
    }
    case 'playing':
      playUpdate(dt)
      break
  }
}

/** One frame of the game. Inputs look the same from a phone's pad and a local controller. */
function playUpdate(dt) {
  if (input.pointer.pressed && inside(input.pointer, PAUSE_BUTTON)) input.requestMenu()
  if (input.pressed('menu')) return pause()
  for (const p of party.players) {
    const dot = state.dots[p.id]
    if (!dot) continue
    const i = party.inputs[p.id] ?? {}
    dot.x = clamp(dot.x + (i.x ?? 0) * TUNING.speed * dt, TUNING.radius, W - TUNING.radius)
    dot.y = clamp(dot.y + (i.y ?? 0) * TUNING.speed * dt, 160, H - TUNING.radius)
    if (party.pressed(p.id, 'a')) {
      dot.pop = 1
      audio.tone({ freq: 880, dur: 0.05 })
    }
    dot.pop = Math.max(0, (dot.pop ?? 0) - dt * 4)
  }
}

const font = (weight, px) => `${weight} ${Math.round(px * settings.data.textScale)}px system-ui, sans-serif`

function draw() {
  ctx.save()
  ctx.fillStyle = '#141a2a'
  ctx.fillRect(0, 0, W, H)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  if (state.screen === 'title') {
    ctx.fillStyle = '#eef0f5'
    ctx.font = font(800, 84)
    ctx.fillText('{{NAME}}', W / 2, H / 2 - 150)
    ctx.font = font(500, 26)
    ctx.fillStyle = '#9aa3b5'
    ctx.fillText(`A party game for ${party.minPlayers}–${party.maxPlayers} players: join with your phone`, W / 2, H / 2 - 70)
    titleMenu.draw(ctx, font(600, 30))
    drawPrompts(ctx, input, [['a', 'Choose'], ['menu', 'Pause in game']], { size: 24 * settings.data.textScale })
  } else if (state.screen === 'settings') {
    settingsScreen.draw(ctx, { font: font(600, 28) })
    drawPrompts(ctx, input, [['left', 'Change'], ['b', 'Back']], { size: 24 * settings.data.textScale })
  } else if (state.screen === 'lobby') {
    lobby.draw(ctx, W, H)
  } else {
    drawPlay()
    if (state.screen === 'paused') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = '#eef0f5'
      ctx.font = font(700, 60)
      ctx.fillText('Paused', W / 2, H / 2 - 150)
      pauseMenu.draw(ctx, font(600, 30))
    }
  }
  ctx.restore()
  if (debug) drawDebug()
}

function drawPlay() {
  ctx.fillStyle = '#eef0f5'
  ctx.font = font(800, 44)
  ctx.fillText(party.public.prompt ?? '', W / 2, 80)
  // The TV shows how many picked each choice, never who: that's on their phones.
  const counts = CHOICES.map((_, i) => Object.values(state.picks).filter((p) => p === i).length)
  ctx.font = font(600, 24)
  ctx.fillStyle = '#9aa3b5'
  ctx.fillText(CHOICES.map((c, i) => `${c} ${counts[i]}`).join('     '), W / 2, 130)

  for (const p of party.players) {
    const dot = state.dots[p.id]
    if (!dot) continue
    ctx.globalAlpha = p.connected ? 1 : 0.35
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(dot.x, dot.y, TUNING.radius * (1 + (dot.pop ?? 0) * 0.4), 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#eef0f5'
    ctx.font = font(600, 22)
    ctx.fillText(p.name, dot.x, dot.y - TUNING.radius - 18)
    ctx.globalAlpha = 1
  }

  drawJoinBadge(ctx, party, 32, H - 90)
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.beginPath()
  ctx.roundRect(PAUSE_BUTTON.x, PAUSE_BUTTON.y, PAUSE_BUTTON.w, PAUSE_BUTTON.h, 12)
  ctx.fill()
  ctx.fillStyle = '#eef0f5'
  ctx.fillRect(PAUSE_BUTTON.x + 18, PAUSE_BUTTON.y + 16, 7, 24)
  ctx.fillRect(PAUSE_BUTTON.x + 31, PAUSE_BUTTON.y + 16, 7, 24)
  drawPrompts(ctx, input, [['menu', 'Pause']], { size: 22 * settings.data.textScale })
}

/** ?debug: live state in the corner. Add whatever helps while tuning. */
function drawDebug() {
  ctx.save()
  ctx.font = '500 16px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(8, 8, 380, 76)
  ctx.fillStyle = '#9fe'
  ctx.fillText(`screen ${state.screen}  mode ${input.mode}${input.gamingMode ? ' (gaming mode)' : ''}`, 16, 16)
  ctx.fillText(`fps ${fps.toFixed(0)}  scale ${fit.scale.toFixed(2)}  dpr ${fit.dpr}`, 16, 36)
  ctx.fillText(`party ${party.status}${party.code ? ` ${party.code}` : ''}  players ${party.players.length}`, 16, 56)
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
