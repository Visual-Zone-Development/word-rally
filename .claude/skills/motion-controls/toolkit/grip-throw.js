// Grip, swing, release (Toybox Bowling): read a throw from the samples while a button is held.
// Paste into controller.html after createPhoneMotion(); feed it from onSample and call readThrow()
// when the button is let go:
//   createPhoneMotion({ ..., onSample })          // onSample keeps samples while grip.down
//   on button up: controller.send({ throw: readThrow(grip.samples, performance.now()) })
// On the TV: speed from peak (deg/s, ~90 gentle to ~560 hard), line from yaw (deg, left +),
// hook from twist (deg; ~55 for a full hook). Which way a twist hooks isn't settled across
// phones yet: offer a "Flip hook direction" setting.

// ==== the throw ============================================================================
/**
 * While GRIP is held, keep the samples. On release, look back at the forward swing: the
 * gyro's strongest level turn shortly before letting go gives the swing axis; walking back while the
 * phone turns the same way finds where the forward swing began. Over that stretch:
 *   peak  = fastest turn about the swing axis (deg/s): ball speed
 *   yaw   = turn about "up" (deg): the line, left or right
 *   twist = turn about the direction of travel (deg), in the last 0.25 s: the wrist's hook
 * Nothing depends on how the phone is held: the axes come from the swing itself and gravity.
 */
const grip = { down: false, samples: [], live: 0 }
function onSample(s) {
  if (!grip.down) return
  grip.samples.push(s)
  if (grip.samples.length > 400) grip.samples.shift()
  grip.live = Math.hypot(...s.w)
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (a) => {
  const l = Math.hypot(...a) || 1
  return a.map((v) => v / l)
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
function readThrow(samples, releaseT) {
  // Measured from the last reading before letting go (readings arrive in small batches).
  const ref = Math.min(releaseT, samples.length ? samples[samples.length - 1].t : releaseT)
  const recent = samples.filter((s) => ref - s.t < 1200)
  if (recent.length < 4) return { peak: 0, yaw: 0, twist: 0 }
  // The swing axis: the strongest turn 250-550 ms before letting go, before the wrist twists
  // (twist and swing are both level axes, so the twist must not leak into it), kept level.
  let best = null
  for (const s of recent) if (ref - s.t >= 250 && ref - s.t < 550 && (!best || Math.hypot(...s.w) > Math.hypot(...best.w))) best = s
  best ??= recent[recent.length - 1]
  const up = norm(best.up ?? [0, 1, 0])
  const raw = best.w.map((v, i) => v - up[i] * dot(best.w, up))
  const axis = norm(raw)
  let start = recent.length - 1
  while (start > 0 && dot(recent[start - 1].w, axis) > 0) start--
  const travel = norm(cross(up, axis))
  let peak = 0
  let yaw = 0
  let twist = 0
  for (let i = start; i < recent.length; i++) {
    const s = recent[i]
    peak = Math.max(peak, dot(s.w, axis))
    yaw += dot(s.w, up) * s.dt
    if (ref - s.t < 250) twist += dot(s.w, travel) * s.dt
  }
  return { peak: Math.round(peak), yaw: Math.round(yaw * 10) / 10, twist: Math.round(twist * 10) / 10 }
}

