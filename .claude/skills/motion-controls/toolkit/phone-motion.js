// createPhoneMotion(): the phone side of motion controls, for a party game's controller.html.
// controller.html must be one file, so paste this inside its <script> (the --controller motion
// template already has it). It needs clamp, round and DEFAULT_BETA defined before it:
//   const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
//   const round = (v, k = 10) => Math.round(v * k) / k
//   const DEFAULT_BETA = 35
//
//   const pm = createPhoneMotion({
//     cfg: () => controller.mine.cfg ?? controller.public.cfg ?? {},   // live swing settings from the TV
//     onSwing: (s) => controller.send({ swing: { dir: s.dir, p: s.p, m: s.m, pt: s.pt } }),
//     onChange: () => render(),                                         // state changed (on, ask, touch:…)
//     onSample: ({ t, dt, a, w, up }) => {}                             // every sensor event, screen axes
//   })
//   pm.state, pm.ori { b, g, a }, pm.up [x, y, z], pm.gyro { x, y }, pm.m, pm.still, pm.hz, pm.bias, pm.angle
//
// Same code as controller.html in https://github.com/Visual-Zone-Development/motion-lab and toybox-bowling: keep the copies in step.

// ==== phone motion =========================================================================
/**
 * Reads the phone's motion sensors and turns them into what a game needs. Every sensor event
 * is used (60-200 a second, not one reading per network message), each with its own time, so
 * a swing's moment is known to the millisecond. It also:
 *   - takes readings from the join page (which iOS sends them to) or from this frame (which
 *     Android sends them to once it's tapped), whichever is fresh;
 *   - turns axes with the screen, so landscape doesn't rotate swipes;
 *   - learns the gyro's drift while the phone lies still and takes it off;
 *   - gives tilt as the direction of "up" (no gimbal flip near upright), gyro aiming as
 *     running totals (a lost message loses nothing), a live strength, and stillness;
 *   - hands every sample to onSample({ t, dt, a, w, up }) in screen axes (a in m/s², w in
 *     deg/s about x, y, z) for gestures of the game's own.
 * Live tuning comes from cfg() (the TV's controller.public.cfg), so nothing here is fixed.
 */
function createPhoneMotion({ cfg, onSwing, onChange, onSample = () => {} }) {
  const pm = {
    state: 'waiting', // waiting | ask | on | touch:unsupported | touch:denied | touch:insecure
    ori: { b: DEFAULT_BETA, g: 0, a: undefined },
    up: null, // [x, y, z], screen axes: x right, y up the screen, z out of it
    gyro: { x: 0, y: 0, on: false },
    m: 0, // strength now (m/s², or the gyro's equivalent when the station counts turning)
    still: false,
    hz: 0,
    bias: 0, // deg/s of gyro drift being taken off
    angle: 0, // screen rotation, degrees
    last: -1e9 // performance.now() of the newest reading
  }
  const direct = { last: -1e9, ori: null }
  const bias = [0, 0, 0]
  const hist = []
  let lastT = -Infinity
  let stillFor = 0
  let restFor = 0
  let count = 0
  let countAt = performance.now()
  let grav = null
  let swing = null
  let cooldown = -Infinity
  const set = (st) => {
    if (pm.state === st) return
    pm.state = st
    onChange()
  }

  parent.postMessage({ type: 'motion', on: true }, '*')
  addEventListener('message', (e) => {
    if (e.source !== parent || e.data?.type !== 'motion') return
    const d = e.data
    if (d.state) set(d.state === 'on' || d.state === 'ask' || d.state === 'waiting' ? d.state : 'touch:' + d.state)
    if (performance.now() - direct.last < 150) return // this frame hears the sensors itself
    const at = performance.now()
    if (Array.isArray(d.s) && d.s.length) for (const s of d.s) sample(at - (s.age || 0), s.a, s.g, s.w, s.o)
    else if (d.r) sample(at, [d.r.x, d.r.y, d.r.z], null, null, [d.r.b, d.r.g, null]) // an older join page
  })
  // Android only sends sensor events to the focused frame: listen here too.
  addEventListener('deviceorientation', (e) => {
    if (typeof e.beta !== 'number') return
    direct.ori = [e.beta, e.gamma ?? 0, typeof e.alpha === 'number' ? e.alpha : null]
  })
  const vec = (v, ...k) => (v && typeof v[k[0]] === 'number' ? k.map((n) => v[n]) : null)
  addEventListener('devicemotion', (e) => {
    const a = vec(e.acceleration, 'x', 'y', 'z')
    const g = vec(e.accelerationIncludingGravity, 'x', 'y', 'z')
    const w = vec(e.rotationRate, 'alpha', 'beta', 'gamma')
    if (!a && !g && !w) return
    direct.last = performance.now()
    sample(e.timeStamp || direct.last, a, g, w, direct.ori)
  })
  try {
    screen.orientation?.lock?.('portrait').catch(() => {})
  } catch {}

  /** Device x/y → screen x/y: the phone turned to landscape turns its axes with it. */
  function toScreen(x, y) {
    const r = (pm.angle * Math.PI) / 180
    const c = Math.cos(r)
    const s = Math.sin(r)
    return [x * c - y * s, x * s + y * c]
  }

  function sample(t, a, g, w, o) {
    if (t <= lastT - 1) return // already seen (both sources overlapping)
    const dt = clamp((t - (lastT > -Infinity ? lastT : t - 16)) / 1000, 0.001, 0.05)
    lastT = t
    pm.last = performance.now()
    if (pm.state !== 'on' && !pm.state.startsWith('touch')) set('on')
    if (pm.state.startsWith('touch')) return
    count++
    if (pm.last - countAt >= 1000) {
      pm.hz = Math.round((count * 1000) / (pm.last - countAt))
      count = 0
      countAt = pm.last
    }
    pm.angle = screen.orientation?.angle ?? (typeof window.orientation === 'number' ? window.orientation : 0)
    if (o) pm.ori = { b: o[0], g: o[1], a: typeof o[2] === 'number' ? o[2] : undefined }
    // Movement without gravity. Some phones only give it with gravity: take a slow average off.
    if (!a && g) {
      grav = grav ? grav.map((v, i) => v + (g[i] - v) * 0.08) : [...g]
      a = g.map((v, i) => v - grav[i])
    }
    a ??= [0, 0, 0]
    // Up, from the phone's own (sensor-fused) orientation, in screen axes.
    const rb = (pm.ori.b * Math.PI) / 180
    const rg = (pm.ori.g * Math.PI) / 180
    const [ux, uy] = toScreen(-Math.sin(rg) * Math.cos(rb), Math.sin(rb))
    pm.up = [ux, uy, Math.cos(rg) * Math.cos(rb)]
    const [ax, ay] = toScreen(a[0], a[1])
    const az = a[2]
    const am = Math.hypot(ax, ay, az)
    // Directions in the room, not the phone: up is toward the ceiling (along "up"), right is
    // the screen's right edge levelled. So a flick up reads as up whether the phone is held
    // upright or flat like a remote (where the phone's own y axis points forward).
    const [qx, qy, qz] = pm.up
    const rx = 1 - qx * qx
    const ry = -qx * qy
    const rz = -qx * qz
    const rl = Math.hypot(rx, ry, rz) || 1
    const dx = (ax * rx + ay * ry + az * rz) / rl
    const dy = ax * qx + ay * qy + az * qz

    // Gyro: rotation about the phone's z (alpha), x (beta) and y (gamma), in deg/s.
    let wx = 0
    let wy = 0
    let wz = 0
    let wm = 0
    if (w) {
      const raw = Math.hypot(w[0] - bias[0], w[1] - bias[1], w[2] - bias[2])
      // Lying still: what the gyro reads is drift. Learn it slowly and take it off.
      stillFor = raw < 4 && am < 0.35 ? stillFor + dt : 0
      // Drift is only learned when the phone is truly at rest (on a table, not in a hand
      // aiming slowly), slowly, and never more than a real gyro drifts: otherwise a steady
      // aim gets "corrected" away.
      restFor = Math.hypot(...w) < 1.5 && am < 0.15 ? restFor + dt : 0
      if (restFor > 1.5) for (let i = 0; i < 3; i++) bias[i] = clamp(bias[i] + (w[i] - bias[i]) * Math.min(1, dt * 0.3), -1.5, 1.5)
      pm.bias = round(Math.hypot(...bias))
      wz = w[0] - bias[0]
      ;[wx, wy] = toScreen(w[1] - bias[1], w[2] - bias[2])
      wm = Math.hypot(wx, wy, wz)
      gyroAim(wx, wy, wz, dt)
    } else stillFor = am < 0.35 ? stillFor + dt : 0
    pm.still = stillFor > 0.25
    const c = cfg()
    pm.m = Math.max(am, wm * (c.gk ?? 0))
    detect(t, pm.m, ax, ay, az, dx, dy, wm, c)
    onSample({ t, dt, a: [ax, ay, az], w: [wx, wy, wz], up: pm.up })
  }

  /**
   * Gyro aiming, the way Steam Input and JoyShockMapper do it: turning speed moves the sight
   * like a mouse. Left/right is turning around the real vertical, so it works however the
   * phone is held; up/down is tipping the top. Tremor is tightened toward zero, slow moves
   * are smoothed and fast ones go straight through.
   */
  function gyroAim(wx, wy, wz, dt) {
    const c = cfg()
    const [ux, uy, uz] = pm.up
    let yaw = wx * ux + wy * uy + wz * uz // turning left is positive
    let pitch = wx // tipping the top up is positive
    const speed = Math.hypot(yaw, pitch)
    const tighten = c.tighten ?? 1.5
    if (speed < tighten && speed > 0) {
      yaw *= speed / tighten
      pitch *= speed / tighten
    }
    hist.push([yaw, pitch])
    if (hist.length > 4) hist.shift()
    const avg = hist.reduce((s, v) => [s[0] + v[0] / hist.length, s[1] + v[1] / hist.length], [0, 0])
    const k = clamp((speed - (c.smoothLo ?? 4)) / ((c.smoothHi ?? 12) - (c.smoothLo ?? 4)), 0, 1)
    pm.gyro.x -= (yaw * k + avg[0] * (1 - k)) * dt
    pm.gyro.y -= (pitch * k + avg[1] * (1 - k)) * dt
    pm.gyro.on = true
  }

  /**
   * A swing starts when the strength passes the threshold. 'peak' swings (flicks, shakes) end
   * when it fades and are timed at their strongest moment. 'flip' swings (a bat) are timed
   * where the push turns into the stop, the fastest moment of the swing, which is when the
   * acceleration reverses, or for a mostly turning swing when the turning peaks. The readings
   * that push the same way as the first one give the direction.
   */
  function detect(t, m, ax, ay, az, dx, dy, wm, c) {
    const thr = c.thr ?? 12
    if (!swing) {
      if (m >= thr && t > cooldown) swing = { t0: t, m, peakT: t, fx: ax, fy: ay, fz: az, px: dx, py: dy, sx: dx, sy: dy, k: 1, wPeak: wm, wPeakT: t, flipT: 0 }
      return
    }
    const s = swing
    if (m > s.m) {
      s.m = m
      s.peakT = t
    }
    if (wm > s.wPeak) {
      s.wPeak = wm
      s.wPeakT = t
    }
    if (dx * s.px + dy * s.py > 0) {
      s.sx += dx
      s.sy += dy
      s.k++
    }
    const flip = c.at === 'flip'
    const pushed = Math.hypot(s.fx, s.fy, s.fz) > thr * 0.5
    if (flip && !s.flipT) {
      if (pushed && ax * s.fx + ay * s.fy + az * s.fz < 0) s.flipT = t
      else if (!pushed && s.wPeak > 0 && wm < s.wPeak * 0.6) s.flipT = s.wPeakT
    }
    const dur = t - s.t0
    const done = flip ? s.flipT || dur >= (c.winMs ?? 260) : (m < thr * 0.5 && dur >= 8) || dur >= (c.peakMs ?? 110)
    if (!done) return
    swing = null
    cooldown = t + (c.cd ?? 200)
    const sign = c.inv ? -1 : 1
    // The average push (not the sum, which would grow with the sensor rate).
    const ex = (s.sx / s.k) * sign
    const ey = (s.sy / s.k) * sign
    let dir = null
    if (Math.max(Math.abs(ex), Math.abs(ey)) > (c.dz ?? 2)) dir = Math.abs(ex) > Math.abs(ey) ? (ex > 0 ? 'right' : 'left') : ey > 0 ? 'up' : 'down'
    const full = c.full ?? 32
    const at = flip ? s.flipT || s.wPeakT : s.peakT
    onSwing({ dir, p: clamp((s.m - thr) / (full - thr), 0.15, 1), m: s.m, pt: at, raw: { x: round(s.px), y: round(s.py), z: round(s.fz), w: Math.round(s.wPeak) } })
  }
  return pm
}
// ==== end phone motion =====================================================================
