// Word Rally: three timed word games (Tangle, Lockword, Petal) behind one hub, played alone for a
// best score or live against friends in a room. match.js holds the rules and words.js the word
// logic; this file is the screens, the controls and the drawing.
//
// One canvas serves every screen shape: fitCanvas fills the window with a space whose short side is
// 720, and the game lays out "tall" (a phone held upright) or "wide" (Deck, desktop, a phone on
// its side) from the live size.
import { input } from './input.js'
import { createMenu } from './menu.js'
import { fitCanvas } from './fit.js'
import { createAudio } from './audio.js'
import { createSave, createSettings } from './save.js'
import { createSettingsScreen } from './settings.js'
import { createNet } from './net.js'
import { createMatch, TIMING } from './match.js'
import { GAMES, RULES, fitsPuzzle, isPangram, makeDict, petalPoints, solvePetal, solveTangle, tanglePoints, touching } from './words.js'
import { C, DISPLAY, FONT, GAME_LOOK, NAMES, PLAYER_COLORS, clamp, clock, inside, makeUi } from './ui.js'

const ID = 'word-rally'
/** Numbers worth tuning. The games' own rules (seconds, points) are in words.js and match.js. */
const TUNING = {
  rules: RULES,
  timing: TIMING,
  /** How close to a tile's centre a dragging finger must be to pick it (share of the tile), so diagonals are easy. */
  dragReach: 0.4,
  flashSeconds: 1.4,
  /** The clock turns red and ticks for this many final seconds. */
  lastSeconds: 10,
  confetti: 70,
  maxPetalWord: 14
}
const TEST = typeof window !== 'undefined' && Boolean(window.__kitNetTest) // the build check plays two copies with nobody at the controls
const debug = new URLSearchParams(location.search).has('debug')

// ---- The drawing space ------------------------------------------------------------------------

const canvas = document.getElementById('game')
const fit = fitCanvas(canvas, { w: 720, h: 720, fill: true, letterbox: C.bg })
const ctx = fit.ctx
input.attach(canvas, 720, 720)

/** The space screens are laid out in: at least 720×1240 when tall, 1120×720 when wide. */
const V = { w: 720, h: 1280, s: 1, wide: false, safe: { top: 0, right: 0, bottom: 0, left: 0 } }
function measure() {
  V.wide = fit.w / fit.h >= 1.25
  V.s = V.wide ? Math.min(1, fit.w / 1120) : Math.min(1, fit.h / 1240)
  V.w = fit.w / V.s
  V.h = fit.h / V.s
  for (const side of ['top', 'right', 'bottom', 'left']) V.safe[side] = fit.safe[side] / V.s
}

/** The mouse or finger in the layout space, and an input view that hands it to menu.js. */
const P = { x: 0, y: 0, down: false, pressed: false, released: false, active: false, type: 'mouse' }
const vin = Object.create(input)
Object.defineProperty(vin, 'pointer', { get: () => P })
function readPointer() {
  const p = input.pointer
  Object.assign(P, { x: p.x / V.s, y: p.y / V.s, down: p.down, pressed: p.pressed, released: p.released, active: p.active, type: p.type })
}

// Letters typed on a real keyboard (Lockword and Petal). The kit maps W, A, S, D and a few more
// to buttons, so while a letter key is down those buttons are ignored (see btn() and nav()).
const keyQueue = []
const heldLetters = new Set()
addEventListener('keydown', (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
  if (/^Key[A-Z]$/.test(e.code)) {
    keyQueue.push(e.code.slice(3).toLowerCase())
    heldLetters.add(e.code)
  } else if (e.code === 'Enter' || e.code === 'NumpadEnter') keyQueue.push('enter')
  else if (e.code === 'Backspace') keyQueue.push('back')
})
addEventListener('keyup', (e) => heldLetters.delete(e.code))
addEventListener('blur', () => heldLetters.clear())
/** This frame's typing: filled in at the top of update(). */
const K = { typing: false, keys: [], enter: false, busy: false, p: false }
const onKeys = () => input.mode === 'keyboard'
/** A button press, unless it really was a typed letter (or Enter / Backspace while typing). */
function btn(b) {
  if (K.typing && onKeys()) {
    if (K.busy || b === 'b' || (b === 'a' && K.enter)) return false
  }
  return input.pressed(b)
}
/** A or Space / Enter, but not a click or tap (those are handled where they land). */
const pressA = () => btn('a') && (input.mode === 'gamepad' || input.mode === 'keyboard')
const nav = () => (K.typing && onKeys() && K.busy ? { x: 0, y: 0 } : { x: input.navX, y: input.navY })
const menuPressed = () => input.pressed('menu') && !(K.typing && K.p)
const showCursor = () => input.mode === 'gamepad' || input.mode === 'keyboard'

// ---- Settings, saves, sound, words --------------------------------------------------------------

const settings = createSettings(ID, { name: Math.floor(Math.random() * NAMES.length) })
if (!Number.isInteger(settings.data.name)) settings.data.name = 0
const save = createSave(ID, 1, { best: { tangle: 0, lockword: 0, petal: 0, rally: 0 }, played: 0 })
const audio = createAudio({ settings })
const ui = makeUi(ctx, () => settings.data.textScale ?? 1)

let dict = null
let dictError = ''
fetch(new URL('assets/words.txt', document.baseURI))
  .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
  .then((text) => (dict = makeDict(text)))
  .catch(() => (dictError = "The word list didn't load."))
document.fonts?.load?.(`900 40px ${FONT}`)
document.fonts?.load?.(`400 40px ${DISPLAY}`)

const sfx = {
  move: () => audio.tone({ freq: 330, dur: 0.03, type: 'triangle', gain: 0.06 }),
  add: (n) => audio.tone({ freq: 392 * 2 ** (Math.min(n, 12) / 12), dur: 0.06, type: 'triangle', gain: 0.14 }),
  undo: () => audio.tone({ freq: 300, dur: 0.05, type: 'triangle', gain: 0.1, slide: -80 }),
  good(len) {
    const notes = [523, 659, 784, 1047, 1319, 1568]
    for (let i = 0; i < clamp(len - 2, 2, 6); i++) audio.tone({ freq: notes[i], dur: 0.1, type: 'triangle', gain: 0.16, delay: i * 0.055 })
  },
  bad: () => audio.tone({ freq: 170, dur: 0.16, type: 'square', gain: 0.1, slide: -60 }),
  tick: () => audio.tone({ freq: 880, dur: 0.04, type: 'square', gain: 0.07 }),
  count: () => audio.tone({ freq: 440, dur: 0.12, type: 'triangle', gain: 0.16 }),
  go: () => audio.tone({ freq: 660, dur: 0.22, type: 'triangle', gain: 0.18, slide: 330 }),
  end() {
    audio.noise({ dur: 0.25, gain: 0.08 })
    audio.tone({ freq: 392, dur: 0.3, type: 'triangle', gain: 0.16, slide: -130 })
  },
  win() {
    for (const [i, f] of [523, 659, 784, 1047, 784, 1047].entries()) audio.tone({ freq: f, dur: 0.14, type: 'triangle', gain: 0.16, delay: i * 0.09 })
  },
  flip: (i) => audio.tone({ freq: 500 + i * 60, dur: 0.05, type: 'sine', gain: 0.1, delay: i * 0.07 })
}

// ---- Who is playing: alone (a local session) or in a room (net.js) ------------------------------

const net = createNet({ minPlayers: 2, maxPlayers: 8 })
const local = {
  state: {},
  inputs: { you: {} },
  players: ['you'],
  away: [],
  started: true,
  priv: { you: {} },
  mine: (id) => (local.priv[id] ??= {})
}
let online = false
let match = null // the rules, on the host's copy (and in solo play)
let soloChoice = 'tangle' // what Play again repeats: a game, or 'rally'
const meId = () => (online ? net.me : 'you')
const view = () => (online ? net.view : local.state) ?? {}
const isHost = () => (online ? net.isHost : true)
const hostSession = () => (online ? { state: net.state, inputs: net.inputs, players: net.players, away: net.away, started: net.status === 'playing' || net.status === 'reconnecting', mine: (id) => net.privateView(id) } : local)
const colorOf = (id) => PLAYER_COLORS[Math.max(0, online ? net.slot(id) : 0) % PLAYER_COLORS.length]
const nameOf = (id, v = view()) => (id === meId() ? 'You' : (NAMES[v.p?.[id]?.nm] ?? 'Player'))
/** What the host has told only this player (Lockword: the words they have finished). */
const mineView = () => (online ? net.mine : local.priv.you) ?? {}
const sendInput = (value) => (online ? net.setInput(value) : (local.inputs.you = value))

const state = {
  screen: 'title', // title | lobby | playing | paused | settings | gameover
  from: 'title', // where Settings returns to
  resumeTo: 'playing', // where Resume returns to
  zone: 'menu' // where a controller's focus is on screens with tiles above a menu: 'grid' | 'menu'
}
/** Which tile has the focus on the home screen, in the room (the first game) and when picking the next game. */
const homePick = { focus: 0 }
const roomPick = { focus: 0 }
const nextPick = { focus: 0 }
let firstPending = false // the host started the match: play the game chosen in the room straight away
const CARDS = [...GAMES, 'rally']
const titleOf = (g) => (g === 'rally' ? 'Rally' : RULES[g].name)

/** What this player has done in the current round; reset whenever the round key changes. */
const my = { k: -1, words: [], guesses: [], cur: '', path: [], cursor: 5, drag: null, order: [1, 2, 3, 4, 5, 6], focus: 0, key: { r: 0, c: 0 }, wi: 0, wordStart: 0, skip: false, toastFor: 0, flash: null, shake: 0, summary: null, lastT: -1, phase: '', pop: 0 }
const floaters = []
const confetti = []
function resetRound(k) {
  Object.assign(my, { k, words: [], guesses: [], cur: '', path: [], cursor: 5, drag: null, order: [1, 2, 3, 4, 5, 6], focus: 0, key: { r: 0, c: 0 }, wi: 0, wordStart: 0, skip: false, toastFor: 0, flash: null, shake: 0, summary: null, lastT: -1 })
  floaters.length = 0
}
function flash(text, good) {
  my.flash = { text, good, t: TUNING.flashSeconds }
  if (!good && !settings.data.reducedShake) my.shake = 0.3
}

// ---- Menus (rebuilt whenever the window changes shape) -------------------------------------------

const M = {}
let settingsScreen = null
let lobbyKey = null
const MENU_H = 84
const MENU_GAP = 16
function makeMenu(items, { x = V.w / 2, y, width = Math.min(560, V.w - 96), quit } = {}) {
  return createMenu(items, { x, y, width, height: MENU_H, gap: MENU_GAP, accent: C.sun, text: C.text, idle: C.panelHi, ...(quit === undefined ? {} : { quitToLibrary: quit }) })
}
/** Top of a menu of n rows that ends at the bottom of the screen, inside the safe area. */
const fromBottom = (n) => V.h - V.safe.bottom - 24 - n * (MENU_H + MENU_GAP)
/**
 * Inside the launcher, menu.js adds "Quit to library" to the title and pause menus and moves them
 * up half a row. This is the y to ask for so that the longer menu still ends at the bottom.
 */
const IN_LAUNCHER = typeof globalThis.pushplay?.quit === 'function'
const fromBottomWithQuit = (n) => (IN_LAUNCHER ? fromBottom(n + 1) + (MENU_H + MENU_GAP) / 2 : fromBottom(n))
/** Wide screens keep menus in a column on the right. */
const sideX = () => V.w - V.safe.right - 48 - Math.min(440, V.w * 0.36) / 2
const sideW = () => Math.min(440, V.w * 0.36)
function buildMenus() {
  const wide = V.wide
  const side = wide ? { x: sideX(), width: sideW() } : {}
  M.title = makeMenu(
    [
      { id: 'play', label: 'Play with friends' },
      { id: 'settings', label: 'Settings' }
    ],
    { ...side, y: wide ? V.h / 2 - 100 : fromBottomWithQuit(2) }
  )
  // On a tall screen the pause menu is a sheet at the bottom, under the thumbs.
  M.pauseSolo = makeMenu(
    [
      { id: 'resume', label: 'Resume' },
      { id: 'restart', label: 'Restart' },
      { id: 'settings', label: 'Settings' },
      { id: 'title', label: 'Quit to title' }
    ],
    { y: wide ? V.h / 2 - 150 : fromBottomWithQuit(4) }
  )
  // No Restart online: the match belongs to everyone in the room.
  M.pauseOnline = makeMenu(
    [
      { id: 'resume', label: 'Resume' },
      { id: 'settings', label: 'Settings' },
      { id: 'title', label: 'Leave the match' }
    ],
    { y: wide ? V.h / 2 - 110 : fromBottomWithQuit(3) }
  )
  M.roomHost = makeMenu(
    [
      { id: 'start', label: 'Start', disabled: true },
      { id: 'leave', label: 'Close the room' }
    ],
    { ...side, y: fromBottom(2), quit: false }
  )
  M.roomGuest = makeMenu([{ id: 'leave', label: 'Leave the room' }], { ...side, y: fromBottom(1), quit: false })
  M.error = makeMenu(
    [
      { id: 'retry', label: 'Try again' },
      { id: 'back', label: 'Back' }
    ],
    { y: wide ? V.h / 2 + 20 : fromBottom(2), quit: false }
  )
  M.gameover = makeMenu(
    [
      { id: 'again', label: 'Play again' },
      { id: 'title', label: 'Back to the games' }
    ],
    { ...side, y: fromBottom(2), quit: false }
  )
  lobbyKey = null
  settingsScreen = createSettingsScreen({
    settings,
    audio,
    x: V.w / 2,
    y: wide ? 178 : Math.max(210, V.safe.top + 190),
    width: Math.min(700, V.w - 64),
    extra: [{ id: 'name', label: 'Your name online', type: 'choice', value: settings.data.name, options: NAMES.map((label, value) => ({ value, label })) }]
  })
}
/** Playing with friends, one screen: host a room, or join one of the open ones. Rebuilt only when the list changes. */
function lobbyMenu() {
  const rooms = net.rooms.slice(0, V.wide ? 3 : 4)
  const key = rooms.map((r) => `${r.id}:${r.players}`).join('|')
  if (key !== lobbyKey) {
    lobbyKey = key
    const items = [{ id: 'host', label: 'Host a room' }, ...rooms.map((r) => ({ id: `room:${r.id}`, label: `Join room ${r.id} · ${r.players} of ${r.max} in` })), { id: 'back', label: 'Back' }]
    M.lobby = makeMenu(items, { y: V.wide ? V.h / 2 - items.length * 50 + 60 : fromBottom(items.length), quit: false })
  }
  return M.lobby
}

/** menu.js input with only the pointer in it: used while a controller's focus is on a grid of tiles instead. */
const vinPointer = Object.create(vin)
Object.defineProperties(vinPointer, { navX: { get: () => 0 }, navY: { get: () => 0 } })
vinPointer.pressed = () => false

/** Menus in the game's own look: the main action is yellow; a focus ring shows only for a controller or keyboard. */
const PRIMARY = new Set(['play', 'start', 'again', 'resume', 'host', 'retry'])
function drawMenu(menu, focused = true) {
  menu.items.forEach((it, i) => ui.button(menu.rect(i), it.label, { kind: PRIMARY.has(it.id) ? 'primary' : 'plain', focus: focused && showCursor() && it === menu.selected, disabled: it.disabled, size: 34 }))
}

/** A grid of big tiles: tap or click one, or move a controller's focus over them and press. */
function pickTile(pk, rects, cols, active) {
  const out = { chosen: -1, leave: null }
  if (active) {
    const rows = Math.ceil(rects.length / cols)
    let c = pk.focus % cols
    let r = Math.floor(pk.focus / cols)
    const nx = input.navX
    const ny = input.navY
    if (nx) {
      if (c + nx < 0) out.leave = 'left'
      else if (c + nx >= cols) out.leave = 'right'
      else c += nx
    }
    if (ny) {
      if (r + ny < 0) out.leave = 'up'
      else if (r + ny >= rows) out.leave = 'down'
      else r += ny
    }
    const next = Math.min(rects.length - 1, r * cols + c)
    if (next !== pk.focus) {
      pk.focus = next
      sfx.move()
    }
    if (showCursor() && input.pressed('a')) out.chosen = pk.focus
  }
  if (P.released) {
    const i = rects.findIndex((r) => inside(P, r))
    if (i >= 0) {
      pk.focus = i
      out.chosen = i
    }
  }
  return out
}
/** Tiles above (or beside) a menu. A controller's focus moves between the two; taps and clicks reach both. */
function gridAndMenu(pk, rects, cols, menu, dt, edge = 'down') {
  let grid
  let choice
  if (state.zone === 'grid') {
    grid = pickTile(pk, rects, cols, true)
    if (grid.leave === edge) state.zone = 'menu'
    choice = menu.update(vinPointer, dt)
  } else {
    grid = pickTile(pk, rects, cols, false)
    const toGrid = edge === 'down' ? input.navY < 0 && menu.selected === menu.items.find((it) => !it.disabled) : input.navX < 0
    if (toGrid) {
      state.zone = 'grid'
      sfx.move()
    }
    choice = menu.update(toGrid ? vinPointer : vin, dt)
  }
  return { tile: grid.chosen, choice }
}
/** Four game buttons, two by two, ending at `bottom`. */
function gameRects(x, w, bottom) {
  const h = 84
  const gap = 12
  const bw = (w - gap) / 2
  return CARDS.map((_, i) => ({ x: x + (i % 2) * (bw + gap), y: bottom - 2 * h - gap + Math.floor(i / 2) * (h + gap), w: bw, h }))
}
const sideRect = () => ({ x: sideX() - sideW() / 2, w: sideW() })
const roomRects = () => (V.wide ? gameRects(sideRect().x, sideRect().w, M.roomHost.rect(0).y - 28) : gameRects(32, V.w - 64, M.roomHost.rect(0).y - 28))
const nextRects = () => (V.wide ? gameRects(sideRect().x, sideRect().w, V.h - V.safe.bottom - 32) : gameRects(32, V.w - 64, V.h - V.safe.bottom - 24))
function drawGameButtons(rects, pk, ring) {
  rects.forEach((r, i) => {
    const look = GAME_LOOK[CARDS[i]]
    ui.rect(r.x, r.y + 6, r.w, r.h - 6, 18, look.edge)
    ui.rect(r.x, r.y, r.w, r.h - 6, 18, look.color)
    ui.text(titleOf(CARDS[i]), r.x + r.w / 2, r.y + (r.h - 6) / 2 + 2, 34, C.ink, { align: 'center', weight: 900, max: r.w - 20 })
    if (ring && i === pk.focus) ui.rect(r.x - 5, r.y - 5, r.w + 10, r.h + 10, 22, null, C.tile, 5)
  })
}

measure()
buildMenus()
fit.onResize(() => {
  measure()
  buildMenus()
})

const pauseRect = () => ({ x: V.w - V.safe.right - 32 - 64, y: V.safe.top + 24, w: 64, h: 64 })
const pauseMenu = () => (online ? M.pauseOnline : M.pauseSolo)
// The check presses Start and expects state.screen 'paused', taps titleMenu's first item, and
// clicks / taps pauseButton (and pauseMenu's first item, Resume, on a phone). Rects are in fit units.
window.__game = {
  state,
  TUNING,
  net,
  settings,
  save,
  my,
  view,
  get titleMenu() {
    return M.title
  },
  get pauseMenu() {
    return pauseMenu()
  },
  get pauseButton() {
    const r = pauseRect()
    return { x: r.x * V.s, y: r.y * V.s, w: r.w * V.s, h: r.h * V.s }
  },
  host: () => hostSession(),
  get match() {
    return match
  },
  get layout() {
    return roundLayout(view())
  }
}

// ---- Moving between screens -------------------------------------------------------------------

// The launcher opened its overlay, the window lost focus or was hidden (a phone's screen locked),
// or every controller disconnected. Online the room carries on; net.js reconnects by itself.
input.onPause(() => {
  if (state.screen === 'playing' || state.screen === 'lobby') pause()
  save.save()
})

function pause() {
  state.resumeTo = state.screen
  pauseMenu().select('resume')
  state.screen = 'paused'
  save.save()
}
function resume() {
  if (online) state.screen = net.status === 'playing' || net.status === 'reconnecting' ? 'playing' : 'lobby'
  else state.screen = 'playing'
}
function openSettings(from) {
  state.from = from
  state.screen = 'settings'
}
function toTitle() {
  if (online) net.disconnect() // leaves the room (the others carry on) and hangs up
  online = false
  match = null
  state.zone = 'menu'
  state.screen = 'title'
}
function startSolo(choice) {
  if (!dict) return
  online = false
  soloChoice = choice
  local.state = {}
  local.inputs.you = {}
  local.priv = { you: {} }
  match = createMatch({ dict, solo: true })
  match.step(local, 0)
  match.choose(local, choice)
  resetRound(-1)
  save.data.played++
  state.screen = 'playing'
}
function openLobby() {
  if (!dict) return
  online = true
  match = null
  net.error = ''
  state.zone = 'menu'
  state.screen = 'lobby'
  if (TEST) void net.quickMatch()
  else void net.connect()
}

net.on('joined', () => {
  match = net.isHost && dict ? createMatch({ dict }) : null
  state.zone = 'menu'
  firstPending = false
  resetRound(-1)
  audio.tone({ freq: 660, dur: 0.08, slide: 200, type: 'triangle' })
})
net.on('join', () => audio.tone({ freq: 660, dur: 0.08, slide: 200, type: 'triangle' }))
net.on('start', () => sfx.go())
// The host left or the connection dropped: back to the lobby, which shows why.
function backToLobby() {
  if (!online) return
  if (state.screen === 'playing') state.screen = 'lobby'
  if (state.screen === 'paused') state.resumeTo = 'lobby'
  match = null
}
net.on('end', backToLobby)
net.on('disconnect', backToLobby)

// ---- Update ---------------------------------------------------------------------------------------

function update(dt) {
  readPointer()
  const v = view()
  const keys = keyQueue.splice(0)
  K.typing = state.screen === 'playing' && v.ph === 'round' && (v.g === 'lockword' || v.g === 'petal')
  K.keys = K.typing ? keys : [] // letters, 'enter' and 'back', in the order they were pressed
  K.enter = K.typing && keys.includes('enter')
  K.p = keys.includes('p')
  K.busy = K.typing && (keys.some((k) => k.length === 1) || heldLetters.size > 0)

  switch (state.screen) {
    case 'title':
      updateTitle(dt)
      break
    case 'settings':
      if (settingsScreen.update(vin, dt) === 'back') state.screen = state.from
      break
    case 'lobby':
      updateLobby(dt)
      break
    case 'paused': {
      const choice = pauseMenu().update(vin, dt)
      if (choice === 'resume' || choice === 'back') resume()
      if (choice === 'restart') startSolo(soloChoice)
      if (choice === 'settings') openSettings('paused')
      if (choice === 'title') toTitle()
      break
    }
    case 'playing':
      updatePlaying(dt)
      break
    case 'gameover': {
      const choice = M.gameover.update(vin, dt)
      if (choice === 'again') startSolo(soloChoice)
      if (choice === 'title' || choice === 'back') toTitle()
      break
    }
  }

  // Everyone keeps telling the host who they are and what they have found, paused or not.
  if (online || state.screen === 'playing') {
    const g = view().g
    sendInput(g === 'lockword' ? { nm: settings.data.name, k: my.k, g: my.guesses.join(',') } : { nm: settings.data.name, k: my.k, w: my.words.join(',') })
  }
  // The host keeps the match running for everyone, whatever screen it is on itself. Alone, the
  // world stops with the pause menu.
  if (online) {
    if (net.isHost && net.room && match) match.step(hostSession(), dt)
    net.update()
  } else if (match && state.screen === 'playing') match.step(local, dt)

  if (my.flash && (my.flash.t -= dt) <= 0) my.flash = null
  if (my.fx && (my.fx.t -= dt) <= 0) my.fx = null
  my.shake = Math.max(0, my.shake - dt)
  my.pop = Math.max(0, my.pop - dt * 5)
  for (let i = floaters.length - 1; i >= 0; i--) if ((floaters[i].t -= dt) <= 0) floaters.splice(i, 1)
  for (let i = confetti.length - 1; i >= 0; i--) {
    const c = confetti[i]
    c.x += c.vx * dt
    c.y += c.vy * dt
    c.vy += 500 * dt
    c.r += c.vr * dt
    if (c.y > V.h + 40) confetti.splice(i, 1)
  }
}

function updateTitle(dt) {
  // Tap, click or press a game tile to play it alone; the menu below (or beside) it is for friends and settings.
  const r = gridAndMenu(homePick, titleCards(), 2, M.title, dt, V.wide ? 'right' : 'down')
  if (r.tile >= 0) return startSolo(CARDS[r.tile])
  if (r.choice === 'play') openLobby()
  if (r.choice === 'settings') openSettings('title')
}

let lastRefresh = 0
let wasReady = false
function updateLobby(dt) {
  if (P.pressed && inside(P, pauseRect())) input.requestMenu()
  if (input.pressed('menu')) return pause()
  if (net.status === 'playing' || net.status === 'reconnecting') {
    state.screen = 'playing'
    return
  }
  if (net.status === 'connecting') return
  if (net.status === 'error') {
    const choice = M.error.update(vin, dt)
    if (choice === 'retry') {
      net.error = ''
      net.status = 'idle'
    } else if (choice === 'back') toTitle()
    return
  }
  if (net.room) {
    const ready = net.players.length >= net.minPlayers
    if (!net.isHost) {
      const choice = M.roomGuest.update(vin, dt)
      if (choice === 'leave' || choice === 'back') net.leave()
      return
    }
    // The host picks the first game here, so Start goes straight into it.
    M.roomHost.items[0].disabled = !ready
    M.roomHost.items[0].label = `Start ${titleOf(CARDS[roomPick.focus])}`
    net.state.fg = roomPick.focus
    if (ready && !wasReady) {
      M.roomHost.select('start')
      state.zone = 'menu'
    }
    wasReady = ready
    const r = gridAndMenu(roomPick, roomRects(), 2, M.roomHost, dt)
    if ((r.choice === 'start' || TEST) && ready) {
      firstPending = true
      return net.start()
    }
    if (r.choice === 'leave' || r.choice === 'back') net.leave()
    return
  }
  wasReady = false
  if (TEST) return
  if (net.status === 'idle') void net.connect()
  const now = performance.now()
  if (now - lastRefresh > 2000 && net.status === 'online') {
    lastRefresh = now
    net.refresh()
  }
  const choice = lobbyMenu().update(vin, dt)
  if (choice === 'host') {
    net.error = ''
    void net.host()
  } else if (choice === 'back') toTitle()
  else if (choice?.startsWith('room:')) void net.join(choice.slice(5))
}

function updatePlaying(dt) {
  if (P.pressed && inside(P, pauseRect())) input.requestMenu()
  if (menuPressed()) return pause()
  const v = view()
  if (Number.isInteger(v.k) && v.k !== my.k) resetRound(v.k)
  // How many words this puzzle holds, counted once while the countdown runs.
  if (dict && v.pz && my.totalFor !== v.k && v.g !== 'lockword') {
    my.total = (v.g === 'tangle' ? solveTangle(dict, v.pz) : solvePetal(dict, v.pz)).length
    my.totalFor = v.k
  }
  if (v.ph !== my.phase) {
    if (v.ph === 'round') sfx.go()
    if (v.ph === 'results') {
      sfx.end()
      my.path = []
      my.drag = null
    }
    my.phase = v.ph
    my.phaseAt = performance.now()
    my.lastT = -1
  }
  if (v.t !== my.lastT) {
    if (v.ph === 'count') sfx.count()
    if (v.ph === 'round' && v.t <= TUNING.lastSeconds && v.t > 0) sfx.tick()
    my.lastT = v.t
  }

  if (v.ph === 'pick' && online && net.isHost && match && firstPending) {
    firstPending = false
    return match.choose(hostSession(), CARDS[roomPick.focus])
  }
  if (v.ph === 'round') {
    const L = roundLayout(v)
    if (v.g === 'tangle') playTangle(v, L)
    else if (v.g === 'petal') playPetal(v, L)
    else playLockword(v, L)
  } else if (v.ph === 'results') {
    if (!my.summary) my.summary = summarize(v)
    const last = v.final && !v.rally
    if (!online && last) return finishSolo(v)
    if (!online && match && v.t > 0 && (pressA() || P.pressed)) match.next(local) // alone, there is nobody to wait for
  }
  // The host picks the next game straight from the results (after a moment, so a stray press can't pick one).
  if (hostPicks(v) && performance.now() - (my.phaseAt ?? 0) > 1200) {
    const r = pickTile(nextPick, nextRects(), 2, true)
    if (r.chosen >= 0) match.choose(hostSession(), CARDS[r.chosen])
  }
}
const hostPicks = (v) => online && net.isHost && Boolean(match) && (v.ph === 'pick' || (v.ph === 'results' && v.final === 1 && v.t === 0))

function finishSolo(v) {
  const p = v.p?.you ?? {}
  const key = soloChoice
  const score = key === 'rally' ? p.tot : p.gs
  my.newBest = score > (save.data.best[key] ?? 0)
  if (my.newBest) {
    save.data.best[key] = score
    burst()
    sfx.win()
  }
  save.save()
  M.gameover.select('again')
  state.screen = 'gameover'
}

function burst() {
  if (settings.data.reducedShake) return
  for (let i = 0; i < TUNING.confetti; i++) {
    confetti.push({ x: V.w / 2 + (Math.random() - 0.5) * V.w * 0.5, y: V.h * 0.25, vx: (Math.random() - 0.5) * 700, vy: -300 - Math.random() * 500, r: Math.random() * 6, vr: (Math.random() - 0.5) * 12, c: PLAYER_COLORS[i % 6] })
  }
}

// ---- Playing a round: the three games' controls --------------------------------------------------

function tryWord(v, word) {
  const g = v.g
  const tiles = g === 'tangle' ? [...my.path] : []
  const fail = (text) => {
    flash(text, false)
    my.fx = { tiles, good: false, t: 0.45 }
    sfx.bad()
    return false
  }
  if (word.length < RULES[g].min) return fail(g === 'petal' ? 'Four letters or more' : 'Three letters or more')
  if (g === 'petal' && !word.includes(v.pz[0])) return fail('Needs the middle letter')
  if (my.words.includes(word)) return fail('Already found')
  if (!dict?.has(word) || !fitsPuzzle(g, v.pz, word)) return fail('Not in the word list')
  my.words.push(word)
  const pts = g === 'tangle' ? tanglePoints(word) : petalPoints(word, v.pz)
  const all = g === 'petal' && isPangram(word, v.pz)
  my.flash = null
  my.fx = { tiles, good: true, t: 0.45 }
  floaters.push({ text: all ? `All seven! +${pts}` : `+${pts}`, t: 1.1, tile: tiles.at(-1) })
  my.pop = 1
  if (input.mode === 'touch' && !settings.data.reducedShake) navigator.vibrate?.(pts >= 7 ? [20, 40, 30] : 18)
  sfx.good(word.length + (all ? 3 : 0))
  return true
}

const pathWord = (v) => my.path.map((i) => v.pz[i]).join('')
function submitPath(v) {
  if (my.path.length) tryWord(v, pathWord(v))
  my.path = []
}
/** Pick a tile with a button press or a single tap: extend the path, step back, or play the word. */
function tapTile(v, i) {
  const last = my.path.at(-1)
  if (!my.path.length) my.path = [i]
  else if (i === last) {
    if (my.path.length >= RULES.tangle.min) return submitPath(v)
    my.path.pop()
    return sfx.undo()
  } else if (my.path.includes(i)) my.path = my.path.slice(0, my.path.indexOf(i) + 1)
  else if (touching(last, i)) my.path.push(i)
  else my.path = [i]
  sfx.add(my.path.length)
}

function playTangle(v, L) {
  const n = nav()
  if (n.x || n.y) {
    const r = clamp(Math.floor(my.cursor / 4) + n.y, 0, 3)
    const c = clamp((my.cursor % 4) + n.x, 0, 3)
    if (r * 4 + c !== my.cursor) sfx.move()
    my.cursor = r * 4 + c
  }
  if (pressA()) tapTile(v, my.cursor)
  if (btn('x')) submitPath(v)
  if (btn('b') && my.path.length) {
    my.path.pop()
    sfx.undo()
  }
  if (btn('y')) my.path = []

  if (P.pressed) {
    const i = L.tiles.findIndex((r) => inside(P, r))
    if (i >= 0) my.drag = { tile: i, moved: false }
    else {
      const b = L.btns.find((r) => inside(P, r))
      if (b?.id === 'clear') my.path = []
      if (b?.id === 'enter') submitPath(v)
    }
  } else if (my.drag && P.down) {
    // Dragging: a finger has to come close to a tile's centre, so sliding diagonally doesn't catch the neighbours.
    const i = L.tiles.findIndex((r) => Math.hypot(P.x - (r.x + r.w / 2), P.y - (r.y + r.h / 2)) < r.w * TUNING.dragReach)
    if (i >= 0 && i !== (my.drag.moved ? my.path.at(-1) : my.drag.tile)) {
      if (!my.drag.moved) {
        my.drag.moved = true
        my.path = [my.drag.tile]
      }
      if (i === my.path.at(-2)) {
        my.path.pop()
        sfx.undo()
      } else if (!my.path.includes(i) && touching(my.path.at(-1), i)) {
        my.path.push(i)
        sfx.add(my.path.length)
      }
    }
  }
  if (my.drag && P.released) {
    if (my.drag.moved) submitPath(v)
    else tapTile(v, my.drag.tile)
    my.drag = null
  }
}

/** The seven letters as shown: the middle one, then the six around it in the player's shuffled order. */
const petalShown = (v) => [v.pz[0], ...my.order.map((i) => v.pz[i])]
function petalAdd(l) {
  if (my.cur.length >= TUNING.maxPetalWord) return sfx.bad()
  my.cur += l
  sfx.add(my.cur.length)
}
function petalDelete() {
  if (!my.cur) return
  my.cur = my.cur.slice(0, -1)
  sfx.undo()
}
function petalSubmit(v) {
  if (my.cur) tryWord(v, my.cur)
  my.cur = ''
}
function petalShuffle() {
  for (let i = my.order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[my.order[i], my.order[j]] = [my.order[j], my.order[i]]
  }
  sfx.move()
}
function playPetal(v, L) {
  const shown = petalShown(v)
  const n = nav()
  if (n.x || n.y) {
    // Step to the nearest petal in the direction pressed.
    const from = L.petals[my.focus]
    let best = -1
    let bestScore = 0.35
    L.petals.forEach((p, i) => {
      if (i === my.focus) return
      const dx = p.x - from.x
      const dy = p.y - from.y
      const d = Math.hypot(dx, dy)
      const score = (dx * n.x + dy * n.y) / d / Math.hypot(n.x, n.y) - d / (L.board.size * 4)
      if (score > bestScore) {
        bestScore = score
        best = i
      }
    })
    if (best >= 0) {
      my.focus = best
      sfx.move()
    }
  }
  if (pressA()) petalAdd(shown[my.focus])
  if (btn('x')) petalSubmit(v)
  if (btn('b')) petalDelete()
  if (btn('y')) petalShuffle()
  for (const k of K.keys) {
    if (k === 'enter') petalSubmit(v)
    else if (k === 'back') petalDelete()
    else if (v.pz.includes(k)) petalAdd(k)
    else sfx.bad()
  }
  if (P.pressed) {
    const i = L.petals.findIndex((p) => Math.hypot(P.x - p.x, P.y - p.y) < p.r)
    if (i >= 0) {
      my.focus = i
      petalAdd(shown[i])
    } else {
      const b = L.btns.find((r) => inside(P, r))
      if (b?.id === 'delete') petalDelete()
      if (b?.id === 'shuffle') petalShuffle()
      if (b?.id === 'enter') petalSubmit(v)
    }
  }
}

const KEY_ROWS = [[...'qwertyuiop'], [...'asdfghjkl'], ['enter', ...'zxcvbnm', 'del']]
const myPatterns = (v) => (v.p?.[meId()]?.pat ? v.p[meId()].pat.split(',') : [])
/** The guesses made on the word this player is on now. */
const lockGuesses = () => my.guesses.slice(my.wordStart).filter((g) => g !== '-')
/** Waiting for the host to answer the last guess or skip: nothing more can be entered until it does. */
const lockPending = (v) => my.skip || lockGuesses().length > myPatterns(v).length
function lockType(key, v) {
  if (key === 'enter') {
    if (lockPending(v)) return
    if (my.cur.length < 5) {
      flash('Five letters', false)
      return sfx.bad()
    }
    if (!dict?.has(my.cur)) {
      flash('Not in the word list', false)
      return sfx.bad()
    }
    my.guesses.push(my.cur)
    my.cur = ''
    for (let i = 0; i < 5; i++) sfx.flip(i)
  } else if (key === 'skip') {
    if (lockPending(v)) return
    my.guesses.push('-')
    my.skip = true
    my.cur = ''
  } else if (key === 'del') {
    if (my.cur) {
      my.cur = my.cur.slice(0, -1)
      sfx.undo()
    }
  } else if (my.cur.length < 5) {
    my.cur += key
    sfx.add(my.cur.length)
  }
}
function playLockword(v, L) {
  const p = v.p?.[meId()] ?? {}
  // The host moved this player on to the next word: start a clean board.
  if ((p.wi ?? 0) !== my.wi) {
    my.toastFor = p.wi
    my.wi = p.wi ?? 0
    my.wordStart = my.guesses.length
    my.skip = false
    my.cur = ''
  }
  // Say how the last word went, once the host has told this player what it was.
  const hist = mineView().h ? mineView().h.split(',') : []
  if (my.toastFor && hist.length >= my.toastFor) {
    const [word, used] = hist[my.toastFor - 1].split(':')
    my.toastFor = 0
    if (+used) {
      flash(`+${RULES.lockword.solve + RULES.lockword.spare * (RULES.lockword.guesses - used)}`, true)
      my.pop = 1
      sfx.good(5)
      if (input.mode === 'touch' && !settings.data.reducedShake) navigator.vibrate?.(18)
    } else {
      flash(`It was ${word.toUpperCase()}: -${RULES.lockword.miss}`, false)
      sfx.bad()
    }
  }
  const n = nav()
  if (n.y) {
    const from = L.keys[my.key.r][my.key.c]
    const r = clamp(my.key.r + n.y, 0, 2)
    if (r !== my.key.r) {
      // Land on the key nearest above or below.
      let c = 0
      L.keys[r].forEach((k, i) => {
        if (Math.abs(k.x + k.w / 2 - (from.x + from.w / 2)) < Math.abs(L.keys[r][c].x + L.keys[r][c].w / 2 - (from.x + from.w / 2))) c = i
      })
      my.key = { r, c }
      sfx.move()
    }
  }
  if (n.x) {
    const len = KEY_ROWS[my.key.r].length
    my.key.c = (my.key.c + n.x + len) % len
    sfx.move()
  }
  if (pressA()) lockType(KEY_ROWS[my.key.r][my.key.c], v)
  if (btn('x')) lockType('enter', v)
  if (btn('b')) lockType('del', v)
  if (btn('y')) lockType('skip', v)
  for (const k of K.keys) lockType(k === 'back' ? 'del' : k, v)
  if (P.pressed) {
    if (L.skip && inside(P, L.skip)) lockType('skip', v)
    for (let r = 0; r < 3; r++) {
      const c = L.keys[r].findIndex((k) => inside(P, k))
      if (c >= 0) {
        my.key = { r, c }
        lockType(KEY_ROWS[r][c], v)
      }
    }
  }
}

/** What to tell this player once a round is over: best word, words only they found, words they missed. */
function summarize(v) {
  const g = v.g
  const me = meId()
  const ids = Object.keys(v.p ?? {})
  if (g === 'lockword' || !dict) return { g, hist: (v.p?.[me]?.rw ? v.p[me].rw.split(',') : []).map((e) => ({ w: e.split(':')[0], used: +e.split(':')[1] })) }
  const points = (w) => (g === 'tangle' ? tanglePoints(w) : petalPoints(w, v.pz))
  const lists = Object.fromEntries(ids.map((id) => [id, v.p[id].rw ? v.p[id].rw.split(',') : []]))
  const count = {}
  for (const id of ids) for (const w of lists[id]) count[w] = (count[w] ?? 0) + 1
  const mine = lists[me] ?? []
  const all = g === 'tangle' ? solveTangle(dict, v.pz) : solvePetal(dict, v.pz)
  const missed = all.filter((w) => !mine.includes(w)).sort((a, b) => points(b) - points(a) || a.length - b.length)
  let best = null
  for (const id of ids)
    for (const w of lists[id]) {
      const pts = points(w) * (ids.length > 1 && count[w] === 1 ? 2 : 1)
      if (!best || pts > best.pts) best = { w, pts, id }
    }
  const sorted = [...mine].sort((a, b) => points(b) - points(a) || a.localeCompare(b))
  return { g, best, mine: sorted, onlyMe: ids.length > 1 ? mine.filter((w) => count[w] === 1) : [], missed: missed.slice(0, 8), possible: all.length, found: mine.length }
}

// ---- Layout of a round ------------------------------------------------------------------------------

function roundLayout(v) {
  const g = v.g
  const W = V.w
  const H = V.h
  const sf = V.safe
  const L = { tiles: [], btns: [], keys: [], petals: [], wide: V.wide }
  const buttons = (row, list) => {
    const gap = 14
    const w = (row.w - gap * (list.length - 1)) / list.length
    L.btns = list.map((b, i) => ({ ...b, x: row.x + i * (w + gap), y: row.y, w, h: row.h }))
  }
  const BTNS = { tangle: [{ id: 'clear', label: 'Clear', b: 'y' }, { id: 'enter', label: 'Enter', b: 'x', kind: 'primary' }], petal: [{ id: 'delete', label: 'Delete', b: 'b' }, { id: 'shuffle', label: 'Shuffle', b: 'y' }, { id: 'enter', label: 'Enter', b: 'x', kind: 'primary' }] }
  const top = sf.top + 20
  const bottom = H - sf.bottom - 24
  L.pause = pauseRect()

  if (!V.wide) {
    const pad = 32
    L.hud = { x: sf.left + pad, y: top, w: W - 2 * pad - 80 }
    L.rivals = { x: pad, y: top + 140, w: W - 2 * pad, h: g === 'lockword' ? 112 : 64 }
    const under = L.rivals.y + L.rivals.h
    if (g === 'lockword') {
      L.kb = { x: 12, y: bottom - 280, w: W - 24, h: 280 }
      L.skip = { x: W - pad - 200, y: L.kb.y - 68, w: 200, h: 56 }
      L.hint = { x: pad + (W - 2 * pad - 216) / 2, y: L.kb.y - 40, w: W - 2 * pad - 216 }
      const avail = L.kb.y - 72 - (under + 16)
      const cell = Math.floor(Math.min(100, (avail - 50) / 6, (W - 2 * pad - 40) / 5))
      L.board = { x: (W - (cell * 5 + 40)) / 2, y: under + 16 + (avail - (cell * 6 + 50)) / 2, cell, gap: 10 }
    } else {
      let y = bottom - 84
      buttons({ x: pad, y, w: W - 2 * pad, h: 84 }, BTNS[g])
      y -= 56
      L.hint = { x: W / 2, y: y + 28, w: W - 2 * pad }
      const size = Math.min(W - 2 * pad, g === 'tangle' ? 640 : 560, y - 12 - (under + 12 + 60 + 84))
      y -= 12 + size
      L.board = { x: (W - size) / 2, y, size }
      y -= 84
      L.word = { x: W / 2, y: y + 42, w: W - 2 * pad }
      L.found = { x: pad, y: under + 12, w: W - 2 * pad, h: y - 8 - (under + 12) }
    }
  } else {
    const pad = 32
    const leftW = clamp(W * 0.2, 250, 320)
    const rightW = clamp(W * 0.24, 290, 380)
    L.left = { x: sf.left + pad, y: top, w: leftW, h: bottom - top }
    L.right = { x: W - sf.right - pad - rightW, y: top, w: rightW, h: bottom - top }
    const cx = L.left.x + leftW + 32
    const cw = L.right.x - 32 - cx
    const ch = bottom - top
    L.hud = { x: L.left.x, y: top, w: leftW }
    L.how = { x: L.left.x, y: bottom - 132, w: leftW }
    if (g === 'lockword') L.skip = { x: L.left.x, y: L.how.y - 84, w: leftW, h: 64 }
    L.found = g === 'lockword' ? null : { x: L.left.x, y: top + 226, w: leftW, h: L.how.y - 20 - (top + 226) }
    if (g === 'lockword') {
      const kh = 3 * 72 + 16
      L.kb = { x: cx, y: bottom - kh, w: cw, h: kh }
      const avail = ch - kh - 16
      const cell = Math.floor(Math.min(84, (avail - 50) / 6))
      L.board = { x: cx + (cw - (cell * 5 + 40)) / 2, y: top + (avail - (cell * 6 + 50)) / 2, cell, gap: 10 }
    } else {
      const bw = Math.min(cw, 560)
      buttons({ x: cx + (cw - bw) / 2, y: bottom - 72, w: bw, h: 72 }, BTNS[g])
      const size = Math.min(cw, ch - 72 - 16 - 76 - 8, 620)
      L.word = { x: cx + cw / 2, y: top + 38, w: cw }
      L.board = { x: cx + (cw - size) / 2, y: top + 76 + 8 + (ch - 72 - 16 - 76 - 8 - size) / 2, size }
    }
  }

  if (g === 'tangle' && L.board) {
    const gap = V.wide ? 12 : 14
    const t = (L.board.size - gap * 3) / 4
    for (let i = 0; i < 16; i++) L.tiles.push({ x: L.board.x + (i % 4) * (t + gap), y: L.board.y + Math.floor(i / 4) * (t + gap), w: t, h: t - 8 })
  }
  if (g === 'petal' && L.board) {
    const s = L.board.size
    const r = s * 0.155
    const ring = s * 0.335
    const cx = L.board.x + s / 2
    const cy = L.board.y + s / 2
    L.petals.push({ x: cx, y: cy, r })
    for (let i = 0; i < 6; i++) {
      const a = ((-90 + i * 60) * Math.PI) / 180
      L.petals.push({ x: cx + Math.cos(a) * ring, y: cy + Math.sin(a) * ring, r })
    }
  }
  if (g === 'lockword' && L.kb) {
    const gap = 6
    const rowH = (L.kb.h - 16) / 3
    const kw = Math.min(88, (L.kb.w - gap * 9) / 10)
    KEY_ROWS.forEach((row, r) => {
      const widths = row.map((k) => (k.length > 1 ? kw * 1.5 + gap / 2 : kw))
      const total = widths.reduce((a, b) => a + b, 0) + gap * (row.length - 1)
      let x = L.kb.x + (L.kb.w - total) / 2
      L.keys.push(
        row.map((k, c) => {
          const rect = { x, y: L.kb.y + r * (rowH + 8), w: widths[c], h: rowH, k }
          x += widths[c] + gap
          return rect
        })
      )
    })
  }
  return L
}

/** Where the four game tiles sit on the home screen: two by two. */
function titleCards() {
  const sf = V.safe
  const gap = 16
  if (!V.wide) {
    const y0 = sf.top + 176
    const w = (V.w - 64 - gap) / 2
    const h = Math.min(300, (M.title.rect(0).y - 32 - y0 - gap) / 2)
    return CARDS.map((_, i) => ({ x: 32 + (i % 2) * (w + gap), y: y0 + Math.floor(i / 2) * (h + gap), w, h }))
  }
  const x0 = sf.left + 40
  const y0 = sf.top + 150
  const w = (sideX() - sideW() / 2 - 48 - x0 - gap) / 2
  const h = (V.h - sf.bottom - 40 - y0 - gap) / 2
  return CARDS.map((_, i) => ({ x: x0 + (i % 2) * (w + gap), y: y0 + Math.floor(i / 2) * (h + gap), w, h }))
}

// ---- Drawing ------------------------------------------------------------------------------------------

function draw() {
  ctx.save()
  ctx.scale(V.s, V.s)
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, V.w, V.h)
  const v = view()
  switch (state.screen) {
    case 'title':
      drawTitle()
      break
    case 'settings':
      settingsScreen.draw(ctx, { font: `700 ${ui.px(32)}px ${FONT}`, titleFont: `400 64px ${DISPLAY}`, color: C.tile })
      break
    case 'lobby':
      drawLobby()
      break
    case 'gameover':
      drawResults(v, true)
      drawMenu(M.gameover)
      break
    default:
      drawMatch(v)
      if (state.screen === 'paused') drawPaused()
  }
  for (const c of confetti) {
    ctx.save()
    ctx.translate(c.x, c.y)
    ctx.rotate(c.r)
    ctx.fillStyle = c.c
    ctx.fillRect(-7, -4, 14, 8)
    ctx.restore()
  }
  ctx.restore()
  if (debug) drawDebug()
}

function drawLogo(x, y, size, align = 'left') {
  ui.text('Word Rally', x, y, size, C.tile, { family: DISPLAY, weight: 400, align, scale: false })
}

const tagline = () => dictError || (dict ? 'Tap a game to play' : 'Loading the word list…')

function drawTitle() {
  const sf = V.safe
  if (!V.wide) {
    drawLogo(V.w / 2, sf.top + 84, 100, 'center')
    ui.text(showCursor() && dict && !dictError ? 'Pick a game' : tagline(), V.w / 2, sf.top + 144, 32, C.muted, { align: 'center', weight: 400, max: V.w - 48 })
  } else {
    drawLogo(sf.left + 40, sf.top + 62, 84)
    ui.text(showCursor() && dict && !dictError ? 'Pick a game' : tagline(), sf.left + 40, sf.top + 120, 32, C.muted, { weight: 400 })
  }
  titleCards().forEach((r, i) => {
    const g = CARDS[i]
    const look = GAME_LOOK[g]
    const best = save.data.best[g] ?? 0
    ui.rect(r.x, r.y + 8, r.w, r.h - 8, 26, look.edge)
    ui.rect(r.x, r.y, r.w, r.h - 8, 26, look.color)
    const t = Math.min(84, r.h * 0.3)
    ui.tile(r.x + 20, r.y + 20, t, t, titleOf(g)[0], { bg: C.tile, edge: 'rgba(0,0,0,0.28)' })
    if (best) ui.text(`Best ${best}`, r.x + r.w - 20, r.y + 20 + t / 2, 32, C.ink, { align: 'right', weight: 900, max: r.w - t - 60 })
    const meta = g === 'rally' ? 'All three' : `${RULES[g].seconds / 60} minutes`
    ui.text(meta, r.x + 20, r.y + r.h - 44, 32, C.ink, { max: r.w - 40 })
    ui.text(titleOf(g), r.x + 20, r.y + r.h - 96, 52, C.ink, { family: DISPLAY, weight: 400, max: r.w - 40, scale: false })
    if (state.zone === 'grid' && showCursor() && i === homePick.focus) ui.rect(r.x - 6, r.y - 6, r.w + 12, r.h + 4, 30, null, C.tile, 6)
  })
  drawMenu(M.title, state.zone === 'menu')
}

function drawPauseButton() {
  ui.pauseIcon(pauseRect())
}

function drawLobby() {
  const sf = V.safe
  const cx = V.w / 2
  drawPauseButton()
  ui.text('Play with friends', V.wide ? cx : sf.left + 32, sf.top + (V.wide ? 96 : 58), V.wide ? 60 : 52, C.tile, { family: DISPLAY, weight: 400, align: V.wide ? 'center' : 'left', max: V.w - 150, scale: false })
  const line = (s, y, color = C.muted, size = 32, weight = 400) => ui.text(s, cx, y, size, color, { align: 'center', weight, max: V.w - 64 })
  if (net.status === 'connecting') return line('Connecting…', V.h / 2, C.text, 40, 700)
  if (net.status === 'error') {
    line(net.error || 'Something went wrong.', V.wide ? V.h / 2 - 60 : V.h / 2 - 40, C.text, 36, 700)
    return drawMenu(M.error)
  }
  if (net.room) {
    const v = view()
    const host = net.isHost
    const x = V.wide ? sf.left + 48 : 32
    const w = V.wide ? sideX() - sideW() / 2 - 48 - x : V.w - 64
    const top = sf.top + (V.wide ? 150 : 110)
    ui.text(`Room ${net.room}`, x, top + 24, 48, C.sun, { weight: 900 })
    if (net.status === 'reconnecting') ui.text('Reconnecting…', x + w, top + 24, 32, C.sun, { align: 'right' })
    // Players as chips, two across.
    const gap = 12
    const cw = (w - gap) / 2
    const ch = V.wide ? 72 : 80
    net.players.forEach((id, i) => {
      const cxp = x + (i % 2) * (cw + gap)
      const cy = top + 70 + Math.floor(i / 2) * (ch + gap)
      const away = net.away?.includes(id)
      ctx.globalAlpha = away ? 0.45 : 1
      ui.rect(cxp, cy, cw, ch, 18, id === net.me ? C.panelHi : C.panel)
      const name = id === net.me ? NAMES[settings.data.name] : nameOf(id, v)
      ui.dot(cxp + 40, cy + ch / 2, 24, colorOf(id), name[0])
      ui.text(`${name}${id === net.me ? ' (you)' : ''}`, cxp + 78, cy + ch / 2 + 2, 32, C.text, { max: cw - 90 })
      ctx.globalAlpha = 1
    })
    const ready = net.players.length >= net.minPlayers
    if (host) {
      const rects = roomRects()
      ui.text(ready ? 'First game' : `Friends pick room ${net.room} to join`, rects[0].x, rects[0].y - 34, 32, C.muted, { weight: 400, max: rects[1].x + rects[1].w - rects[0].x })
      drawGameButtons(rects, roomPick, true)
      return drawMenu(M.roomHost, state.zone === 'menu')
    }
    const first = titleOf(CARDS[v.fg ?? 0])
    const m = M.roomGuest.rect(0)
    ui.text(`Waiting for the host · first game: ${first}`, m.x + m.w / 2, m.y - 44, 32, C.muted, { align: 'center', weight: 400, max: V.wide ? m.w : V.w - 64 })
    return drawMenu(M.roomGuest)
  }
  const menu = lobbyMenu()
  const y = menu.rect(0).y
  line('One of you hosts a room. The others join it.', y - (net.error ? 100 : 52), C.muted)
  if (net.error) line(net.error, y - 52, C.sun)
  drawMenu(menu)
}

function drawPaused() {
  ctx.fillStyle = 'rgba(12,14,32,0.8)'
  ctx.fillRect(0, 0, V.w, V.h)
  const menu = pauseMenu()
  const y = menu.rect(0).y
  const note = online ? (net.status === 'reconnecting' ? 'Reconnecting…' : net.status === 'playing' ? 'The clock keeps running for everyone' : '') : ''
  if (!V.wide) {
    // A sheet rising from the bottom edge, so everything on it is under the thumbs.
    const top = y - (note ? 150 : 104)
    ui.rect(0, top, V.w, V.h - top + 40, 36, C.panel)
    ui.rect(V.w / 2 - 44, top + 16, 88, 8, 4, C.line)
    ui.text('Paused', 48, top + 62, 44, C.tile, { family: DISPLAY, weight: 400, scale: false })
    if (note) ui.text(note, 48, top + 112, 32, net.status === 'reconnecting' ? C.sun : C.muted, { weight: 400, max: V.w - 96 })
  } else {
    ui.text('Paused', V.w / 2, y - (note ? 130 : 84), 68, C.tile, { family: DISPLAY, weight: 400, align: 'center', scale: false })
    if (note) ui.text(note, V.w / 2, y - 60, 32, net.status === 'reconnecting' ? C.sun : C.muted, { align: 'center', weight: 400, max: V.w - 64 })
  }
  drawMenu(menu)
}

/** Everything inside a match: choosing a game, the countdown, the round, the results. */
function drawMatch(v) {
  if (!v.ph || v.ph === 'lobby') {
    drawPauseButton()
    return ui.text('Waiting for the host…', V.w / 2, V.h / 2, 40, C.text, { align: 'center' })
  }
  if (v.ph === 'pick') drawPick(v)
  else if (v.ph === 'count') drawCount(v)
  else if (v.ph === 'round') drawRound(v)
  else drawResults(v, false)
  if (online && net.status === 'reconnecting') {
    ui.rect(V.w / 2 - 200, V.safe.top + 16, 400, 60, 30, C.sun)
    ui.text('Reconnecting…', V.w / 2, V.safe.top + 48, 32, C.ink, { align: 'center' })
  }
}

const sortedIds = (v, by) => Object.keys(v.p ?? {}).sort((a, b) => (v.p[b][by] ?? 0) - (v.p[a][by] ?? 0) || a.localeCompare(b))
const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`

/** A table of players: rank, name, an optional middle column, and a big number on the right. */
function drawTable(v, box, ids, { mid = null, big, rowH = 68 }) {
  ids.forEach((id, i) => {
    const y = box.y + i * (rowH + 8)
    if (y + rowH > box.y + box.h + 1) return
    const me = id === meId()
    ui.rect(box.x, y, box.w, rowH, 18, me ? C.panelHi : C.panel)
    ctx.globalAlpha = online && net.away?.includes(id) ? 0.45 : 1
    ui.dot(box.x + 36, y + rowH / 2, 22, colorOf(id), String(i + 1))
    ui.text(nameOf(id, v), box.x + 74, y + rowH / 2 + 2, 34, C.text, { max: box.w - 74 - 130 - (mid ? 130 : 0) })
    if (mid) ui.text(mid(id), box.x + box.w - 150, y + rowH / 2 + 2, 32, GAME_LOOK[v.g]?.color ?? C.muted, { align: 'right' })
    ui.text(String(big(id)), box.x + box.w - 22, y + rowH / 2 + 2, 40, C.tile, { align: 'right', weight: 900 })
    ctx.globalAlpha = 1
  })
}

function drawPick(v) {
  const sf = V.safe
  drawPauseButton()
  const ids = sortedIds(v, 'tot')
  const x = V.wide ? sf.left + 40 : 32
  const w = V.wide ? sideX() - sideW() / 2 - 48 - x : V.w - 64
  const host = hostPicks(v)
  const rects = nextRects()
  ui.text('Standings', x, sf.top + 70, 60, C.tile, { family: DISPLAY, weight: 400, max: w - 60, scale: false })
  ui.text(host ? 'Pick the next game' : 'The host is picking the next game', x, sf.top + 132, 32, C.muted, { weight: 400, max: w })
  const tableH = (V.wide || !host ? V.h - sf.bottom - 32 : rects[0].y - 30) - (sf.top + 170)
  drawTable(v, { x, y: sf.top + 170, w, h: tableH }, ids, { big: (id) => v.p[id].tot, rowH: V.wide ? 60 : 64 })
  if (host) drawGameButtons(rects, nextPick, showCursor())
}

function drawCount(v) {
  const look = GAME_LOOK[v.g]
  const cx = V.w / 2
  const cy = V.h / 2
  drawPauseButton()
  const sub = v.parts > 1 ? `Word ${v.part + 1} of ${v.parts}` : v.rally ? `${v.rally} more ${v.rally === 1 ? 'game' : 'games'} after this` : ''
  ui.text(RULES[v.g].name, cx, cy - 230, 120, look.color, { family: DISPLAY, weight: 400, align: 'center', max: V.w - 80, scale: false })
  look.rule.forEach((line, i) => ui.text(line, cx, cy - 130 + i * 48, 34, C.text, { align: 'center', weight: 400, max: V.w - 64 }))
  if (sub) ui.text(sub, cx, cy - 20, 32, C.muted, { align: 'center', weight: 400 })
  ui.tile(cx - 90, cy + 40, 180, 180, String(v.t ?? ''), { bg: look.color, edge: look.edge, size: 0.6 })
}

function hud(v, L) {
  const look = GAME_LOOK[v.g]
  const me = v.p?.[meId()] ?? {}
  const urgent = v.t <= TUNING.lastSeconds
  const tSize = (V.wide ? 84 : 78) * (urgent ? 1 + 0.06 * Math.sin(performance.now() / 90) : 1)
  if (V.wide) ui.text(RULES[v.g].name, L.hud.x, L.hud.y + 26, 44, look.color, { family: DISPLAY, weight: 400, scale: false })
  const ty = L.hud.y + (V.wide ? 104 : 46)
  ui.text(clock(v.t ?? 0), L.hud.x, ty, tSize, urgent ? C.bad : C.tile, { weight: 900, scale: false })
  const ids = sortedIds(v, 's')
  const rank = ids.indexOf(meId()) + 1
  let line
  if (v.g === 'lockword') line = V.wide ? `${me.s ?? 0} pts` : `${me.s ?? 0} pts · ${me.w ?? 0} solved`
  else line = my.totalFor === v.k ? `${my.words.length} of ${my.total} words` : `${my.words.length} words`
  if (ids.length > 1 && v.g !== 'lockword' && !V.wide) line += ` · ${ordinal(rank)}`
  ui.text(line, L.hud.x, ty + (V.wide ? 68 : 62), 32, look.color, { max: L.hud.w })
  ui.pauseIcon(L.pause)
}

/** Lockword: a rival's guesses so far as rows of coloured squares (never their letters). */
function miniPattern(pat, x, y, cell, gap, rows = 1) {
  const list = pat ? pat.split(',') : []
  const shown = list.slice(-rows)
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < 5; c++) {
      const s = shown[r]?.[c]
      ui.rect(x + c * (cell + gap), y + r * (cell + gap), cell, cell, 4, s === 'b' ? C.right : s === 'o' ? C.wrong : s === 'x' ? C.absent : C.empty)
    }
}

function drawRivals(v, L) {
  const me = meId()
  const others = sortedIds(v, 's').filter((id) => id !== me)
  if (!V.wide) {
    const r = L.rivals
    if (!others.length) {
      const best = save.data.best[v.g] ?? 0
      ui.rect(r.x, r.y, r.w, 64, 16, C.panel)
      return ui.text(best ? `Your best: ${best}` : 'Set your first best score', r.x + 22, r.y + 34, 32, C.muted, { weight: 400, max: r.w - 44 })
    }
    const shown = others.slice(0, 3)
    const w = (r.w - 10 * (shown.length - 1)) / shown.length
    shown.forEach((id, i) => {
      const x = r.x + i * (w + 10)
      const p = v.p[id]
      ctx.globalAlpha = online && net.away?.includes(id) ? 0.45 : 1
      ui.rect(x, r.y, w, r.h, 16, C.panel)
      ui.dot(x + 24, r.y + 32, 10, colorOf(id))
      if (v.g === 'lockword') {
        ui.text(nameOf(id, v), x + 42, r.y + 34, 32, C.text, { weight: 400, max: w - 52 })
        miniPattern(p.pat, x + 14, r.y + 66, 26, 5)
        ui.text(String(p.s ?? 0), x + w - 12, r.y + 80, 32, C.tile, { align: 'right', weight: 900 })
      } else {
        const sw = ui.width(String(p.s ?? 0), 32, 900)
        ui.text(String(p.s ?? 0), x + w - 14, r.y + 34, 32, C.tile, { align: 'right', weight: 900 })
        ui.text(nameOf(id, v), x + 42, r.y + 34, 32, C.text, { weight: 400, max: w - 62 - sw })
      }
      ctx.globalAlpha = 1
    })
    return
  }
  const r = L.right
  ui.text(others.length ? 'Live scores' : 'Solo', r.x, r.y + 34, 32, C.muted, { weight: 400 })
  const ids = sortedIds(v, 's')
  const rowH = v.g === 'lockword' ? 70 : 62
  ids.forEach((id, i) => {
    const y = r.y + 84 + i * (rowH + 8)
    if (y + rowH > r.y + r.h) return
    const p = v.p[id]
    ctx.globalAlpha = online && net.away?.includes(id) ? 0.45 : 1
    ui.rect(r.x, y, r.w, rowH, 16, id === me ? C.panelHi : C.panel)
    ui.dot(r.x + 26, y + rowH / 2, 12, colorOf(id))
    if (v.g === 'lockword') {
      ui.text(nameOf(id, v), r.x + 48, y + 24, 32, C.text, { max: r.w - 60 - 80 })
      miniPattern(p.pat, r.x + 48, y + 46, 18, 4)
      ui.text(String(p.s ?? 0), r.x + r.w - 14, y + rowH / 2 + 2, 36, C.tile, { align: 'right', weight: 900 })
    } else {
      const sw = ui.width(String(p.s ?? 0), 36, 900)
      ui.text(String(p.s ?? 0), r.x + r.w - 16, y + rowH / 2 + 2, 36, C.tile, { align: 'right', weight: 900 })
      ui.text(nameOf(id, v), r.x + 48, y + rowH / 2 + 2, 32, C.text, { max: r.w - 70 - sw })
    }
    ctx.globalAlpha = 1
  })
  if (!others.length) {
    const best = save.data.best[v.g] ?? 0
    ui.text(best ? `Your best: ${best}` : 'No best score yet', r.x, r.y + 84 + rowH + 44, 32, C.muted, { weight: 400, max: r.w })
  }
}

/** Words as a flow of chips, for as many rows as fit in the box. */
function chips(words, box) {
  let x = box.x
  let y = box.y
  for (const w of words) {
    const cw = ui.width(w.toUpperCase(), 32) + 28
    if (x + cw > box.x + box.w) {
      x = box.x
      y += 56
    }
    if (y + 48 > box.y + box.h) break
    ui.rect(x, y, cw, 48, 12, C.panelHi)
    ui.text(w.toUpperCase(), x + 14, y + 26, 32, C.text)
    x += cw + 8
  }
}

function drawFound(v, L) {
  const box = L.found
  if (!box || box.h < 40) return
  const look = GAME_LOOK[v.g]
  const points = (w) => (v.g === 'tangle' ? tanglePoints(w) : petalPoints(w, v.pz))
  const words = [...my.words].reverse()
  if (!V.wide) {
    chips(words, box)
    if (!words.length) ui.text('Your words show up here', box.x, box.y + 26, 32, C.muted, { weight: 400, max: box.w })
    return
  }
  ui.rect(box.x, box.y, box.w, box.h, 18, C.panel)
  ui.text(`Your words · ${words.length}`, box.x + 18, box.y + 34, 32, C.muted, { weight: 400, max: box.w - 36 })
  words.forEach((w, i) => {
    const y = box.y + 82 + i * 44
    if (y + 20 > box.y + box.h) return
    const pw = ui.text(`+${points(w)}`, box.x + box.w - 18, y, 32, look.color, { align: 'right' })
    ui.text(w.toUpperCase(), box.x + 18, y, 32, C.text, { max: box.w - 46 - pw })
  })
}

/** Above the board: the running score on the left, the word being built in the middle. */
function drawWordRow(v, L, word) {
  const look = GAME_LOOK[v.g]
  const row = L.word
  const score = `${v.p?.[meId()]?.s ?? 0} pts`
  const sw = ui.text(score, L.board.x, row.y, 40 * (1 + my.pop * 0.25), look.color, { weight: 900, scale: false })
  if (word) ui.text(word.toUpperCase(), L.board.x + L.board.size / 2 + sw / 2, row.y, V.wide ? 48 : 54, C.tile, { align: 'center', weight: 900, max: L.board.size - sw - 40, scale: false })
}

/** Drawn over the board, where the player is looking: what the word is worth, points won, and why a word was refused. */
function drawBoardFx(v, L) {
  const look = GAME_LOOK[v.g]
  const b = L.board
  const pill = (text, cx, cy, size, bg, fg) => {
    const w = ui.width(text, size, 900) + 36
    const x = clamp(cx - w / 2, 8, V.w - w - 8)
    ui.rect(x, cy - size * 0.8, w, size * 1.6, size * 0.8, bg)
    ui.text(text, x + w / 2, cy + 2, size, fg, { align: 'center', weight: 900 })
  }
  // While tracing: what this word would be worth, just above the finger (or the last tile).
  if (v.g === 'tangle' && my.path.length >= RULES.tangle.min) {
    const r = L.tiles[my.path.at(-1)]
    const dragging = my.drag && P.down
    pill(`+${tanglePoints(pathWord(v))}`, dragging ? P.x : r.x + r.w / 2, dragging ? P.y - r.h * 0.95 : r.y - 6, 32, C.ink, look.color)
  }
  for (const f of floaters) {
    const r = f.tile === undefined ? null : L.tiles[f.tile]
    const x = clamp(r ? r.x + r.w / 2 : b.x + b.size / 2, b.x + 80, b.x + b.size - 80)
    const y = (r ? r.y + r.h / 2 : b.y + b.size * 0.22) - (1.1 - f.t) * 110
    const size = 92 * (1 + Math.max(0, f.t - 0.9) * 2)
    ctx.globalAlpha = Math.min(1, f.t * 2.5)
    ui.font(size, 900, FONT, false)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 12
    ctx.lineJoin = 'round'
    ctx.strokeStyle = C.ink
    ctx.strokeText(f.text, x, y)
    ui.text(f.text, x, y, size, look.color, { align: 'center', weight: 900, scale: false })
    ctx.globalAlpha = 1
  }
  if (my.flash && !my.flash.good) {
    ctx.globalAlpha = Math.min(1, my.flash.t * 3)
    pill(my.flash.text, b.x + b.size / 2, b.y + b.size / 2, 36, C.bad, C.ink)
    ctx.globalAlpha = 1
  }
}

function drawButtons(L) {
  for (const b of L.btns) ui.button(b, b.label, { kind: b.kind, size: 32 })
}

/** How to play with whatever the player is holding: one line on a tall screen, a small box on a wide one. */
function howTo(v) {
  const l = (b) => input.label(b)
  if (input.mode === 'gamepad' || (input.mode === 'keyboard' && v.g === 'tangle')) {
    if (v.g === 'tangle') return [`${l('a')}: pick`, `${l('x')}: play word`, `${l('b')}: undo`]
    if (v.g === 'petal') return [`${l('a')}: add`, `${l('x')}: play word`, `${l('y')}: shuffle`]
    return [`${l('a')}: type`, `${l('x')}: enter`, `${l('y')}: skip`]
  }
  if (input.mode === 'keyboard') return v.g === 'petal' ? ['Type, then Enter', 'Use the middle letter'] : ['Type, then Enter', 'Blue: right spot', 'Orange: wrong spot']
  if (v.g === 'tangle') return ['Drag over letters', 'Let go to play']
  if (v.g === 'petal') return ['Use the middle letter', 'in every word']
  return ['Blue: right spot', 'Orange: wrong spot']
}
function drawHowTo(v, L) {
  const lines = howTo(v)
  if (v.g === 'lockword' && L.hint) {
    // A colour key instead of a sentence: it fits beside the Skip button.
    let x = L.hint.x - L.hint.w / 2
    for (const [color, label] of [[C.right, 'right spot'], [C.wrong, 'elsewhere']]) {
      ui.rect(x, L.hint.y - 16, 32, 32, 8, color)
      x += 42 + ui.text(label, x + 42, L.hint.y + 2, 32, C.muted, { weight: 400 }) + 22
    }
    return
  }
  if (L.hint) return ui.text((v.g === 'petal' && !showCursor() ? ['Every word needs the middle letter'] : lines).join(' · '), L.hint.x, L.hint.y, 32, C.muted, { align: 'center', weight: 400, max: L.hint.w })
  if (L.how) lines.forEach((line, i) => ui.text(line, L.how.x, L.how.y + 20 + i * 44, 32, C.muted, { weight: 400, max: L.how.w }))
}

function drawRound(v) {
  const L = roundLayout(v)
  hud(v, L)
  drawRivals(v, L)
  drawHowTo(v, L)
  if (v.g === 'lockword') return drawLockword(v, L)
  drawFound(v, L)
  const look = GAME_LOOK[v.g]
  if (v.g === 'tangle') {
    const word = pathWord(v)
    drawWordRow(v, L, word)
    // The path so far, as a line under the tiles.
    if (my.path.length > 1) {
      ctx.strokeStyle = look.edge
      ctx.lineWidth = L.tiles[0].w * 0.2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      my.path.forEach((i, n) => {
        const r = L.tiles[i]
        ctx[n ? 'lineTo' : 'moveTo'](r.x + r.w / 2, r.y + r.h / 2)
      })
      ctx.stroke()
    }
    L.tiles.forEach((r, i) => {
      const on = my.path.includes(i)
      const fx = my.fx?.tiles.includes(i) ? my.fx : null
      const dx = fx && !fx.good && !settings.data.reducedShake ? Math.sin(fx.t * 70) * 8 * (fx.t / 0.45) : 0
      const bg = fx ? (fx.good ? look.color : C.bad) : on ? look.color : C.tile
      const edge = fx ? (fx.good ? look.edge : '#A83A3A') : on ? look.edge : C.tileEdge
      ui.tile(r.x + dx, r.y, r.w, r.h, v.pz[i], { bg, edge, press: on ? 0.6 : 0, ring: showCursor() && i === my.cursor ? C.sun : null })
    })
  } else {
    drawWordRow(v, L, my.cur)
    const shown = petalShown(v)
    L.petals.forEach((p, i) => {
      ui.tile(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2, shown[i], { circle: true, bg: i === 0 ? look.color : C.tile, edge: i === 0 ? look.edge : C.tileEdge, size: 0.5, ring: showCursor() && i === my.focus ? C.sun : null })
    })
  }
  drawBoardFx(v, L)
  drawButtons(L)
}

function drawLockword(v, L) {
  const pats = myPatterns(v)
  const guesses = lockGuesses()
  const b = L.board
  const dx = my.shake > 0 ? Math.sin(my.shake * 60) * 10 * (my.shake / 0.3) : 0
  const tone = { b: C.right, o: C.wrong, x: C.absent }
  const best = {} // the best that is known about each letter of this word, for the keyboard
  guesses.forEach((g, r) => {
    const pat = pats[r]
    if (pat) [...g].forEach((l, i) => (best[l] = best[l] === 'b' || pat[i] === 'b' ? 'b' : best[l] === 'o' || pat[i] === 'o' ? 'o' : 'x'))
  })
  for (let r = 0; r < RULES.lockword.guesses; r++) {
    const current = r === guesses.length
    const word = r < guesses.length ? guesses[r] : current ? my.cur : ''
    const pat = r < guesses.length ? pats[r] : null
    for (let c = 0; c < 5; c++) {
      const x = b.x + c * (b.cell + b.gap) + (current ? dx : 0)
      const y = b.y + r * (b.cell + b.gap)
      const l = word[c] ?? ''
      if (pat) {
        ui.rect(x, y, b.cell, b.cell, 12, tone[pat[c]])
        ui.text(l.toUpperCase(), x + b.cell / 2, y + b.cell / 2 + 2, b.cell * 0.56, pat[c] === 'o' ? C.ink : '#FFFFFF', { align: 'center', weight: 900, scale: false })
      } else {
        ui.rect(x + 2, y + 2, b.cell - 4, b.cell - 4, 12, null, l ? C.muted : C.line, 4)
        if (l) ui.text(l.toUpperCase(), x + b.cell / 2, y + b.cell / 2 + 2, b.cell * 0.56, C.text, { align: 'center', weight: 900, scale: false })
      }
    }
  }
  // How the last word went, or why a guess was refused, across the middle of the board.
  if (my.flash) {
    const big = my.flash.good
    const size = big ? 72 : 36
    const w = Math.min(V.w - 48, ui.width(my.flash.text, size, 900) + 56)
    const cx = b.x + (b.cell * 5 + b.gap * 4) / 2
    const cy = b.y + (b.cell * 6 + b.gap * 5) / 2
    ctx.globalAlpha = Math.min(1, my.flash.t * 3)
    ui.rect(cx - w / 2, cy - size * 0.85, w, size * 1.7, size * 0.85, big ? C.right : C.bad)
    ui.text(my.flash.text, cx, cy + 2, size, big ? '#FFFFFF' : C.ink, { align: 'center', weight: 900, max: w - 32, scale: false })
    ctx.globalAlpha = 1
  }
  if (L.skip) ui.button(L.skip, showCursor() && V.wide ? `Skip -${RULES.lockword.miss} · ${input.label('y')}` : `Skip -${RULES.lockword.miss}`, { size: 32 })
  L.keys.forEach((row, r) =>
    row.forEach((k, c) => {
      const s = best[k.k]
      const special = k.k.length > 1
      ui.rect(k.x, k.y, k.w, k.h, 10, special ? C.panelHi : s ? tone[s] : C.tile)
      const fg = special ? C.text : s && s !== 'o' ? '#FFFFFF' : C.ink
      if (special) keyIcon(k, fg)
      else ui.text(k.k.toUpperCase(), k.x + k.w / 2, k.y + k.h / 2 + 2, 34, fg, { align: 'center', scale: false })
      if (showCursor() && r === my.key.r && c === my.key.c) ui.rect(k.x - 4, k.y - 4, k.w + 8, k.h + 8, 13, null, C.sun, 5)
    })
  )
}

/** Enter (a tick) and delete (an arrow) drawn as shapes, so they read at any key width. */
function keyIcon(k, color) {
  const cx = k.x + k.w / 2
  const cy = k.y + k.h / 2
  const u = Math.min(k.w, k.h) * 0.2
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(4, u * 0.36)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  if (k.k === 'enter') {
    ctx.moveTo(cx - u, cy)
    ctx.lineTo(cx - u * 0.2, cy + u * 0.8)
    ctx.lineTo(cx + u * 1.1, cy - u * 0.8)
  } else {
    ctx.moveTo(cx + u, cy)
    ctx.lineTo(cx - u, cy)
    ctx.moveTo(cx - u * 0.3, cy - u * 0.7)
    ctx.lineTo(cx - u, cy)
    ctx.lineTo(cx - u * 0.3, cy + u * 0.7)
  }
  ctx.stroke()
}

function resultsTitle(v, solo) {
  const g = RULES[v.g].name
  if (v.g === 'lockword' && !v.final) return v.p?.[meId()]?.s ? 'Cracked it!' : 'Time!'
  if (solo) return my.newBest ? 'New best!' : soloChoice === 'rally' ? 'Rally done' : `${g} done`
  const ids = sortedIds(v, 'gs')
  if (ids.length < 2) return `${g} done`
  if (v.p[ids[0]].gs === v.p[ids[1]].gs) return `${g}: a tie!`
  return ids[0] === meId() ? `You take ${g}!` : `${nameOf(ids[0], v)} takes ${g}`
}

function drawResults(v, over) {
  const sf = V.safe
  const solo = !online
  const me = v.p?.[meId()] ?? {}
  const look = GAME_LOOK[v.g] ?? GAME_LOOK.rally
  const sum = my.summary ?? {}
  if (!over) drawPauseButton()
  const x = V.wide ? sf.left + 40 : 32
  const menuTop = over ? M.gameover.rect(0).y : hostPicks(v) ? nextRects()[0].y - 56 : V.h - sf.bottom - 96
  const colW = V.wide ? sideX() - sideW() / 2 - 48 - x : V.w - 64
  ui.text(resultsTitle(v, solo), x, sf.top + 70, 60, C.tile, { family: DISPLAY, weight: 400, max: colW - (V.wide ? 0 : 80), scale: false })

  // Left (or top): the scores.
  let y = sf.top + 124
  if (solo) {
    const score = soloChoice === 'rally' && over ? me.tot : me.gs
    const best = save.data.best[over ? soloChoice : v.g] ?? 0
    ui.text(String(score ?? 0), x, y + 50, 104, look.color, { weight: 900, scale: false })
    const sw = ui.width(String(score ?? 0), 104, 900)
    ui.text('points', x + sw + 18, y + 70, 32, C.muted, { weight: 400 })
    ui.text(`Best ${Math.max(best, score ?? 0)}`, x + colW, y + 50, 36, C.text, { align: 'right' })
    y += 130
  } else {
    const ids = sortedIds(v, v.final ? 'tot' : 'gs')
    const rowH = V.wide ? 58 : 62
    const rows = Math.min(ids.length, V.wide ? 8 : 4)
    drawTable(v, { x, y, w: colW, h: rows * (rowH + 8) }, ids, { mid: (id) => `+${v.p[id].s ?? 0}`, big: (id) => (v.final ? v.p[id].tot : v.p[id].gs), rowH })
    y += rows * (rowH + 8) + 10
  }

  // Right (or below): what happened in the words.
  const dx = V.wide ? sideX() - sideW() / 2 : x
  const dw = V.wide ? sideW() : colW
  let dy = V.wide ? sf.top + 60 : y + 6
  const dBottom = V.wide ? menuTop - 20 : menuTop - 16
  const para = (label, text, color = C.text) => {
    if (dy + 84 > dBottom) return
    ui.text(label, dx, dy + 18, 32, C.muted, { weight: 400, max: dw })
    ui.text(text, dx, dy + 60, 32, color, { max: dw })
    dy += 104
  }
  if (v.g === 'lockword') {
    const hist = sum.hist ?? []
    const solved = hist.filter((h) => h.used).length
    para('Your words', `${solved} solved, ${hist.length - solved} missed`, look.color)
    // Every word this player finished: blue when solved, grey when missed.
    let cx = dx
    let cy = dy + 6
    for (const h of hist) {
      const cw = ui.width(h.w.toUpperCase(), 32) + 28
      if (cx + cw > dx + dw) {
        cx = dx
        cy += 56
      }
      if (cy + 48 > dBottom) break
      ui.rect(cx, cy, cw, 48, 12, h.used ? C.right : C.absent)
      ui.text(h.w.toUpperCase(), cx + 14, cy + 26, 32, '#FFFFFF')
      cx += cw + 8
    }
  } else if (sum.g === v.g) {
    if (sum.best) para('Best word', `${sum.best.w.toUpperCase()} · ${solo ? '' : `${nameOf(sum.best.id, v)} · `}+${sum.best.pts}`, look.color)
    if (sum.onlyMe?.length) para('Only you found (double points)', sum.onlyMe.slice(0, 5).join(', ').toUpperCase())
    if (sum.missed?.length) para('You missed', sum.missed.slice(0, V.wide ? 4 : 5).join(', ').toUpperCase())
    para('In this puzzle', `${sum.possible} words. You found ${sum.found}.`, C.muted)
    // Your own words, best first, wherever there is room left: under the scores when wide, under the notes when tall.
    const box = V.wide ? { x, y: y + 10, w: colW, h: V.h - sf.bottom - 32 - (y + 10) } : { x, y: dy + 6, w: colW, h: dBottom - (dy + 6) }
    if (sum.mine?.length && box.h >= 48) chips(sum.mine, box)
  }

  if (over) return
  if (v.t > 0) {
    const what = !v.final ? 'Next word' : v.rally ? 'Next game' : ''
    const note = solo ? `${what} in ${v.t} · ${input.label('a')} to skip` : `${what} in ${v.t}`
    ui.text(note, V.wide ? x : V.w / 2, V.h - sf.bottom - 48, 34, C.sun, { align: V.wide ? 'left' : 'center', max: V.w - 64 })
  } else if (hostPicks(v)) {
    const rects = nextRects()
    ui.text('Pick the next game', rects[0].x, rects[0].y - 30, 32, C.muted, { weight: 400 })
    drawGameButtons(rects, nextPick, showCursor())
  } else ui.text('Waiting for the host', V.wide ? x : V.w / 2, V.h - sf.bottom - 48, 34, C.muted, { align: V.wide ? 'left' : 'center', weight: 400 })
}

/** ?debug: live state in the corner. */
function drawDebug() {
  ctx.save()
  ctx.font = '500 16px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  ctx.fillRect(8, 8, 520, 116)
  ctx.fillStyle = '#9fe'
  const v = view()
  ctx.fillText(`screen ${state.screen}  phase ${v.ph ?? '-'}  game ${v.g ?? '-'}  mode ${input.mode}`, 16, 16)
  ctx.fillText(`fps ${fps.toFixed(0)}  space ${Math.round(V.w)}×${Math.round(V.h)} ${V.wide ? 'wide' : 'tall'}  scale ${V.s.toFixed(2)}  dpr ${fit.dpr}`, 16, 36)
  ctx.fillText(`net ${net.status} (${net.connection})${net.room ? ` room ${net.room}` : ''}${net.isHost ? ' (host)' : ''}  players ${net.players.length}`, 16, 56)
  ctx.fillText(`sent ${(net.stats.sentBytes / 1024).toFixed(1)} KB  received ${(net.stats.receivedBytes / 1024).toFixed(1)} KB`, 16, 76)
  ctx.fillText(`answer ${match?.peek().answer || '-'}  words ${dict ? dict.list.length : 'loading'}`, 16, 96)
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
