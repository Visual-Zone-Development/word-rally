// Backdrops (environments skill): skies, time-of-day palettes, atmospheric perspective and parallax layers
// for any game with a background — platformers, runners, racers, shooters, fighting stages, city builders,
// space games, menus. Each layer is a seamless horizontal strip baked once (vector or pixel look) and scrolled
// at its own speed. Colours always come from the game's palette (STYLE.md); nothing here has a look of its own.

const TAU = Math.PI * 2

export function seeded(seed = 1) {
  let s = Math.floor(Math.abs(seed) * 2147483646) % 2147483647 || 1
  return () => ((s = (s * 16807) % 2147483647) / 2147483647)
}

const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
const hex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
/** Mix two '#rrggbb' colours. */
export const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return hex(A.map((v, i) => v + (B[i] - v) * t)) }

/**
 * Atmospheric perspective: the further a layer is (depth 0 = play layer … 1 = horizon), the closer its colour
 * moves to the haze (usually the sky near the horizon) and the less contrast it has. This is what makes
 * distance read in every style; apply it to every background colour.
 */
export const haze = (color, hazeColor, depth, strength = 0.85) => mix(color, hazeColor, Math.min(1, depth * strength))

/**
 * Time of day from palette keyframes: palettes = { 0: {...}, 0.25: {...}, 0.5: {...}, 0.75: {...} } (any keys
 * 0..1, wrapping), each a map of role → '#hex' (sky top, sky horizon, haze, light, shadow…). Returns the
 * blended palette for t. Store the keyframes in STYLE.md.
 */
export function timeOfDay(palettes, t) {
  const keys = Object.keys(palettes).map(Number).sort((a, b) => a - b)
  t = ((t % 1) + 1) % 1
  let i = keys.findIndex((k) => k > t)
  if (i < 0) i = 0
  const k1 = keys[i], k0 = keys[(i - 1 + keys.length) % keys.length]
  const span = ((k1 - k0 + 1) % 1) || 1, f = ((t - k0 + 1) % 1) / span
  const out = {}
  for (const role of Object.keys(palettes[k0])) out[role] = mix(palettes[k0][role], palettes[k1][role] ?? palettes[k0][role], f)
  return out
}

/** Vertical sky gradient with any number of stops: sky(ctx, w, h, ['#top', '#mid', '#horizon']). */
export function sky(ctx, w, h, stops, { y = 0 } = {}) {
  const g = ctx.createLinearGradient(0, y, 0, y + h)
  stops.forEach((c, i) => g.addColorStop(i / Math.max(1, stops.length - 1), c))
  ctx.fillStyle = g
  ctx.fillRect(0, y, w, h)
}

// periodic 1D noise so strips tile seamlessly
function pnoise1(x, period, seed, octaves = 4) {
  const rnd = seeded(seed)
  const vals = Array.from({ length: 256 }, rnd)
  let sum = 0, amp = 0.5, norm = 0, f = 1
  for (let o = 0; o < octaves; o++) {
    const p = Math.max(1, Math.round(period * f)), xi = Math.floor(x * f), t = x * f - xi
    const a = vals[((xi % p) + p) % p % 256], b = vals[(((xi + 1) % p) + p) % p % 256]
    sum += (a + (b - a) * (t * t * (3 - 2 * t))) * amp
    norm += amp; amp *= 0.5; f *= 2
  }
  return sum / norm
}

/**
 * Bake one seamless layer strip of width w (it repeats) and height h.
 * kind: 'hills' | 'mountains' | 'dunes' | 'waves' | 'forest' | 'pines' | 'city' | 'clouds' | 'stars'
 * opts: color (fill), light (lit edge / snow / windows / highlights), base (0..1 of h where the shape sits),
 *   amp (height of features, 0..1 of h), detail, seed, pixel (bake at 1/pixel size and scale up with smoothing
 *   off, for pixel-art games), rim (px of light edge on the side facing the light).
 */
export function layer(kind, w, h, { color = '#334', light = null, base = 0.6, amp = 0.3, detail = 1, seed = 1, pixel = 0, rim = 0 } = {}) {
  const k = pixel || 1
  const W = Math.round(w / k), H = Math.round(h / k)
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')
  const rnd = seeded(seed)
  const top = (x) => H * base - H * amp * height(x)
  let height
  g.fillStyle = color
  if (kind === 'hills' || kind === 'mountains' || kind === 'dunes' || kind === 'waves') {
    const period = { hills: 3, mountains: 6, dunes: 4, waves: 14 }[kind] * detail
    height = (x) => {
      const n = pnoise1((x / W) * period, period, seed, kind === 'mountains' ? 6 : 3)
      if (kind === 'mountains') return Math.pow(1 - Math.abs(n * 2 - 1), 1.6) // ridged peaks
      if (kind === 'dunes') return Math.pow(n, 0.7)
      if (kind === 'waves') return 0.5 + 0.5 * Math.sin((x / W) * TAU * period) * 0.6 + (n - 0.5) * 0.4
      return n
    }
    g.beginPath(); g.moveTo(0, H)
    for (let x = 0; x <= W; x++) g.lineTo(x, Math.round(top(x)))
    g.lineTo(W, H); g.closePath(); g.fill()
    if (light) {
      g.fillStyle = light
      for (let x = 0; x < W; x++) {
        const y = Math.round(top(x)), slope = top(x + 1) - top(x - 1)
        if (kind === 'mountains' && height(x) > 0.72) g.fillRect(x, y, 1, Math.max(1, (height(x) - 0.72) * H * amp * 0.9)) // snow
        else if (rim && slope > 0) g.fillRect(x, y, 1, rim / k) // lit slope facing the light (left)
        else if (kind === 'waves' && rnd() < 0.15) g.fillRect(x, y, 1, 1) // foam glints
      }
    }
  } else if (kind === 'forest' || kind === 'pines') {
    const step = Math.max(3, Math.round((kind === 'pines' ? 10 : 16) / detail / k))
    height = (x) => pnoise1((x / W) * 4, 4, seed, 3)
    g.fillRect(0, Math.round(H * base), W, H)
    for (let x = -step; x < W + step; x += step * (0.6 + rnd() * 0.6)) {
      const wx = ((x % W) + W) % W, y0 = top(wx), s = step * (0.8 + rnd() * 0.8)
      for (const ox of [0, -W, W]) {
        if (kind === 'pines') { g.beginPath(); g.moveTo(x + ox - s * 0.6, H * base + 2); g.lineTo(x + ox, y0 - s * 1.4); g.lineTo(x + ox + s * 0.6, H * base + 2); g.fill() }
        else { g.beginPath(); g.ellipse(x + ox, y0, s * 0.75, s * 0.85, 0, 0, TAU); g.fill(); g.fillRect(x + ox - s * 0.75, y0, s * 1.5, H * base - y0 + 2) }
      }
    }
  } else if (kind === 'city') {
    let x = 0
    while (x < W) {
      const bw = Math.round((10 + rnd() * 26) / k * detail), bh = Math.round(H * amp * (0.3 + rnd() * 0.7))
      const y = Math.round(H * base - bh)
      g.fillStyle = color
      g.fillRect(x, y, Math.min(bw, W - x), H - y)
      if (rnd() < 0.25) g.fillRect(x + Math.round(bw / 2) - 1, y - Math.round(6 / k), Math.max(1, Math.round(2 / k)), Math.round(6 / k)) // antenna
      if (light) {
        g.fillStyle = light
        const wx = Math.max(2, Math.round(4 / k)), wy = Math.max(2, Math.round(6 / k))
        for (let yy = y + wy; yy < H - wy; yy += wy * 2) for (let xx = x + wx; xx < x + bw - wx; xx += wx * 2) if (rnd() < 0.35) g.fillRect(xx, yy, Math.max(1, wx - 1), Math.max(1, wy - 2))
      }
      x += bw + Math.round(rnd() * 3 / k)
    }
  } else if (kind === 'clouds') {
    for (let i = 0; i < 9 * detail; i++) {
      const cx = rnd() * W, cy = H * base + (rnd() - 0.5) * H * amp, r = (18 + rnd() * 30) / k
      for (const ox of [0, -W, W]) for (let j = 0; j < 5; j++) {
        g.fillStyle = j === 4 && light ? light : color
        g.beginPath(); g.ellipse(cx + ox + (j - 2) * r * 0.7, cy - (j % 2) * r * 0.35 - (j === 4 ? r * 0.15 : 0), r * (j === 2 ? 1.1 : 0.8), r * 0.6, 0, 0, TAU); g.fill()
      }
    }
  } else if (kind === 'stars') {
    for (let i = 0; i < W * H * 0.0015 * detail; i++) {
      const b = rnd()
      g.fillStyle = b > 0.93 && light ? light : color
      const s = b > 0.97 ? 2 : 1
      g.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * H), s, s)
    }
  }
  if (!pixel) return { canvas: c, w, h }
  const up = document.createElement('canvas')
  up.width = w; up.height = h
  const u = up.getContext('2d')
  u.imageSmoothingEnabled = false
  u.drawImage(c, 0, 0, w, h)
  return { canvas: up, w, h }
}

/**
 * Draw parallax layers (furthest first): layers = [{ strip, factor, y, factorY }], camera in world px.
 * factor 0 = fixed (sky), 1 = moves with the world (play layer). Strips repeat horizontally.
 */
export function drawParallax(ctx, layers, camX = 0, camY = 0, viewW = 1280) {
  for (const L of layers) {
    const s = L.strip, ox = -((camX * L.factor) % s.w + s.w) % s.w
    const y = (L.y ?? 0) - camY * (L.factorY ?? L.factor * 0.3)
    for (let x = ox; x < viewW; x += s.w) ctx.drawImage(s.canvas, Math.round(x), Math.round(y))
  }
}
