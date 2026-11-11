// pushplay runtime v11 — replaced by `npm run update-kit`; don't edit, extend from game.js.
//
// Controller, keyboard, mouse and touch input behind one API. Games run on handhelds and on
// Linux, Windows and Mac PCs, so every action has to work with each of them.
//
//   input.attach(canvas, 1280, 800)   // once; maps mouse/touch into the game's drawing space
//   input.update(dt)                  // once per frame, before reading anything
//   input.x, input.y                  // left stick / d-pad / WASD / arrows, -1..1
//   input.held('a'), input.pressed('a'), input.released('a')
//   input.navX, input.navY            // -1/0/1 steps with key repeat, for menus and grids
//
// Buttons: a b x y lb rb lt rt select start ls rs up down left right, plus the virtual `menu`
// (Start, Escape, P and the game's own on-screen pause button via input.requestMenu()).
// `b` is B / Backspace / right-click only, so B can be a gameplay action while Escape pauses.
// Keyboard: arrows/WASD move, Space/Enter = a, Backspace = b, Shift = x, F = y, Q/E = lb/rb,
// Z/C = lt/rt, Tab = select, Escape/P = menu. input.extendKeys({ KeyR: 'y' }) adds aliases.
// Never bind F10 or Start+Select: the launcher uses them to open its own menu.
//
// input.mode is 'gamepad' | 'keyboard' | 'mouse' | 'touch' (whatever the player used last), so
// prompts can say the right thing: input.label('a'), input.stickLabel(), input.dpadLabel().
// input.pads[i] has per-pad state for local multiplayer; the merged view above is the default.
// input.onPause(cb) fires when the launcher opens its overlay, the window loses focus or is
// hidden (a phone's screen locks, the app goes to the background), or every controller
// disconnects: pause the game there.
// input.inject({ x, y, buttons }) feeds this frame from on-screen controls (touch.js does this
// for its virtual stick and buttons); call it after input.update().

const BUTTONS = ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'select', 'start', 'ls', 'rs', 'up', 'down', 'left', 'right']
const DEFAULT_KEYS = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Space: 'a',
  Enter: 'a',
  NumpadEnter: 'a',
  Backspace: 'b',
  ShiftLeft: 'x',
  ShiftRight: 'x',
  KeyF: 'y',
  KeyQ: 'lb',
  KeyE: 'rb',
  KeyZ: 'lt',
  KeyC: 'rt',
  Tab: 'select',
  Escape: 'menu',
  KeyP: 'menu'
}
const DEADZONE = 0.2
/** Menu navigation repeat: first repeat after 380 ms, then every 110 ms. */
const NAV_FIRST_S = 0.38
const NAV_REPEAT_S = 0.11

const DIRECTIONS = { up: 'Up', down: 'Down', left: 'Left', right: 'Right' }
const LABELS = {
  gamepad: { a: 'A', b: 'B', x: 'X', y: 'Y', lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT', start: 'START', select: 'SELECT', menu: 'START', ls: 'L3', rs: 'R3', ...DIRECTIONS },
  keyboard: { a: 'Space', b: 'Backspace', x: 'Shift', y: 'F', lb: 'Q', rb: 'E', lt: 'Z', rt: 'C', start: 'P', select: 'Tab', menu: 'Esc', ls: 'Shift', rs: 'Ctrl', ...DIRECTIONS },
  touch: { a: 'Tap', b: 'Back', x: 'Tap', y: 'Tap', lb: 'Swipe left', rb: 'Swipe right', lt: 'Hold', rt: 'Hold', start: '≡', select: '≡', menu: '≡', ls: 'Drag', rs: 'Drag', ...DIRECTIONS }
}
LABELS.mouse = { ...LABELS.keyboard, a: 'Click', b: 'Right-click' }
const STICK_LABELS = { gamepad: 'Left stick', keyboard: 'WASD / Arrows', mouse: 'WASD / Arrows', touch: 'Drag' }
const DPAD_LABELS = { gamepad: 'D-pad', keyboard: 'Arrows', mouse: 'Arrows', touch: 'Swipe' }

const launcher = () => globalThis.pushplay
const keys = { ...DEFAULT_KEYS }
/** Physical keys held, by code, so releasing W while ArrowUp is held keeps moving. */
const codesDown = new Set()
/** Buttons pressed since the last update, so a tap shorter than a frame still counts. */
const tapped = new Set()
let menuRequested = false
let rightClick = false

let now = new Set()
let before = new Set()
let lastUpdate = 0
const nav = { x: { dir: 0, timer: 0 }, y: { dir: 0, timer: 0 } }
let connectedPads = 0

const pauseListeners = new Set()
const resumeListeners = new Set()
const pressListeners = new Set()
let windowPauseQueued = false

function firePause() {
  for (const cb of pauseListeners) {
    try {
      cb()
    } catch (err) {
      console.error(err)
    }
  }
}
/** blur and visibilitychange usually arrive together: one pause for both. */
function queueWindowPause() {
  if (windowPauseQueued) return
  windowPauseQueued = true
  setTimeout(() => {
    windowPauseQueued = false
    firePause()
  }, 0)
}
function fireResume() {
  for (const cb of resumeListeners) {
    try {
      cb()
    } catch (err) {
      console.error(err)
    }
  }
}

function step(axis, dir, dt) {
  const s = nav[axis]
  if (!dir) {
    s.dir = 0
    return 0
  }
  if (dir !== s.dir) {
    s.dir = dir
    s.timer = NAV_FIRST_S
    return dir
  }
  s.timer -= dt
  if (s.timer > 0) return 0
  s.timer = NAV_REPEAT_S
  return dir
}

/** Per-controller state, kept across frames so pressed() works per pad. */
function makePad(index) {
  let padNow = new Set()
  let padBefore = new Set()
  return {
    index,
    connected: false,
    x: 0,
    y: 0,
    aimX: 0,
    aimY: 0,
    held: (button) => padNow.has(button),
    pressed: (button) => padNow.has(button) && !padBefore.has(button),
    released: (button) => !padNow.has(button) && padBefore.has(button),
    /** @internal */
    _read(pad) {
      padBefore = padNow
      padNow = new Set()
      this.connected = Boolean(pad?.connected)
      this.x = this.y = this.aimX = this.aimY = 0
      if (!pad) return
      pad.buttons.forEach((b, i) => {
        if (!(b.pressed || b.value > 0.5) || !BUTTONS[i]) return
        padNow.add(BUTTONS[i])
        if (BUTTONS[i] === 'start') padNow.add('menu')
      })
      const [lx = 0, ly = 0, rx = 0, ry = 0] = pad.axes
      if (Math.hypot(lx, ly) > DEADZONE) {
        this.x = lx
        this.y = ly
      }
      if (Math.hypot(rx, ry) > DEADZONE) {
        this.aimX = rx
        this.aimY = ry
      }
      return padNow
    }
  }
}

function initialMode() {
  const api = launcher()
  if (api?.inputMode) return api.inputMode
  let wantsPad = Boolean(api?.gamingMode)
  try {
    wantsPad ||= new URLSearchParams(globalThis.location?.search ?? '').get('input') === 'pad'
  } catch {
    /* no location */
  }
  return wantsPad ? 'gamepad' : 'keyboard'
}

export const input = {
  x: 0,
  y: 0,
  /** Right stick, for twin-stick games. */
  aimX: 0,
  aimY: 0,
  /** -1, 0 or 1 per axis, one step per press with key repeat while held. Use for menus and grids. */
  navX: 0,
  navY: 0,
  /** What the player last used: 'gamepad', 'keyboard', 'mouse' or 'touch'. */
  mode: initialMode(),
  get usingGamepad() {
    return this.mode === 'gamepad'
  },
  /** True inside the launcher's full-screen gaming mode (controller first, no window chrome). */
  gamingMode: Boolean(launcher()?.gamingMode),
  /** True while the launcher's overlay is open over the game. */
  paused: false,
  /** Per-controller state for local multiplayer: input.pads[0].pressed('a'). */
  pads: [makePad(0), makePad(1), makePad(2), makePad(3)],

  /**
   * The primary mouse button or first finger, in game coordinates: x, y, down (held),
   * pressed (went down this frame), released (came up this frame). active is false until used.
   */
  pointer: { x: 0, y: 0, down: false, pressed: false, released: false, active: false, type: 'mouse' },
  /** Every pointer currently touching or hovering, by pointerId: { id, x, y, down, type }. */
  pointers: new Map(),
  /**
   * The drawing space attach() was given (touch.js lays its controls out in it), and the canvas.
   * With fitCanvas({ fill: true }) it is the fit's live size, which follows the screen.
   */
  get space() {
    return liveSpace()
  },
  canvas: null,

  /**
   * Track the mouse and touch, converted into a w×h drawing space (1280×800 unless the game
   * draws at another size). Listens on the window, so drags that leave the canvas still end.
   */
  attach(canvas, w = 1280, h = 800) {
    attached.canvas = canvas
    attached.w = w
    attached.h = h
    this.canvas = canvas
    if (attached.listening) return
    attached.listening = true
    const place = (e, p) => {
      const r = attached.canvas.getBoundingClientRect()
      const space = liveSpace()
      p.x = ((e.clientX - r.left) / (r.width || 1)) * space.w
      p.y = ((e.clientY - r.top) / (r.height || 1)) * space.h
      p.type = e.pointerType || 'mouse'
    }
    const track = (e) => {
      let p = this.pointers.get(e.pointerId)
      if (!p) this.pointers.set(e.pointerId, (p = { id: e.pointerId, x: 0, y: 0, down: false, type: 'mouse' }))
      place(e, p)
      return p
    }
    const isPrimary = (e) => e.isPrimary !== false
    const useMode = (e, moved) => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') this.mode = 'touch'
      else if (moved) this.mode = 'mouse'
    }
    addEventListener('pointermove', (e) => {
      const p = track(e)
      if (isPrimary(e)) {
        place(e, this.pointer)
        this.pointer.active = true
      }
      useMode(e, e.movementX || e.movementY || p.type !== 'mouse')
    })
    addEventListener('pointerdown', (e) => {
      const p = track(e)
      p.down = true
      useMode(e, true)
      if (e.button === 2) {
        rightClick = true
        return
      }
      if (!isPrimary(e)) return
      place(e, this.pointer)
      this.pointer.active = true
      pointerDown = true
      pointerWentDown = true
    })
    const up = (e) => {
      const p = this.pointers.get(e.pointerId)
      if (p) {
        place(e, p)
        p.down = false
        if (e.pointerType !== 'mouse') this.pointers.delete(e.pointerId)
      }
      if (!isPrimary(e) || e.button === 2) return
      place(e, this.pointer)
      if (!pointerDown) return
      pointerDown = false
      pointerWentUp = true
    }
    addEventListener('pointerup', up)
    addEventListener('pointercancel', up)
    // Right-click is b (back), not the browser's menu.
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
    canvas.style.touchAction = 'none'
  },

  /** Call once per frame, first. dt in seconds (measured when omitted); drives navX/navY repeat. */
  update(dt) {
    const t = performance.now()
    if (dt === undefined) dt = lastUpdate ? Math.min(0.1, (t - lastUpdate) / 1000) : 1 / 60
    lastUpdate = t

    before = now
    now = new Set(tapped)
    tapped.clear()
    for (const code of codesDown) if (keys[code]) now.add(keys[code])
    if (rightClick) now.add('b')
    rightClick = false
    if (menuRequested) now.add('menu')
    menuRequested = false

    let x = 0
    let y = 0
    let aimX = 0
    let aimY = 0
    let connected = 0
    const pads = navigator.getGamepads?.() ?? []
    for (const state of this.pads) {
      const pad = pads[state.index]
      const usable = pad && pad.connected !== false && (pad.mapping === 'standard' || pad.mapping === '')
      const buttons = state._read(usable ? pad : null)
      if (!usable) continue
      connected++
      if (buttons.size) this.mode = 'gamepad'
      for (const b of buttons) now.add(b)
      if (state.x || state.y) this.mode = 'gamepad'
      x += state.x
      y += state.y
      aimX += state.aimX
      aimY += state.aimY
    }
    if (connectedPads > 0 && connected === 0) firePause()
    connectedPads = connected

    if (now.has('left')) x -= 1
    if (now.has('right')) x += 1
    if (now.has('up')) y -= 1
    if (now.has('down')) y += 1
    const len = Math.hypot(x, y)
    this.x = len > 1 ? x / len : x
    this.y = len > 1 ? y / len : y
    this.aimX = Math.max(-1, Math.min(1, aimX))
    this.aimY = Math.max(-1, Math.min(1, aimY))
    this.navX = step('x', x > 0.5 ? 1 : x < -0.5 ? -1 : 0, dt)
    this.navY = step('y', y > 0.5 ? 1 : y < -0.5 ? -1 : 0, dt)

    this.pointer.pressed = pointerWentDown
    this.pointer.released = pointerWentUp
    this.pointer.down = pointerDown
    pointerWentDown = pointerWentUp = false

    if (pressListeners.size) {
      for (const b of now) {
        if (before.has(b)) continue
        for (const cb of pressListeners) cb(b)
        break
      }
    }
  },

  held: (button) => now.has(button),
  pressed: (button) => now.has(button) && !before.has(button),
  released: (button) => !now.has(button) && before.has(button),

  /**
   * On-screen controls (touch.js): add a stick vector and held buttons to this frame, after
   * update(). The stick adds to x/y (clamped to the unit circle); buttons join held/pressed/
   * released like any other, so a game reads them the same way whatever the player holds.
   */
  inject({ x = 0, y = 0, buttons = [] } = {}) {
    if (x || y) {
      const sx = this.x + x
      const sy = this.y + y
      const len = Math.hypot(sx, sy)
      this.x = len > 1 ? sx / len : sx
      this.y = len > 1 ? sy / len : sy
    }
    for (const b of buttons) {
      if (!now.has(b) && !before.has(b)) for (const cb of pressListeners) cb(b)
      now.add(b)
    }
  },

  /** The game's own on-screen pause button was tapped: counts as one press of `menu`. */
  requestMenu() {
    menuRequested = true
  },

  /** Extra key bindings, by KeyboardEvent.code: input.extendKeys({ KeyR: 'y', KeyX: 'b' }). */
  extendKeys(map) {
    Object.assign(keys, map)
  },

  /** Text for a button in the current mode, e.g. `Press ${input.label('a')} to start`. */
  label(button) {
    return LABELS[this.mode]?.[button] ?? LABELS.keyboard[button] ?? button.toUpperCase()
  },
  stickLabel() {
    return STICK_LABELS[this.mode] ?? STICK_LABELS.keyboard
  },
  dpadLabel() {
    return DPAD_LABELS[this.mode] ?? DPAD_LABELS.keyboard
  },

  /** Pause the game when this fires (launcher overlay, window hidden or unfocused, pads gone). */
  onPause(cb) {
    pauseListeners.add(cb)
    return () => pauseListeners.delete(cb)
  },
  /** The launcher's overlay closed or the window came back. Don't auto-resume gameplay; refresh timers. */
  onResume(cb) {
    resumeListeners.add(cb)
    return () => resumeListeners.delete(cb)
  },
  /** Any button newly pressed from any device (audio unlock uses it). */
  onAnyPress(cb) {
    pressListeners.add(cb)
    return () => pressListeners.delete(cb)
  }
}

const attached = { canvas: null, w: 1280, h: 800, listening: false }

/** attach()'s space, or the fit's current size when the canvas fills the screen (fit.js fill). */
function liveSpace() {
  const fit = attached.canvas?.__fit
  return fit?.fill ? { w: fit.w, h: fit.h } : { w: attached.w, h: attached.h }
}
let pointerDown = false
// Went down / came up since the last update: a quick click or tap can do both between frames.
let pointerWentDown = false
let pointerWentUp = false

addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return
  const button = keys[e.code]
  if (!button) return
  if (!e.repeat) {
    codesDown.add(e.code)
    tapped.add(button)
  }
  input.mode = 'keyboard'
  e.preventDefault()
})
addEventListener('keyup', (e) => codesDown.delete(e.code))
addEventListener('blur', () => {
  codesDown.clear()
  queueWindowPause()
})
addEventListener('focus', fireResume)
document.addEventListener('visibilitychange', () => (document.hidden ? queueWindowPause() : fireResume()))
// Phones: the screen locks or the app is sent to the background. Most browsers fire
// visibilitychange too; these are the ones that don't, or that fire first.
addEventListener('pagehide', queueWindowPause)
document.addEventListener('freeze', queueWindowPause)

// The launcher's overlay (pause menu) and its events, when running inside it.
const api = launcher()
api?.onPause?.(() => {
  input.paused = true
  firePause()
})
api?.onResume?.(() => {
  input.paused = false
  fireResume()
})
addEventListener('pushplay:pause', () => {
  input.paused = true
  firePause()
})
addEventListener('pushplay:resume', () => {
  input.paused = false
  fireResume()
})
