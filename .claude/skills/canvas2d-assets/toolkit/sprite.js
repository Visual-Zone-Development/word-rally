// 2D asset toolkit (canvas2d-assets skill): drawing, styling, animation and sprite helpers for canvas
// games in any art style — vector shapes, pixel art, painted or user-supplied sprite sheets — and any
// camera (side view, top-down, isometric, UI). Every asset is a draw function; this file gives it
// consistent outlines and shading, natural motion, pixel-perfect scaling and cached bitmaps.

export const TAU = Math.PI * 2

// ---------- randomness and easing ----------

/** A seeded random generator, so procedural art and per-instance variation look the same every load. */
export function seeded(seed = 1) {
  let s = Math.floor(seed * 2147483646) % 2147483647 || 1
  return () => ((s = (s * 16807) % 2147483647) / 2147483647)
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
export const ease = {
  linear: (t) => t,
  inOut: (t) => t * t * (3 - 2 * t),
  out: (t) => 1 - (1 - t) ** 3,
  in: (t) => t * t * t,
  back: (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2,
  elastic: (t) => (t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1)
}

/** Sample keyframes [[t, value, ease?], ...] at a (0..1); each segment eases with its end key's curve. */
export function keys(a, k) {
  for (let i = 1; i < k.length; i++) {
    if (a <= k[i][0]) {
      const [t0, v0] = k[i - 1]
      const [t1, v1, e = 'inOut'] = k[i]
      return v0 + (v1 - v0) * ease[e](clamp01((a - t0) / (t1 - t0 || 1)))
    }
  }
  return k.at(-1)[1]
}

/**
 * A damped spring for secondary motion (hair, scarves, antennae, tails, UI overshoot).
 * const s = spring(0); each frame: s.update(target, dt) → value that lags and settles.
 */
export function spring(value = 0, { stiffness = 120, damping = 12 } = {}) {
  let v = 0
  return {
    value,
    update(target, dt) {
      const a = (target - this.value) * stiffness - v * damping
      v += a * dt
      this.value += v * dt
      return this.value
    },
    reset(to = 0) {
      this.value = to
      v = 0
    }
  }
}

/** Volume-preserving squash (amount > 0) or stretch (amount < 0): returns { sx, sy }. */
export function squash(amount) {
  const sy = 1 - amount
  return { sx: 1 / Math.max(0.2, sy), sy }
}

// ---------- transforms ----------

/**
 * Draw inside a pose: translate to the anchor (x, y), then rotate, flip and scale about it.
 * Anchor assets at their feet (side view), centre (top-down, projectiles) or base (isometric) so
 * squash happens against the ground and flips don't shift the sprite.
 */
export function pose(ctx, { x = 0, y = 0, rot = 0, sx = 1, sy = 1, flip = false, alpha = 1 }, draw) {
  ctx.save()
  ctx.translate(x, y)
  if (rot) ctx.rotate(rot)
  ctx.scale(flip ? -sx : sx, sy)
  if (alpha !== 1) ctx.globalAlpha *= alpha
  draw(ctx)
  ctx.restore()
}

// ---------- style: outlines and shading, shared by every asset in a game ----------

/**
 * A game's drawing style. Put one in the game's style module and pass it to every asset so outlines,
 * shading and light direction match everywhere.
 *   outline: colour or null; outlineWidth in px at play size; shading: 'flat' | 'cel' | 'soft';
 *   light: direction the light comes from ([-1, -1] = top-left); shadeAmount: 0..1 darkness of the shade band.
 */
export function createStyle({ outline = '#1a1420', outlineWidth = 3, shading = 'cel', light = [-0.6, -1], shadeAmount = 0.28, highlight = 0.22 } = {}) {
  const l = Math.hypot(light[0], light[1]) || 1
  return { outline, outlineWidth, shading, light: [light[0] / l, light[1] / l], shadeAmount, highlight }
}

/** Mix a #rrggbb colour toward black (k < 0) or white (k > 0). */
export function tint(hex, k) {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k))
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Fill a path in the game's style: base colour, a shade band away from the light, a highlight toward it,
 * then the outline. path(ctx) builds the path; bounds { x, y, w, h } size the shading.
 */
export function shape(ctx, style, path, color, bounds, { outline = true, shade = true } = {}) {
  ctx.beginPath()
  path(ctx)
  ctx.fillStyle = color
  ctx.fill()
  if (shade && style.shading !== 'flat' && bounds) {
    const { x, y, w, h } = bounds
    const cx = x + w / 2
    const cy = y + h / 2
    const [lx, ly] = style.light
    const r = Math.max(w, h) / 2
    ctx.save()
    ctx.clip()
    if (style.shading === 'cel') {
      // a hard-edged shade on the far side (everything outside a lit oval shifted toward the light)
      ctx.fillStyle = tint(color, -style.shadeAmount)
      ctx.beginPath()
      ctx.ellipse(cx + lx * w * 0.16, cy + ly * h * 0.16, w * 0.58, h * 0.58, 0, 0, TAU)
      ctx.rect(x - w, y - h, w * 3, h * 3)
      ctx.fill('evenodd')
      ctx.fillStyle = tint(color, style.highlight)
      ctx.beginPath()
      ctx.ellipse(cx + lx * w * 0.24, cy + ly * h * 0.28, w * 0.13, h * 0.09, Math.atan2(ly, lx), 0, TAU)
      ctx.fill()
    } else {
      const g = ctx.createLinearGradient(cx + lx * r, cy + ly * r, cx - lx * r, cy - ly * r)
      g.addColorStop(0, tint(color, style.highlight))
      g.addColorStop(0.5, color)
      g.addColorStop(1, tint(color, -style.shadeAmount))
      ctx.fillStyle = g
      ctx.fillRect(x - 2, y - 2, w + 4, h + 4)
    }
    ctx.restore()
  }
  if (outline && style.outline) {
    ctx.beginPath()
    path(ctx)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = style.outline
    ctx.lineWidth = style.outlineWidth
    ctx.stroke()
  }
}

/** An ellipse-ish blob with optional organic wobble (slimes, bodies, clouds, bushes). */
export function blobPath(cx, cy, rx, ry, wobble = 0, seed = 1, points = 18) {
  const r = seeded(seed)
  const offs = Array.from({ length: points }, () => 1 + (r() - 0.5) * wobble)
  return (ctx) => {
    for (let i = 0; i <= points; i++) {
      const a = (i / points) * TAU
      const k = offs[i % points]
      const x = cx + Math.cos(a) * rx * k
      const y = cy + Math.sin(a) * ry * k
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
    }
    ctx.closePath()
  }
}

/** A polygon with rounded corners (armour plates, crates, cards, buildings). pts: [[x, y], ...] */
export function roundPoly(pts, radius = 4) {
  return (ctx) => {
    const n = pts.length
    for (let i = 0; i < n; i++) {
      const [x0, y0] = pts[(i - 1 + n) % n]
      const [x1, y1] = pts[i]
      const [x2, y2] = pts[(i + 1) % n]
      const a = Math.min(radius, Math.hypot(x1 - x0, y1 - y0) / 2)
      const b = Math.min(radius, Math.hypot(x2 - x1, y2 - y1) / 2)
      const p = [x1 + ((x0 - x1) / Math.hypot(x0 - x1, y0 - y1)) * a, y1 + ((y0 - y1) / Math.hypot(x0 - x1, y0 - y1)) * a]
      const q = [x1 + ((x2 - x1) / Math.hypot(x2 - x1, y2 - y1)) * b, y1 + ((y2 - y1) / Math.hypot(x2 - x1, y2 - y1)) * b]
      i ? ctx.lineTo(...p) : ctx.moveTo(...p)
      ctx.quadraticCurveTo(x1, y1, ...q)
    }
    ctx.closePath()
  }
}

// ---------- pixel art ----------

/**
 * Draw pixel art at its native resolution, then blit it scaled by a whole number with smoothing off.
 * pixels(w, h, (px) => { px.set(x, y, '#hex'); px.rect(...) }) → canvas; add an outline with pixelOutline().
 */
export function pixels(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  draw({
    ctx: g,
    set(x, y, color) {
      g.fillStyle = color
      g.fillRect(Math.round(x), Math.round(y), 1, 1)
    },
    rect(x, y, rw, rh, color) {
      g.fillStyle = color
      g.fillRect(Math.round(x), Math.round(y), rw, rh)
    },
    /** A filled ellipse snapped to the pixel grid. */
    ellipse(cx, cy, rx, ry, color) {
      g.fillStyle = color
      for (let y = -ry; y <= ry; y++)
        for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx + 0.3) + (y * y) / (ry * ry + 0.3) <= 1) g.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1)
    }
  })
  return c
}

/** A 1-pixel outline around every opaque pixel of a pixel-art canvas (classic sprite outline). */
export function pixelOutline(src, color = '#1a1420') {
  const w = src.width + 2
  const h = src.height + 2
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  const d = src.getContext('2d').getImageData(0, 0, src.width, src.height).data
  const solid = (x, y) => x >= 0 && y >= 0 && x < src.width && y < src.height && d[(y * src.width + x) * 4 + 3] > 0
  g.fillStyle = color
  for (let y = -1; y <= src.height; y++)
    for (let x = -1; x <= src.width; x++) if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) g.fillRect(x + 1, y + 1, 1, 1)
  g.drawImage(src, 1, 1)
  return c
}

/** Draw a pixel-art canvas anchored at (x, y) (bottom-centre by default), scaled by a whole number. */
export function blit(ctx, img, x, y, { scale = 3, anchor = 'feet', flip = false } = {}) {
  const s = Math.max(1, Math.round(scale))
  const w = img.width * s
  const h = img.height * s
  const ox = -w / 2
  const oy = anchor === 'feet' ? -h : anchor === 'center' ? -h / 2 : 0
  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.translate(Math.round(x), Math.round(y))
  if (flip) ctx.scale(-1, 1)
  ctx.drawImage(img, Math.round(ox), Math.round(oy), w, h)
  ctx.restore()
}

// ---------- sprite sheets and baking ----------

/** Load a sprite sheet from the game folder: frames are fw × fh cells, left to right, top to bottom. */
export async function loadSheet(url, fw, fh) {
  const img = new Image()
  img.src = url
  await img.decode()
  return { img, fw, fh, cols: Math.floor(img.width / fw), count: Math.floor(img.width / fw) * Math.floor(img.height / fh) }
}

/**
 * Pre-render a procedural draw function into a sheet of frames (for speed: many copies, glow, heavy
 * paths). Renders at `scale` (2 = crisp on DPR-2 screens) and is drawn back at 1/scale.
 * draw(ctx, phase 0..1) draws one frame centred on the cell's anchor point (ax, ay).
 */
export function bake(draw, { w, h, frames = 1, scale = 2, ax = w / 2, ay = h } = {}) {
  const c = document.createElement('canvas')
  c.width = w * scale * frames
  c.height = h * scale
  const g = c.getContext('2d')
  for (let i = 0; i < frames; i++) {
    g.save()
    g.scale(scale, scale)
    g.translate(i * w + ax, ay)
    draw(g, frames > 1 ? i / frames : 0)
    g.restore()
  }
  return { img: c, fw: w * scale, fh: h * scale, cols: frames, count: frames, scale, ax, ay }
}

/** Draw frame i of a sheet with its anchor at (x, y). */
export function drawFrame(ctx, sheet, i, x, y, { flip = false, scale = 1, smooth = true } = {}) {
  const f = ((i % sheet.count) + sheet.count) % sheet.count
  const sx = (f % sheet.cols) * sheet.fw
  const sy = Math.floor(f / sheet.cols) * sheet.fh
  const k = scale / (sheet.scale ?? 1)
  const ax = (sheet.ax ?? sheet.fw / 2 / (sheet.scale ?? 1)) * (sheet.scale ?? 1)
  const ay = (sheet.ay ?? sheet.fh / (sheet.scale ?? 1)) * (sheet.scale ?? 1)
  ctx.save()
  ctx.imageSmoothingEnabled = smooth
  ctx.translate(x, y)
  ctx.scale(flip ? -k : k, k)
  ctx.drawImage(sheet.img, sx, sy, sheet.fw, sheet.fh, -ax, -ay, sheet.fw, sheet.fh)
  ctx.restore()
}

/** A clip plays frames at fps: clip.frame(t) → frame index (loops, or holds the last frame). */
export function clip(frames, fps = 10, loop = true) {
  return {
    frames,
    fps,
    duration: frames.length / fps,
    frame(t) {
      const i = Math.floor(t * fps)
      return frames[loop ? i % frames.length : Math.min(i, frames.length - 1)]
    }
  }
}

// ---------- cameras and layouts ----------

/** Isometric projection: world tile (x, y, z up) → screen offset, for tiles tw × th (2:1 by default). */
export function iso(x, y, z = 0, tw = 64, th = 32) {
  return { sx: ((x - y) * tw) / 2, sy: ((x + y) * th) / 2 - z }
}

/** Sort drawables back-to-front (top-down and isometric): by key (default 'y'), stable. */
export function depthSort(list, key = 'y') {
  return list.map((v, i) => [v, i]).sort((a, b) => a[0][key] - b[0][key] || a[1] - b[1]).map((p) => p[0])
}

/** Which of n directional sprites (4, 8, 16) faces an angle (radians, 0 = right, clockwise in screen space). */
export function directionIndex(angle, n = 8) {
  return ((Math.round((angle / TAU) * n) % n) + n) % n
}

/** Draw an image as a 9-slice panel (UI frames, cards, speech bubbles) without stretching its corners. */
export function nineSlice(ctx, img, x, y, w, h, b) {
  const iw = img.width
  const ih = img.height
  const cols = [[0, b, x, b], [b, iw - 2 * b, x + b, w - 2 * b], [iw - b, b, x + w - b, b]]
  const rows = [[0, b, y, b], [b, ih - 2 * b, y + b, h - 2 * b], [ih - b, b, y + h - b, b]]
  for (const [sx, sw, dx, dw] of cols) for (const [sy, sh, dy, dh] of rows) ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
}
