// Surface toolkit (art-direction skill): procedural paper, paint, ink and pattern for canvas games, so
// backgrounds, panels and HUD read as *made of something* instead of flat fills. Everything is drawn once
// into an offscreen canvas at 2× (crisp at DPR 2) and then blitted each frame: nothing here is meant to run
// per frame. All randomness is seeded, so a surface looks the same every load.

export const TAU = Math.PI * 2

// ---------- seeded random and noise ----------

/** A seeded random generator (same idea as canvas2d-assets' sprite.js, kept here so this file stands alone). */
export function seeded(seed = 1) {
  let s = Math.floor(Math.abs(seed) * 2147483646) % 2147483647 || 1
  return () => ((s = (s * 16807) % 2147483647) / 2147483647)
}

/** Smooth 2D value noise with octaves: const n = noise2(seed); n(x, y) → 0..1. Use for paint, mottling, wear. */
export function noise2(seed = 1, octaves = 4) {
  const rnd = seeded(seed)
  const perm = new Uint8Array(512)
  const vals = new Float32Array(256)
  for (let i = 0; i < 256; i++) { perm[i] = i; vals[i] = rnd() }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[perm[i], perm[j]] = [perm[j], perm[i]]
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i]
  const v = (x, y) => vals[perm[(perm[x & 255] + y) & 511]]
  const s = (t) => t * t * (3 - 2 * t)
  const one = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y)
    const u = s(x - xi), w = s(y - yi)
    const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1)
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w
  }
  return (x, y) => {
    let sum = 0, amp = 0.5, f = 1, norm = 0
    for (let o = 0; o < octaves; o++) {
      sum += one(x * f, y * f) * amp
      norm += amp
      amp *= 0.5
      f *= 2
    }
    return sum / norm
  }
}

// ---------- colour ----------

/** '#rrggbb' → [r, g, b] */
export function rgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Mix two '#rrggbb' colours: t = 0 → a, 1 → b. */
export function mix(a, b, t) {
  const A = rgb(a), B = rgb(b)
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')
}

// ---------- canvases ----------

/**
 * An offscreen canvas of w×h *logical* px, backed at `scale`× pixels, with ctx already scaled.
 * Draw it back with ctx.drawImage(c.canvas, x, y, w, h) so it stays crisp at DPR 2.
 */
export function surface(w, h, scale = 2) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(w * scale)
  canvas.height = Math.ceil(h * scale)
  const ctx = canvas.getContext('2d')
  ctx.scale(scale, scale)
  return { canvas, ctx, w, h, scale, draw: (to, x = 0, y = 0) => to.drawImage(canvas, x, y, w, h) }
}

/**
 * Paint per-pixel noise into a surface region (grain, paper fibre, wash mottling), at the backing resolution.
 * fn(nx, ny, rnd) returns [r, g, b, a] (0..255) or null to skip; nx, ny are logical px.
 */
export function perPixel(s, fn, { x = 0, y = 0, w = s.w, h = s.h, seed = 1 } = {}) {
  const rnd = seeded(seed)
  const X = Math.floor(x * s.scale), Y = Math.floor(y * s.scale)
  const W = Math.ceil(w * s.scale), H = Math.ceil(h * s.scale)
  const img = s.ctx.getImageData(X, Y, W, H)
  const d = img.data
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const c = fn(x + i / s.scale, y + j / s.scale, rnd)
      if (!c) continue
      const k = (j * W + i) * 4, a = c[3] / 255
      d[k] = d[k] + (c[0] - d[k]) * a
      d[k + 1] = d[k + 1] + (c[1] - d[k + 1]) * a
      d[k + 2] = d[k + 2] + (c[2] - d[k + 2]) * a
    }
  }
  s.ctx.putImageData(img, X, Y)
}

// ---------- paths ----------

/** A rectangle with rough, torn or deckled edges as a Path2D: rough = max inset in px, step = edge detail. */
export function tornRect(x, y, w, h, { rough = 6, step = 7, seed = 1 } = {}) {
  const rnd = seeded(seed)
  const p = new Path2D()
  const jag = () => (rnd() ** 2) * rough
  const edge = (x0, y0, x1, y1, nx, ny, first) => {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / step))
    for (let i = first ? 0 : 1; i <= n; i++) {
      const t = i / n, j = jag()
      const px = x0 + (x1 - x0) * t + nx * j, py = y0 + (y1 - y0) * t + ny * j
      i === 0 ? p.moveTo(px, py) : p.lineTo(px, py)
    }
  }
  edge(x, y, x + w, y, 0, 1, true)
  edge(x + w, y, x + w, y + h, -1, 0)
  edge(x + w, y + h, x, y + h, 0, -1)
  edge(x, y + h, x, y, 1, 0)
  p.closePath()
  return p
}

/** A soft, irregular blob path (ink blots, paint dabs, button backings). */
export function blot(cx, cy, rx, ry, { wobble = 0.18, points = 22, seed = 1 } = {}) {
  const rnd = seeded(seed)
  const p = new Path2D()
  const r = Array.from({ length: points }, () => 1 + (rnd() - 0.5) * 2 * wobble)
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * TAU, k = r[i % points]
    const px = cx + Math.cos(a) * rx * k, py = cy + Math.sin(a) * ry * k
    i === 0 ? p.moveTo(px, py) : p.lineTo(px, py)
  }
  p.closePath()
  return p
}

// ---------- surfaces ----------

/**
 * Paper: base colour, low-frequency mottling, fibres and fine grain, darker toward the edges.
 * Returns a surface; use it for panels, cards, maps, menus, dialogue boxes.
 */
export function paper(w, h, { color = '#efe3c6', dark = '#b89a68', mottle = 0.18, grain = 18, fibres = 120, edge = 0.35, seed = 1, scale = 2 } = {}) {
  const s = surface(w, h, scale)
  const { ctx } = s
  ctx.fillStyle = color
  ctx.fillRect(0, 0, w, h)
  const n = noise2(seed, 5)
  const D = rgb(dark)
  perPixel(s, (x, y, rnd) => {
    const m = n(x / 90, y / 90)
    const ex = Math.min(x, w - x) / (w * 0.5), ey = Math.min(y, h - y) / (h * 0.5)
    const e = (1 - Math.min(ex, ey)) ** 3 * edge
    const a = Math.max(0, (m - 0.45) * 2) * mottle + e
    const g = (rnd() - 0.5) * grain
    return [D[0] + g, D[1] + g, D[2] + g, Math.min(255, a * 255 + Math.abs(g))]
  }, { seed })
  const rnd = seeded(seed + 7)
  ctx.lineCap = 'round'
  for (let i = 0; i < fibres; i++) {
    const x = rnd() * w, y = rnd() * h, a = rnd() * TAU, l = 4 + rnd() * 14
    ctx.strokeStyle = `rgba(${D.join(',')},${0.08 + rnd() * 0.12})`
    ctx.lineWidth = 0.5 + rnd() * 0.6
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l)
    ctx.stroke()
  }
  return s
}

/**
 * A painted wash background (gouache / watercolour feel): layered tones from `colors` pushed around by noise,
 * visible brush dabs, and grain. colors: 2–4 '#hex', darkest to lightest.
 */
export function wash(w, h, { colors = ['#1f5a55', '#2f7a6b', '#4c9a83'], dabs = 420, dabSize = 70, grain = 14, seed = 1, scale = 1 } = {}) {
  const s = surface(w, h, scale)
  const { ctx } = s
  const n = noise2(seed, 4)
  const C = colors.map(rgb)
  perPixel(s, (x, y, rnd) => {
    let t = n(x / 260, y / 260) * 1.6 - 0.3
    t = Math.max(0, Math.min(0.999, t)) * (C.length - 1)
    const i = Math.floor(t), f = t - i, a = C[i], b = C[i + 1] || a
    const g = (rnd() - 0.5) * grain
    return [a[0] + (b[0] - a[0]) * f + g, a[1] + (b[1] - a[1]) * f + g, a[2] + (b[2] - a[2]) * f + g, 255]
  }, { seed })
  const rnd = seeded(seed + 3)
  for (let i = 0; i < dabs; i++) {
    const c = colors[Math.floor(rnd() * colors.length)]
    const x = rnd() * w, y = rnd() * h, r = dabSize * (0.4 + rnd())
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rnd() * TAU)
    ctx.globalAlpha = 0.05 + rnd() * 0.08
    ctx.fillStyle = c
    ctx.fill(blot(0, 0, r, r * (0.12 + rnd() * 0.25), { wobble: 0.25, seed: seed * 31 + i }))
    ctx.restore()
  }
  return s
}

/**
 * A torn paper card with a soft drop shadow: a surface sized w + 2·pad so the shadow fits.
 * Draw it at (x - pad, y - pad). Put your menu rows on top.
 */
export function paperCard(w, h, { pad = 18, shadow = 'rgba(20,12,4,0.45)', rough = 5, seed = 1, scale = 2, ...paperOpts } = {}) {
  const s = surface(w + pad * 2, h + pad * 2, scale)
  const { ctx } = s
  const path = tornRect(pad, pad, w, h, { rough, seed })
  ctx.save()
  ctx.translate(4, 7)
  ctx.fillStyle = shadow
  ctx.filter = 'blur(6px)' // baked once, so the cost doesn't matter
  ctx.fill(path)
  ctx.restore()
  const p = paper(w, h, { seed, scale, ...paperOpts })
  ctx.save()
  ctx.clip(path)
  ctx.drawImage(p.canvas, pad, pad, w, h)
  ctx.restore()
  ctx.strokeStyle = 'rgba(90,60,25,0.35)'
  ctx.lineWidth = 1
  ctx.stroke(path)
  return s
}

// ---------- ink ----------

/**
 * A dry-brush ink stroke along points [[x, y], ...] (2+), drawn into ctx (bake it if it's static).
 * Built from many thin bristle lines with tapered ends and gaps, so it reads as a brush, not a vector line.
 */
export function brush(ctx, pts, { width = 26, color = '#1b1712', bristles = 26, dry = 0.35, taper = 0.25, seed = 1 } = {}) {
  const rnd = seeded(seed)
  const seg = []
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 4))
    for (let k = 0; k < n; k++) seg.push([x0 + (x1 - x0) * (k / n), y0 + (y1 - y0) * (k / n)])
  }
  seg.push(pts.at(-1))
  const N = seg.length
  const normals = seg.map((p, i) => {
    const a = seg[Math.max(0, i - 1)], b = seg[Math.min(N - 1, i + 1)]
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1
    return [-dy / l, dx / l]
  })
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  for (let b = 0; b < bristles; b++) {
    const off = (b / (bristles - 1) - 0.5) * width
    const start = rnd() * taper * 0.6, end = 1 - rnd() * taper * 0.6
    const gapAt = rnd() < dry ? 0.3 + rnd() * 0.6 : 2
    ctx.globalAlpha = 0.55 + rnd() * 0.45
    ctx.lineWidth = (width / bristles) * (1.4 + rnd())
    ctx.beginPath()
    let drawing = false
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1)
      if (t < start || t > end || (t > gapAt && t < gapAt + 0.12)) { drawing = false; continue }
      // taper: bristles near the edge drop out toward the ends
      const tp = Math.min(t / taper, (1 - t) / taper, 1)
      const o = off * (0.35 + 0.65 * tp) + (rnd() - 0.5) * 0.8
      const x = seg[i][0] + normals[i][0] * o, y = seg[i][1] + normals[i][1] * o
      drawing ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
      drawing = true
    }
    ctx.stroke()
  }
  ctx.restore()
}

/** An ink blot behind a button prompt or icon: a solid blob plus a few splatter dots. */
export function inkBlot(ctx, cx, cy, rx, ry, { color = '#1b1712', splatter = 5, seed = 1 } = {}) {
  const rnd = seeded(seed)
  ctx.save()
  ctx.fillStyle = color
  ctx.fill(blot(cx, cy, rx, ry, { wobble: 0.12, seed }))
  for (let i = 0; i < splatter; i++) {
    const a = rnd() * TAU, d = 1.05 + rnd() * 0.35, r = 1 + rnd() * 2.5
    ctx.beginPath()
    ctx.arc(cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, r, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

// ---------- patterns and finishing ----------

/**
 * Stamp a motif across an area on a grid (wallpaper, cloth, carved stone, tribal bands), with jitter and
 * fading so it looks printed or painted rather than tiled. motif(ctx, size, rnd) draws around (0, 0).
 */
export function stamp(ctx, w, h, motif, { cell = 160, size = cell * 0.8, color = '#c58a3a', alpha = 0.35, jitter = 0.08, fade = 0.5, seed = 1 } = {}) {
  const rnd = seeded(seed)
  const n = noise2(seed + 11, 3)
  ctx.save()
  ctx.fillStyle = ctx.strokeStyle = color
  for (let y = -cell / 2; y < h + cell; y += cell) {
    for (let x = -cell / 2; x < w + cell; x += cell) {
      ctx.save()
      ctx.globalAlpha = alpha * (1 - fade + fade * n(x / 300, y / 300) * 1.4)
      ctx.translate(x + (rnd() - 0.5) * cell * jitter, y + (rnd() - 0.5) * cell * jitter)
      ctx.rotate((rnd() - 0.5) * jitter)
      motif(ctx, size, rnd)
      ctx.restore()
    }
  }
  ctx.restore()
}

/** A stepped-fret / key motif (a Mesoamerican, Greek or Chinese key depending on proportions): a stamp() motif. */
export function fret(ctx, size, rnd = Math.random) {
  const u = size / 14
  ctx.lineWidth = u * 1.2
  ctx.lineJoin = 'miter'
  ctx.lineCap = 'square'
  // a squared spiral (arms 2 units apart) that steps out to the cell edge, drawn twice slightly offset so the
  // edges look painted rather than ruled
  const pts = [[0, 0], [2, 0], [2, 2], [-2, 2], [-2, -2], [4, -2], [4, 4], [-4, 4], [-4, -4], [6, -4], [6, 6], [-7, 6]]
  for (let pass = 0; pass < 2; pass++) {
    const jx = (rnd() - 0.5) * u * 0.4, jy = (rnd() - 0.5) * u * 0.4
    ctx.beginPath()
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * u + jx, y * u + jy) : ctx.moveTo(x * u + jx, y * u + jy)))
    ctx.stroke()
  }
}

/** Darken the edges toward `color` with a radial gradient (cheap; fine per frame, cheaper baked). */
export function vignette(ctx, w, h, { strength = 0.45, color = '#000000', inner = 0.55 } = {}) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * inner * 0.5, w / 2, h / 2, Math.hypot(w, h) / 2)
  const [r, gg, b] = rgb(color)
  g.addColorStop(0, `rgba(${r},${gg},${b},0)`)
  g.addColorStop(1, `rgba(${r},${gg},${b},${strength})`)
  ctx.save()
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
}

/**
 * A tileable grain overlay (size×size). Draw it over the finished frame with
 * ctx.globalCompositeOperation = 'overlay' or 'multiply' and a low globalAlpha so the whole screen,
 * 3D included, shares one surface. Use ctx.createPattern(grainTile().canvas, 'repeat').
 */
export function grainTile(size = 256, { amount = 40, seed = 1 } = {}) {
  const s = surface(size, size, 1)
  s.ctx.fillStyle = '#808080'
  s.ctx.fillRect(0, 0, size, size)
  perPixel(s, (x, y, rnd) => {
    const g = 128 + (rnd() - 0.5) * amount * 2
    return [g, g, g, 255]
  }, { seed })
  return s
}
