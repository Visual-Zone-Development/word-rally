// pushplay runtime v10 — replaced by npm run update-kit; don't edit
// Party games: the game runs on the TV (a handheld or PC plugged into it), and players join from
// their phones or any browser: scan the QR code or type the room code on the join page. Local
// controllers can join too, so a party game works with phones, pads, or both.
//
// The TV runs everything. Phones run the game's controller.html (see controller.js), which shows
// what the TV sends it and sends back controls and choices.
//
//   const party = createParty({ input, minPlayers: 3, maxPlayers: 8 })
//   each frame, after input.update(dt):  party.update()
//   players:   party.players → [{ id, name, color, kind: 'phone' | 'local', connected }]
//   controls:  party.inputs[id] → { x, y, a, b }   party.pressed(id, 'a')
//   phones see:
//     party.public.round = 2            everyone's phone (never put secrets here)
//     party.view(id).hand = ['A♠']      only that player's phone
//     anything else stays on the TV
//   messages:  party.send(id, data) / party.send(null, data)    party.on('msg', ({ from, data }) => …)
//   events:    party.on('join' | 'leave' | 'away' | 'back' | 'open' | 'end' | 'msg', fn)
//
// public and views are sent as changes only, a few times a second: write them freely. A phone
// that drops (locked screen, Wi-Fi change) keeps its seat for two minutes and gets everything
// again when it's back; party.inputs[id] is cleared meanwhile, so it stands still.
import { diff, snapshot } from './net.js'

export const PARTY_VERSION = 1

/** Time between updates to phones. Phones show menus and cards, not 60 fps action. */
const TICK_MS = 50
/** Controller pages go out in pieces under the relay's message limit… */
const CHUNK_CHARS = 12_000
/** …and slowly enough to leave room for the game when many phones join at once. */
const CONTROLLER_BYTES_PER_SEC = 96 * 1024
const LOCAL_RELAY_PORT = 5174
const COLORS = ['#ffb547', '#ff6b6b', '#4dd8a8', '#5aa9ff', '#c38bff', '#ff8fd0', '#f5e663', '#8ce05a']
const PAD_BUTTONS = ['a', 'b']

const CLOSE_REASONS = {
  4003: "This build can't go online. Rebuild it to get a fresh online pass.",
  4008: 'Online play is resting until tomorrow.',
  4009: 'Too many connections from this network.',
  4029: 'The game sent too much data.'
}

export function createParty({ input = null, minPlayers = 2, maxPlayers = 8, localPlayers = true } = {}) {
  let ws = null
  let closing = false
  let resume = session('get')
  let retry = 0
  let retryTimer = null
  let lastTick = 0
  let lastPublic = {}
  let lastViews = {}
  let sentPlayers = ''
  let controller = null // { html, hash } once loaded
  let controllerLoad = null
  let outbox = [] // controller pieces: [to, d]
  let budget = 0
  let lastUpdate = 0
  let incoming = {} // phone id → buttons pressed since the last update
  let taps = {}
  const listeners = {}

  const party = {
    /** idle | connecting | open | reconnecting | error */
    status: 'idle',
    error: '',
    /** Room code, and the link the QR code points at. */
    code: null,
    joinUrl: '',
    minPlayers,
    maxPlayers,
    localPlayers,
    players: [],
    inputs: {},
    /** Shared with every phone. */
    public: {},
    /** Each player's private view, by id. party.view(id) creates one. */
    views: {},
    locked: false,

    view: (id) => (party.views[id] ??= {}),
    player: (id) => party.players.find((p) => p.id === id),
    /** 0, 1, 2… in join order: for colours and spawn points. */
    slot: (id) => party.players.findIndex((p) => p.id === id),

    /** True on the frame a player's button went down. */
    pressed(id, button) {
      const p = party.player(id)
      if (p?.kind === 'local') return Boolean(input?.pads[p.pad]?.pressed(button))
      return Boolean(taps[id]?.has(button))
    },

    on(type, fn) {
      ;(listeners[type] ??= []).push(fn)
      return () => (listeners[type] = listeners[type].filter((f) => f !== fn))
    },

    /** Open the party (the lobby does this). */
    open() {
      if (ws || party.status === 'open') return
      closing = false
      controllerLoad ??= loadController()
      connect()
    },
    /** End the party: phones are told the game ended. */
    close() {
      closing = true
      clearTimeout(retryTimer)
      send({ t: 'leave' })
      ws?.close(1000)
      ws = null
      resume = null
      session('set', null)
      party.status = 'idle'
      party.code = null
      party.players = party.players.filter((p) => p.kind === 'local')
    },

    /** A one-off message to one phone, or every phone (to = null). */
    send(to, data) {
      send({ t: 'send', ...(to ? { to } : {}), d: { k: 'm', d: data } })
    },
    /** Stop new players joining (dropped players can still come back). */
    lock() {
      party.locked = true
      send({ t: 'lock' })
    },
    unlock() {
      party.locked = false
      send({ t: 'unlock' })
    },
    kick(id) {
      const p = party.player(id)
      if (p?.kind === 'local') removePlayer(id)
      else send({ t: 'kick', id })
    },

    /** A controller on this machine joins as a player (the lobby calls this when a pad presses A). */
    addLocal(pad) {
      const id = `local${pad}`
      if (party.player(id) || party.players.length >= maxPlayers) return null
      const p = { id, name: `Player ${party.players.length + 1}`, color: freeColor(), kind: 'local', connected: true, pad }
      party.players.push(p)
      party.inputs[id] = {}
      emit('join', p)
      return p
    },

    /** Call once per frame, after input.update(dt) and before the game reads inputs. */
    update(now = performance.now()) {
      taps = incoming
      incoming = {}
      for (const p of party.players) {
        if (p.kind !== 'local') continue
        const pad = input?.pads[p.pad]
        if (!pad) continue
        const v = { x: pad.x, y: pad.y }
        for (const b of PAD_BUTTONS) v[b] = pad.held(b)
        party.inputs[p.id] = v
      }

      // Controller pages, paced.
      const dt = lastUpdate ? Math.min(0.25, (now - lastUpdate) / 1000) : 0
      lastUpdate = now
      budget = Math.min(CONTROLLER_BYTES_PER_SEC, budget + dt * CONTROLLER_BYTES_PER_SEC)
      while (outbox.length && budget > 0) {
        const [to, d] = outbox.shift()
        budget -= d.s.length
        send({ t: 'send', to, d })
      }

      if (party.status !== 'open' || now - lastTick < TICK_MS) return
      lastTick = now
      const pub = snapshot(party.public)
      const ops = diff(lastPublic, pub)
      if (ops.length) send({ t: 'send', d: { k: 'p', p: ops } })
      lastPublic = pub
      for (const p of party.players) {
        if (p.kind !== 'phone' || !p.connected || !lastViews[p.id]) continue
        const v = snapshot(party.views[p.id] ?? {})
        const vops = diff(lastViews[p.id], v)
        if (vops.length) send({ t: 'send', to: p.id, d: { k: 'v', p: vops } })
        lastViews[p.id] = v
      }
      const list = playerList()
      if (list !== sentPlayers) {
        sentPlayers = list
        send({ t: 'send', d: { k: 'pl', players: JSON.parse(list) } })
      }
    }
  }

  function emit(type, payload) {
    for (const fn of listeners[type] ?? []) fn(payload)
  }

  function playerList() {
    return JSON.stringify(party.players.map(({ id, name, color, kind, connected }) => ({ id, name, color, kind, connected })))
  }

  function freeColor() {
    return COLORS.find((c) => !party.players.some((p) => p.color === c)) ?? COLORS[party.players.length % COLORS.length]
  }

  function send(msg) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }

  async function connect() {
    party.status = party.status === 'reconnecting' ? 'reconnecting' : 'connecting'
    party.error = ''
    const address = await relayAddress()
    if (closing) return
    if (!address) return fail("This build isn't set up for party play.")
    const socket = new WebSocket(address)
    ws = socket
    socket.onopen = () => send({ t: 'party-host', max: maxPlayers, ...(resume ? { resume } : {}) })
    socket.onmessage = (e) => receive(JSON.parse(e.data))
    socket.onclose = (e) => {
      if (ws !== socket || closing) return
      ws = null
      if (CLOSE_REASONS[e.code] || party.status === 'connecting') return fail(CLOSE_REASONS[e.code] ?? "Can't reach the game server. Check your connection.")
      // Dropped mid-party: the relay keeps it for a minute, so get back in with the same code.
      party.status = 'reconnecting'
      if (retry > 6) return fail('Lost the connection to the game server.')
      retryTimer = setTimeout(connect, Math.min(8000, 500 * 2 ** retry++))
    }
  }

  function fail(message) {
    party.status = 'error'
    party.error = message
    emit('end', message)
  }

  function receive(msg) {
    switch (msg.t) {
      case 'party': {
        const fresh = msg.room !== party.code
        party.code = msg.room
        party.joinUrl = msg.join ?? ''
        resume = msg.resume
        session('set', resume)
        party.status = 'open'
        retry = 0
        if (fresh) {
          lastPublic = {}
          lastViews = {}
          party.players = party.players.filter((p) => p.kind === 'local')
        }
        // After a TV reload the seats are still there; their phones say hello again.
        for (const s of msg.players) {
          const p = party.player(s.id)
          if (p) p.connected = !s.away
          else addPhone(s, !s.away)
        }
        sentPlayers = ''
        if (party.locked) send({ t: 'lock' })
        emit('open', party.code)
        return
      }
      case 'peer-join':
        return emit('join', addPhone(msg, true))
      case 'peer-away':
      case 'peer-back': {
        const p = party.player(msg.id)
        if (!p) return
        p.connected = msg.t === 'peer-back'
        party.inputs[p.id] = {}
        if (!p.connected) delete lastViews[p.id]
        return emit(p.connected ? 'back' : 'away', p)
      }
      case 'peer-leave':
        return removePlayer(msg.id)
      case 'closed':
        ws?.close(1000)
        ws = null
        resume = null
        session('set', null)
        return fail(msg.reason === 'idle' ? 'The party closed after a quiet spell.' : 'The party closed.')
      case 'error':
        if (msg.code === 'busy') fail('The server is busy. Try again soon.')
        return
      case 'msg':
        return fromPhone(msg.from, msg.d)
    }
  }

  function addPhone({ id, name, color }, connected) {
    // Everyone gets their own colour: a phone whose pick is taken gets a free one.
    const taken = !color || party.players.some((p) => p.color === color)
    const p = { id, name, color: taken ? freeColor() : color, kind: 'phone', connected }
    party.players.push(p)
    party.inputs[id] = {}
    return p
  }

  function removePlayer(id) {
    const p = party.player(id)
    if (!p) return
    party.players = party.players.filter((x) => x !== p)
    delete party.inputs[id]
    delete party.views[id]
    delete lastViews[id]
    emit('leave', p)
  }

  async function fromPhone(from, d) {
    const p = party.player(from)
    if (!p || !d || typeof d !== 'object') return
    if (d.k === 'i') {
      const next = d.i && typeof d.i === 'object' ? d.i : {}
      const before = party.inputs[from] ?? {}
      for (const [b, v] of Object.entries(next)) if (v === true && !before[b]) (incoming[from] ??= new Set()).add(b)
      party.inputs[from] = next
    } else if (d.k === 'm') emit('msg', { from, data: d.d })
    else if (d.k === 'hi') {
      p.connected = true
      await sendController(from, d.h)
      // Everything, once; after that, the same changes as everyone else.
      send({ t: 'send', to: from, d: { k: 'P', s: lastPublic } })
      lastViews[from] = snapshot(party.views[from] ?? {})
      send({ t: 'send', to: from, d: { k: 'V', s: lastViews[from] } })
      send({ t: 'send', to: from, d: { k: 'pl', players: JSON.parse(playerList()) } })
    }
  }

  async function sendController(to, have) {
    controller ??= await controllerLoad
    if (!controller) return
    const { html, hash } = controller
    outbox = outbox.filter(([id]) => id !== to)
    if (have === hash) return send({ t: 'send', to, d: { k: 'cb', h: hash, n: 0 } })
    const n = Math.ceil(html.length / CHUNK_CHARS)
    for (let i = 0; i < n; i++) outbox.push([to, { k: 'cb', h: hash, i, n, s: html.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS) }])
  }

  if (typeof window !== 'undefined') window.__kitParty = party // the build check reads this
  return party
}

/** The game's controller.html with the controller runtime at the top. */
async function loadController() {
  try {
    const [page, runtime] = await Promise.all([text(new URL('controller.html', document.baseURI)), text(new URL('./controller.js', import.meta.url))])
    const script = `<script>${runtime.replace(/<\/script/gi, '<\\/script')}</script>`
    const html = /<head[^>]*>/i.test(page) ? page.replace(/<head[^>]*>/i, (m) => m + script) : script + page
    return { html, hash: hash(html) }
  } catch (err) {
    console.warn('party: no controller.html, so phones have nothing to show', err)
    return null
  }
}

async function text(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return res.text()
}

/** A short fingerprint (cyrb53), so phones can keep a controller they already have. */
function hash(s) {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/** Where the relay is: __net.json (written into the build), else a relay running next to the game. */
async function relayAddress() {
  try {
    const res = await fetch(new URL('__net.json', document.baseURI))
    if (res.ok) {
      const { url, token } = await res.json()
      if (url) return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token ?? '')}`
    }
  } catch {}
  if (['localhost', '127.0.0.1'].includes(location.hostname)) return `ws://${location.hostname}:${LOCAL_RELAY_PORT}/?game=local`
  return null
}

/** The TV keeps its party through a reload. */
function session(op, value) {
  const key = `party-resume:${location.pathname}`
  try {
    if (op === 'get') return sessionStorage.getItem(key)
    if (value === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, value)
  } catch {}
  return null
}
