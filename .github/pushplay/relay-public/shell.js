// The party join page: the same page for every game. It joins a TV's party by code, gets the
// game's controller from the TV, runs it in a sandboxed frame (frame.html) and passes messages
// between the two. It survives locked phones and Wi-Fi changes: the seat is kept on the relay
// and taken back with a resume token.
//
// Messages inside the relay's `send` payload (d), host → phone:
//   {k:'cb', h, i, n, s}   controller chunk i of n (n = 0: "use the one you have", h = its hash)
//   anything else          passed to the controller
// Controller ↔ join page, besides the relay: a controller that wants the phone's motion sensors
// posts {type:'motion', on:true}; the join page asks for permission only then (iOS needs a tap
// on this page, so it shows an "Allow motion" button), answers {type:'motion', state:'on' |
// 'ask' | 'denied' | 'unsupported' | 'insecure'} ('ask': waiting for that tap; 'insecure': the page
// isn't https, so the browser hides the sensors) and streams {type:'motion', r:{b, g, x, y, z}, s:[…]}
// until {type:'motion', on:false}. r: tilt in degrees and the strongest movement in m/s² since the
// last reading. s: every sensor event since then, {age, a:[x,y,z], g:[x,y,z], w:[alpha,beta,gamma],
// o:[b,g,a]} (age in ms before the message was posted, a without gravity, g with it, w the rotation
// rate in deg/s, o the latest orientation), so a controller can detect gestures at the full sensor rate.
// phone → host:
//   {k:'hi', h}            "I'm (back) here; I have controller h": the host replies with the
//                          controller if needed, then everything the controller should show
//   anything else          from the controller

const COLORS = ['#ffb547', '#ff6b6b', '#4dd8a8', '#5aa9ff', '#c38bff', '#ff8fd0', '#f5e663', '#8ce05a']
const store = {
  get: (k) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v)
    } catch {}
  }
}
const session = {
  get: (k) => {
    try {
      return sessionStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k, v) => {
    try {
      if (v === null) sessionStorage.removeItem(k)
      else sessionStorage.setItem(k, v)
    } catch {}
  }
}
const $ = (id) => document.getElementById(id)

const ERRORS = {
  'not-found': 'No party with that code. Check the TV.',
  full: 'That party is full.',
  locked: "That game has started and isn't letting new players in.",
  'bad-message': 'Something went wrong. Try again.'
}
const CLOSED = { 'host-left': 'The game ended.', idle: 'The party closed after a quiet spell.', kicked: 'You were removed from the party.' }

let ws = null
let code = ''
let me = null // { id, name, color }
let resume = null
let left = false
let retry = 0
let retryTimer = null
let frame = null
let frameReady = false
let pending = [] // messages for the controller until it's ready
let chunks = null
let wakeLock = null

// ---- join form ---------------------------------------------------------------------------

const fromPath = /^\/j\/([A-Za-z]{4})\/?$/.exec(location.pathname)?.[1]?.toUpperCase()
let color = store.get('party:color') ?? COLORS[Math.floor(Math.random() * COLORS.length)]
$('code').value = fromPath ?? ''
$('name').value = store.get('party:name') ?? ''
for (const c of COLORS) {
  const b = document.createElement('button')
  b.type = 'button'
  b.style.background = c
  b.setAttribute('aria-label', c)
  b.setAttribute('aria-pressed', String(c === color))
  b.onclick = () => {
    color = c
    for (const o of $('colors').children) if (o.tagName === 'BUTTON') o.setAttribute('aria-pressed', String(o === b))
  }
  $('colors').append(b)
}

// Back on the page with a seat still held (reload, or the browser dropped the tab): rejoin.
const held = fromPath && session.get(`party:resume:${fromPath}`)
if (held && $('name').value) join(fromPath, $('name').value, held)
else showForm()

function showForm(error = '') {
  $('play').hidden = true
  $('join').hidden = false
  $('error').textContent = error
  $('go').disabled = false
  ;($('code').value ? $('name') : $('code')).focus()
}

$('join').onsubmit = (e) => {
  e.preventDefault()
  const c = $('code').value.trim().toUpperCase()
  const name = $('name').value.trim()
  if (!/^[A-Z]{4}$/.test(c)) return showForm('Room codes are four letters.')
  if (!name) return showForm('Pick a name.')
  store.set('party:name', name)
  store.set('party:color', color)
  history.replaceState(null, '', `/j/${c}`)
  join(c, name, session.get(`party:resume:${c}`))
}

$('leave').onclick = () => {
  left = true
  send({ t: 'leave' })
  session.set(`party:resume:${code}`, null)
  ws?.close(1000)
  unmount()
  history.replaceState(null, '', '/')
  $('code').value = ''
  showForm()
}

// ---- connection --------------------------------------------------------------------------

function join(c, name, token) {
  code = c
  resume = token
  me = { id: null, name, color }
  left = false
  $('go').disabled = true
  $('join').hidden = true
  $('play').hidden = false
  $('who').textContent = name
  $('swatch').style.background = color
  $('room').textContent = code
  notice('Joining…')
  connect()
}

function connect() {
  clearTimeout(retryTimer)
  if (ws && ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) return
  const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/?party=1`)
  ws = socket
  socket.onopen = () => send({ t: 'party-join', room: code, name: me.name, color: me.color, resume })
  socket.onmessage = (e) => receive(JSON.parse(e.data))
  socket.onclose = (e) => {
    if (ws !== socket || left) return
    ws = null
    if (e.code === 4001) return notice('This party is open in another tab.', 'Use this tab', connect)
    if (e.code === 4008) return notice('Online play is resting until tomorrow.')
    // Lost the connection (locked phone, Wi-Fi change): the seat waits for us, so keep trying.
    notice('Reconnecting…')
    retryTimer = setTimeout(connect, Math.min(8000, 500 * 2 ** retry++))
  }
}

function send(msg) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}

function receive(msg) {
  switch (msg.t) {
    case 'party-joined':
      retry = 0
      me.id = msg.you
      resume = msg.resume
      session.set(`party:resume:${code}`, resume)
      keepAwake()
      hello()
      return
    case 'host-away':
      return notice('The TV lost its connection. Hang on…')
    case 'host-back':
      return hello()
    case 'closed':
      left = true
      session.set(`party:resume:${code}`, null)
      ws?.close(1000)
      unmount()
      return notice(CLOSED[msg.reason] ?? 'The party closed.', 'Join another', () => {
        history.replaceState(null, '', '/')
        $('code').value = ''
        showForm()
      })
    case 'error':
      if (msg.code === 'not-found' && resume) session.set(`party:resume:${code}`, null)
      left = true
      ws?.close(1000)
      return showForm(ERRORS[msg.code] ?? ERRORS['bad-message'])
    case 'warn':
      return
    case 'msg':
      return fromHost(msg.d)
  }
}

/** Tell the host we're here, and which controller we already have. */
function hello() {
  notice('Getting the game ready…')
  send({ t: 'send', d: { k: 'hi', h: store.get('party:controller-hash') } })
}

function fromHost(d) {
  if (!d || typeof d !== 'object') return
  if (d.k !== 'cb') return toController(d)
  if (d.n === 0) {
    const html = store.get('party:controller-hash') === d.h ? store.get('party:controller') : null
    if (html) return mount(html)
    // The cache went missing since we said hello: ask again, with nothing cached.
    return send({ t: 'send', d: { k: 'hi', h: null } })
  }
  if (!chunks || chunks.h !== d.h) chunks = { h: d.h, parts: [] }
  chunks.parts[d.i] = d.s
  if (chunks.parts.filter((p) => p !== undefined).length < d.n) return
  const html = chunks.parts.join('')
  chunks = null
  store.set('party:controller', html)
  store.set('party:controller-hash', d.h)
  mount(html)
}

// ---- the controller frame ----------------------------------------------------------------

function mount(html) {
  // Keep messages waiting for the controller: the host sends everything right after the
  // controller pages, which are paced, so the state often arrives first.
  frame?.remove()
  frameReady = false
  frame = document.createElement('iframe')
  frame.setAttribute('sandbox', 'allow-scripts')
  frame.setAttribute('allow', 'fullscreen; accelerometer; gyroscope')
  frame.src = '/frame.html'
  frame.html = html
  $('stage').append(frame)
}

function unmount() {
  motionOff()
  frame?.remove()
  frame = null
  frameReady = false
  pending = []
}

function toController(d) {
  if (frameReady) frame.contentWindow.postMessage({ type: 'msg', d }, '*')
  else pending.push(d)
}

addEventListener('message', (e) => {
  if (!frame || e.source !== frame.contentWindow || !e.data) return
  const m = e.data
  if (m.type === 'frame') frame.contentWindow.postMessage({ type: 'load', html: frame.html }, '*')
  else if (m.type === 'ready') {
    frameReady = true
    frame.contentWindow.postMessage({ type: 'me', me: { ...me, room: code } }, '*')
    for (const d of pending.splice(0)) toController(d)
    notice(null)
  } else if (m.type === 'send') send({ t: 'send', d: m.d })
  else if (m.type === 'vibrate') navigator.vibrate?.(Math.min(1000, Number(m.ms) || 0))
  else if (m.type === 'motion') m.on ? motionOn() : motionOff()
})

// ---- motion sensors, only for controllers that ask ----------------------------------------

const motion = { wanted: false, granted: false, listening: false, tilt: null, peak: null, samples: [], timer: null, button: null, seen: false }
const toFrame = (d) => frame?.contentWindow?.postMessage({ type: 'motion', ...d }, '*')

function motionOn() {
  motion.wanted = true
  if (!window.isSecureContext) return toFrame({ state: 'insecure' })
  if (typeof DeviceOrientationEvent === 'undefined') return toFrame({ state: 'unsupported' })
  if (motion.listening) return toFrame({ state: 'on' })
  const ask = [DeviceOrientationEvent, globalThis.DeviceMotionEvent].filter((E) => typeof E?.requestPermission === 'function')
  // Once allowed, iOS keeps it for the page: later challenges start without asking again.
  if (!ask.length || motion.granted) return listen()
  // iOS: permission needs a tap on this page, not inside the controller's frame.
  motion.button?.remove()
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = 'Allow motion controls'
  b.style.cssText = 'position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:20;padding:16px 24px;min-height:56px;border-radius:16px;background:#ffb547;color:#0d0f14;font-weight:800;font-size:18px;box-shadow:0 6px 24px rgba(0,0,0,.4)'
  b.onclick = async () => {
    b.remove()
    motion.button = null
    try {
      const results = await Promise.all(ask.map((E) => E.requestPermission()))
      if (results.every((r) => r === 'granted')) {
        motion.granted = true
        if (motion.wanted) listen()
      }
      else toFrame({ state: 'denied' })
    } catch {
      toFrame({ state: 'denied' })
    }
  }
  motion.button = b
  document.body.append(b)
  toFrame({ state: 'ask' })
}

function listen() {
  motion.listening = true
  addEventListener('deviceorientation', onTilt)
  addEventListener('devicemotion', onMove)
  motion.timer = setInterval(flushMotion, 16)
  toFrame({ state: 'on' })
  // Desktop browsers have the API but no sensor: no events ever arrive.
  setTimeout(() => {
    if (motion.listening && !motion.seen) {
      toFrame({ state: 'unsupported' })
      motionOff()
    }
  }, 1500)
}

function motionOff() {
  motion.wanted = false
  motion.button?.remove()
  motion.button = null
  if (!motion.listening) return
  motion.listening = false
  removeEventListener('deviceorientation', onTilt)
  removeEventListener('devicemotion', onMove)
  clearInterval(motion.timer)
}

function onTilt(e) {
  if (e.beta === null) return
  motion.seen = true
  motion.tilt = { b: e.beta, g: e.gamma, a: e.alpha }
}
const vec = (v, ...k) => (v && typeof v[k[0]] === 'number' ? k.map((n) => Math.round(v[n] * 100) / 100) : null)
function onMove(e) {
  const a = vec(e.acceleration, 'x', 'y', 'z')
  const g = vec(e.accelerationIncludingGravity, 'x', 'y', 'z')
  const w = vec(e.rotationRate, 'alpha', 'beta', 'gamma')
  if (!a && !g && !w) return
  motion.seen = true
  if (a) {
    const m = Math.hypot(...a)
    if (!motion.peak || m > motion.peak.m) motion.peak = { m, x: a[0], y: a[1], z: a[2] }
  }
  const t = motion.tilt
  motion.samples.push({ t: e.timeStamp || performance.now(), a, g, w, o: t ? [t.b, t.g, t.a ?? null] : null })
  if (motion.samples.length > 64) motion.samples.shift()
}
function flushMotion() {
  if (!motion.tilt && !motion.peak && !motion.samples.length) return
  const r = (n) => Math.round((n ?? 0) * 10) / 10
  const p = motion.peak ?? { x: 0, y: 0, z: 0 }
  const at = performance.now()
  const s = motion.samples.splice(0).map(({ t, ...rest }) => ({ age: Math.round((at - t) * 10) / 10, ...rest }))
  toFrame({ r: { b: r(motion.tilt?.b), g: r(motion.tilt?.g), x: r(p.x), y: r(p.y), z: r(p.z) }, s })
  motion.peak = null
}

// ---- niceties ----------------------------------------------------------------------------

function notice(text, button, onClick) {
  $('notice').hidden = !text
  $('notice-text').textContent = text ?? ''
  $('notice-button').hidden = !button
  $('notice-button').textContent = button ?? ''
  $('notice-button').onclick = onClick ?? null
}

/** Keep the screen on while playing. */
async function keepAwake() {
  try {
    if (!wakeLock && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock?.request('screen')
      wakeLock?.addEventListener('release', () => (wakeLock = null))
    }
  } catch {}
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !me?.id || left) return
  keepAwake()
  // Phones often kill sockets in the background without telling us.
  if (ws?.readyState !== WebSocket.OPEN) {
    retry = 0
    connect()
  }
})
