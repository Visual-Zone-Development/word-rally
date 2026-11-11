// Pixel effects (pixel-art skill): fire, sparkles and glows drawn directly as pixels with their own ramps,
// on top of a rendered sprite (use renderHD's returned points as anchors) or in the game world. Deterministic
// for a given t and seed, so the same frame always looks the same in a baked sheet.

const FIRE = ['#3a0d12', '#7a1a14', '#c0321a', '#e8641e', '#f6a032', '#ffd75a', '#fff3c4']
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
function hash(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

/**
 * Fire along a segment from p0 to p1 (pixel coords), rising toward screen-up, drawn into canvas.
 * Heat is accumulated per pixel from licking tongues, then mapped to the fire ramp: white-yellow core,
 * orange body, red tips, dark-red edge. t (seconds) animates it; height in px.
 * occlude: a renderHD result ({ depth }) with p0/p1 from its points (they carry depth as [x, y, z]): flame
 * pixels behind the body are skipped, so a sword on the far side doesn't burn through the character.
 */
export function flame(canvas, p0, p1, { t = 0, height = 18, width = 4, seed = 1, colors = FIRE, density = 1, occlude = null } = {}) {
  const W = canvas.width, H = canvas.height
  const g = canvas.getContext('2d')
  const img = g.getImageData(0, 0, W, H)
  const heat = new Float32Array(W * H)
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1]
  const L = Math.hypot(dx, dy) || 1
  const n = Math.ceil((L / 2.2) * density)
  for (let i = 0; i <= n; i++) {
    const f = i / n
    const bx = p0[0] + dx * f, by = p0[1] + dy * f
    // each tongue: a tapered column that sways and flickers
    const ph = hash(i, seed) * 6.28, spd = 5 + hash(i, seed + 1) * 4
    const h = height * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * spd + ph))) * (0.6 + 0.4 * Math.sin(f * Math.PI))
    for (let k = 0; k < h; k++) {
      const up = k / h
      const sway = Math.sin(t * 7 + ph + up * 4) * up * 2.2
      const x = bx + sway, y = by - k
      const r = width * (1 - up * 0.85)
      for (let ox = -Math.ceil(r); ox <= Math.ceil(r); ox++) {
        const X = Math.round(x + ox), Y = Math.round(y)
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue
        const e = 1 - Math.abs(ox) / (r + 0.5)
        if (e <= 0) continue
        heat[Y * W + X] = Math.max(heat[Y * W + X], e * (1 - up * 0.9))
      }
    }
  }
  const cols = colors.map(rgb)
  const z0 = p0[2] ?? Infinity, z1 = p1[2] ?? Infinity
  const zAt = (x) => (Math.abs(dx) > 1e-6 ? z0 + (z1 - z0) * Math.max(0, Math.min(1, (x - p0[0]) / dx)) : (z0 + z1) / 2)
  for (let i = 0; i < W * H; i++) {
    const hv = heat[i]
    if (hv < 0.08) continue
    if (occlude && occlude.depth[i] > zAt(i % W) + 1.5 / (occlude.scale || 1)) continue
    const k = Math.min(cols.length - 1, Math.floor(hv * cols.length))
    const c = cols[k]
    img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255
  }
  g.putImageData(img, 0, 0)
}

/** Four-point pixel sparkles around (x, y) within radius, twinkling with t (magic, holy light, loot). */
export function sparkles(canvas, x, y, { t = 0, radius = 12, count = 6, color = '#fff6c8', core = '#ffffff', seed = 1 } = {}) {
  const g = canvas.getContext('2d')
  for (let i = 0; i < count; i++) {
    const life = (t * (0.8 + hash(i, seed) * 0.6) + hash(i, seed + 2)) % 1
    const a = hash(i, seed + 3) * 6.28, r = radius * hash(i, seed + 4)
    const px = Math.round(x + Math.cos(a) * r), py = Math.round(y + Math.sin(a) * r - life * 4)
    const size = life < 0.5 ? 1 : 0
    g.fillStyle = color
    if (size) { g.fillRect(px - 1, py, 3, 1); g.fillRect(px, py - 1, 1, 3) }
    g.fillStyle = core
    g.fillRect(px, py, 1, 1)
  }
}

/** A dithered pixel glow (no blur): concentric rings of a colour at falling density. Draw it *behind* the sprite. */
export function glow(canvas, x, y, { radius = 10, color = '#ffe9a0', strength = 0.6 } = {}) {
  const g = canvas.getContext('2d')
  g.fillStyle = color
  for (let yy = -radius; yy <= radius; yy++) for (let xx = -radius; xx <= radius; xx++) {
    const d = Math.hypot(xx, yy) / radius
    if (d > 1) continue
    const p = (1 - d) * strength
    // 4×4 Bayer threshold so the falloff is an ordered dither, as a pixel artist would do it
    const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5][((yy + 64) % 4) * 4 + ((xx + 64) % 4)] / 16
    if (p > bayer) g.fillRect(Math.round(x + xx), Math.round(y + yy), 1, 1)
  }
}
