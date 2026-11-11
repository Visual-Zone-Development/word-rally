// Phone motion on the TV, for party games made with --controller motion. The phone screen
// (controller.html) reads the sensors and detects swings; this turns what it sends into what a
// game needs, one tracker per phone. Yours to change (it isn't a runtime file).
//
//   const motion = createMotion(party, { tiltRange: 25 })   // options: see DEFAULTS
//   each frame, after party.update():  motion.update(dt)
//   const m = motion.of(id)    // null until that phone sends motion
//     m.live              sensors on (or its touch pad), and connected
//     m.tilt.x / .y       -1..1, calibrated, smoothed (tilt like a tray)
//     m.wheel             -1..1 or null: the phone held up like a steering wheel and turned
//     m.swings            this frame's swings: [{ dir: 'left'|'right'|'up'|'down'|null, power 0..1, m, t }]
//                         dir is in the room (up = toward the ceiling); t is on the TV's clock (s)
//     m.button / m.pressed    the phone's big button (party.inputs[id].a)
//     m.still, m.state ('on' | 'touch' | 'ask' | 'waiting'), m.rtt, m.clockOff, m.hz
//   motion.center(id)      re-center: waits (up to centerWait) for the phone to be held still
//   motion.configure(cfg, id?)   swing detection for every phone, or one: { thr, cd, at, gk, … }
//   motion.now()           the TV clock swing times use (seconds)
//
// Why it works this way (docs/game-design/motion.md):
//   - Tilt and the wheel come from gravity, so they're absolute: no drift, lag can't make them wander.
//   - Swings are detected on the phone from every sensor event and timed there; the TV keeps the
//     fastest of the last few pings to know the phone's clock, so swing times are right to a few ms.
//   - Calibrate during a countdown (center() then play), not from a pose saved somewhere else.

const DEG = Math.PI / 180
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const wrap = (a) => ((((a + 180) % 360) + 360) % 360) - 180
const DIRS = ['left', 'right', 'up', 'down']

export const DEFAULTS = {
  tiltRange: 25, // degrees from the centre for full tilt
  wheelRange: 70, // degrees of wheel turn for full lock
  filterMin: 1.6, // Hz: One Euro smoothing for slow movement (lower = steadier, laggier)
  filterBeta: 0.6, // how quickly fast movement cuts through it
  wheelFilter: 2.2,
  pingEvery: 1, // s between clock checks (four quick ones when a phone arrives)
  clockSamples: 8, // the fastest round trip of these sets the clock difference
  centerWait: 1.5 // s to wait for a still phone before re-centering anyway
}

/** "Up" in the phone's axes from its beta/gamma (degrees). */
function upOf(b, g) {
  return [-Math.sin(g * DEG) * Math.cos(b * DEG), Math.sin(b * DEG), Math.cos(g * DEG) * Math.cos(b * DEG)]
}
/** Side and forward tilt (degrees) from "up": independent at any holding angle. */
const tiltOf = ([ux, uy, uz]) => ({ x: Math.asin(clamp(-ux, -1, 1)) / DEG, y: Math.atan2(uy, uz) / DEG })
/** The wheel angle: gravity across the phone's face (null while it lies too flat to tell). */
const wheelOf = ([ux, uy]) => (Math.hypot(ux, uy) > 0.35 ? Math.atan2(ux, uy) / DEG : null)

/** One Euro filter: steady when slow, quick when fast. */
function oneEuro(minCutoff, beta) {
  let x = null
  let dx = 0
  const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt))
  return {
    reset: () => (x = null),
    step(v, dt) {
      if (x === null || !dt) return (x = v)
      dx += alpha(1, dt) * ((v - x) / dt - dx)
      x += alpha(minCutoff + beta * Math.abs(dx), dt) * (v - x)
      return x
    }
  }
}

export function createMotion(party, options = {}) {
  const T = { ...DEFAULTS, ...options }
  const now = () => performance.now() / 1000
  const trackers = new Map()
  let pingId = 0

  function tracker(id) {
    let m = trackers.get(id)
    if (m) return m
    m = {
      id,
      live: false,
      state: 'waiting',
      tilt: { x: 0, y: 0 },
      wheel: null,
      swings: [],
      button: false,
      pressed: false,
      still: true,
      rtt: 0,
      clockOff: null,
      jitter: 0,
      hz: 0,
      raw: null,
      neutral: null,
      centering: 0,
      // internal
      _pending: [],
      _clock: [],
      _pings: new Map(),
      _pingAt: -1e9,
      _fast: 4,
      _f: { x: oneEuro(T.filterMin, T.filterBeta), y: oneEuro(T.filterMin, T.filterBeta), w: oneEuro(T.wheelFilter, T.filterBeta) }
    }
    trackers.set(id, m)
    return m
  }

  function centerNow(m) {
    m.centering = 0
    m.neutral = { u: m.raw.u, wheel: wheelOf(upOf(m.raw.b, m.raw.g)) }
    party.send(m.id, { buzz: 25 })
  }

  party.on('msg', ({ from, data }) => {
    if (!data || typeof data !== 'object') return
    const m = tracker(from)
    if (m._pings.has(data.pong)) {
      const sent = m._pings.get(data.pong)
      m._pings.delete(data.pong)
      const back = now()
      m._clock.push({ rtt: back - sent, off: typeof data.pt === 'number' ? data.pt / 1000 - (sent + back) / 2 : null })
      if (m._clock.length > T.clockSamples) m._clock.shift()
      const best = m._clock.reduce((a, c) => (c.rtt < a.rtt ? c : a))
      m.rtt = best.rtt
      m.clockOff = best.off
      m.jitter = Math.max(...m._clock.map((c) => c.rtt)) - best.rtt
    }
    if (data.center) motion.center(from)
    const s = data.swing
    if (s) {
      // On the phone's clock when the clock check is in, else from the delay estimate.
      const t = typeof s.pt === 'number' && m.clockOff !== null ? Math.min(now(), s.pt / 1000 - m.clockOff) : now() - m.rtt / 2 - (Number(s.age) || 0) / 1000
      m._pending.push({ dir: DIRS.includes(s.dir) ? s.dir : null, power: clamp(Number(s.p) || 0, 0, 1), m: Number(s.m) || 0, t })
    }
  })

  const motion = {
    now,
    of(id) {
      const m = trackers.get(id)
      return m && m.raw ? m : null
    },
    center(id) {
      const m = trackers.get(id)
      if (m?.raw) m.centering ||= now()
    },
    configure(cfg, id) {
      if (id) party.view(id).cfg = { ...cfg }
      else party.public.cfg = { ...cfg }
    },
    update(dt) {
      const t = now()
      for (const p of party.players) {
        if (p.kind !== 'phone') continue
        const m = tracker(p.id)
        const inp = party.inputs[p.id] ?? {}
        m.swings = m._pending.splice(0)
        m.state = inp.st ?? 'waiting'
        m.live = p.connected && (m.state === 'on' || m.state === 'touch')
        m.button = Boolean(inp.a)
        m.pressed = party.pressed(p.id, 'a')
        m.still = inp.still !== false
        m.hz = inp.ph?.hz ?? 0
        if (p.connected && t - m._pingAt > (m._fast > 0 ? 0.25 : T.pingEvery)) {
          m._pingAt = t
          m._fast--
          m._pings.set(++pingId, t)
          for (const k of m._pings.keys()) if (k < pingId - 8) m._pings.delete(k)
          party.send(p.id, { ping: pingId })
        }
        if (!m.live || typeof inp.tb !== 'number') {
          m.tilt.x = m.tilt.y = 0
          m.wheel = null
          for (const f of Object.values(m._f)) f.reset()
          continue
        }
        const u = Array.isArray(inp.u) && inp.u.length === 3 ? inp.u : upOf(inp.tb, inp.tg ?? 0)
        m.raw = { b: inp.tb, g: inp.tg ?? 0, a: inp.ta, u }
        if (!m.neutral) centerNow(m) // first reading: start level wherever it's held
        if (m.centering && (m.still || t - m.centering > T.centerWait)) centerNow(m)
        const now0 = tiltOf(u)
        const zero = tiltOf(m.neutral.u)
        m.tilt.x = m._f.x.step(clamp((now0.x - zero.x) / T.tiltRange, -1, 1), dt)
        m.tilt.y = m._f.y.step(clamp(wrap(now0.y - zero.y) / T.tiltRange, -1, 1), dt)
        // The wheel uses the phone's own axes (not turned with the screen).
        const w = wheelOf(upOf(inp.tb, inp.tg ?? 0))
        if (w !== null) {
          m.neutral.wheel ??= w
          m.wheel = m._f.w.step(clamp(-wrap(w - m.neutral.wheel) / T.wheelRange, -1, 1), dt)
        }
      }
    }
  }
  return motion
}
