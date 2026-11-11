// Pixel tiles (pixel-art skill): seamless terrain fills, 16-tile corner (Wang) transition sets between two
// terrains, and a map builder that picks the right transition tile from a corner grid. Every fill uses the
// same hue-shifted ramps as pixelforge.js and draws *clusters* (2–4 px groups), never per-pixel noise,
// which is what separates pixel-art terrain from a noisy texture.
import { ramp } from './pixelforge.js'

// ---------- periodic noise (tiles wrap seamlessly) ----------

function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

/** Value noise that repeats every `period` px, so a tile's left edge matches its right edge. */
export function pnoise(x, y, cell, period, seed = 1) {
  const n = Math.max(1, Math.round(period / cell))
  const gx = x / cell, gy = y / cell
  const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0
  const v = (i, j) => hash(((i % n) + n) % n, ((j % n) + n) % n, seed)
  const s = (t) => t * t * (3 - 2 * t)
  const a = v(x0, y0), b = v(x0 + 1, y0), c = v(x0, y0 + 1), d = v(x0 + 1, y0 + 1)
  return a + (b - a) * s(fx) + (c - a) * s(fy) + (a - b - c + d) * s(fx) * s(fy)
}

const rgbOf = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }

// ---------- terrain fills: (x, y, tileSize) → ramp index; colours come from the terrain's ramp ----------

/**
 * Terrain presets. Each is { ramp, fill(x, y, T, seed, variant) → ramp index, edge: ramp index for its border line, lip }.
 * Add your own the same way: big soft patches from pnoise at cell ≈ T/2, then small clusters on top.
 */
export const TERRAIN = {
  grass: (base = '#4f9a3c') => ({
    ramp: ramp(base, 5, { hueShift: 26 }),
    fill(x, y, T, seed, variant = 0) {
      // one flat base tone + sparse blade clusters (a light pixel over a dark one) that differ per variant.
      // No noise patches: anything periodic at tile size shows up as a grid across the map.
      let k = 2
      const lx = ((x % T) + T) % T, ly = ((y % T) + T) % T
      const h = hash(lx, ly, seed + 9 + variant * 101)
      if (h > 0.94) k = 3
      else if (h < 0.02) k = 1
      if (hash(lx, (ly - 1 + T) % T, seed + 9 + variant * 101) > 0.94) k = 1 // shadow under a blade
      return k
    },
    edge: 0
  }),
  dirt: (base = '#9a6a3f') => ({
    ramp: ramp(base, 5, { hueShift: 18 }),
    fill(x, y, T, seed, variant = 0) {
      const p = pnoise(x, y, T / 3, T, seed + 3)
      const h = hash(((x % T) + T) % T, ((y % T) + T) % T, seed + 4 + variant * 101)
      if (h > 0.96) return 3 // pebble
      if (h < 0.03) return 0
      return p > 0.6 ? 2 : 1
    },
    edge: 0
  }),
  sand: (base = '#e0c27a') => ({
    ramp: ramp(base, 5, { hueShift: 14, spread: 0.36 }),
    fill(x, y, T, seed, variant = 0) {
      const ripple = Math.sin(((x % T) / T) * Math.PI * 2 + (y / T) * Math.PI * 6 + pnoise(x, y, T / 2, T, seed) * 3)
      const h = hash(((x % T) + T) % T, ((y % T) + T) % T, seed + 5 + variant * 101)
      return h > 0.95 ? 3 : ripple > 0.75 ? 3 : 2
    },
    edge: 1
  }),
  water: (base = '#3a7bd5', frame = 0) => ({
    ramp: ramp(base, 5, { hueShift: 16 }),
    fill(x, y, T, seed, variant = 0) {
      // a few short highlight glints (3 px) on every 4th row, drifting with `frame`
      const ly = ((y % T) + T) % T, lx = (((x + frame) % T) + T) % T
      const glint = ly % 4 === 1 && hash(Math.floor(lx / 4), ly, seed + 8 + variant * 101) > 0.8 && lx % 4 !== 3
      const ripple = ly % 4 === 2 && hash(Math.floor(lx / 3), ly, seed + 9 + variant * 101) > 0.85
      return glint ? 3 : ripple ? 1 : 2
    },
    edge: 4, // light foam line where water meets land
    lip: true
  }),
  stone: (base = '#8a8fa0') => ({
    ramp: ramp(base, 5, { hueShift: 24 }),
    fill(x, y, T, seed, variant = 0) {
      // cobbles: offset brick grid, dark mortar line on bottom/right, light edge on top/left
      const bw = T / 2, bh = T / 4
      const row = Math.floor((((y % T) + T) % T) / bh)
      const ox = row % 2 ? bw / 2 : 0
      const lx = ((((x + ox) % T) + T) % T) % bw, ly = (((y % T) + T) % T) % bh
      if (lx === bw - 1 || ly === bh - 1) return 0
      if (lx === 0 || ly === 0) return 3
      const h = hash(Math.floor((((x + ox) % T) + T) % T / bw), row, seed + 6 + variant * 101)
      return h > 0.66 ? 2 : h > 0.33 ? 1 : 2
    },
    edge: 0
  })
}

/** One seamless T×T tile of a terrain (draw it in a grid; it wraps). */
export function tile(terrain, { size: T = 16, seed = 1, variant = 0 } = {}) {
  const c = document.createElement('canvas')
  c.width = c.height = T
  const g = c.getContext('2d')
  const img = g.createImageData(T, T)
  const cols = terrain.ramp.map(rgbOf)
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const k = cols[terrain.fill(x, y, T, seed, variant)]
    const i = (y * T + x) * 4
    img.data[i] = k[0]; img.data[i + 1] = k[1]; img.data[i + 2] = k[2]; img.data[i + 3] = 255
  }
  g.putImageData(img, 0, 0)
  return c
}

/**
 * A 16-tile corner (Wang) transition set from `lower` to `upper` terrain (e.g. water → grass, dirt → grass).
 * Tile index = NW·8 + NE·4 + SW·2 + SE·1, where a corner bit of 1 means `upper` terrain at that corner.
 * The boundary wobbles with noise (never a straight diagonal), the upper terrain gets a 1-px darker rim on
 * its lower-facing edge and, for water lips, a light foam line. Returns { canvas (4×4 tiles), size, index() }.
 */
export function wang(lower, upper, { size: T = 16, seed = 1, wobble = 0.22, rim = true, variants = 4 } = {}) {
  const c = document.createElement('canvas')
  c.width = c.height = T * 4
  const g = c.getContext('2d')
  const img = g.createImageData(T * 4, T * 4)
  const LC = lower.ramp.map(rgbOf), UC = upper.ramp.map(rgbOf)
  for (let t = 0; t < 16; t++) {
    const nw = (t >> 3) & 1, ne = (t >> 2) & 1, sw = (t >> 1) & 1, se = t & 1
    const tx = (t % 4) * T, ty = Math.floor(t / 4) * T
    const up = new Uint8Array(T * T)
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const u = (x + 0.5) / T, v = (y + 0.5) / T
      const m = nw * (1 - u) * (1 - v) + ne * u * (1 - v) + sw * (1 - u) * v + se * u * v
      // noise sampled in a way that matches along shared edges (edges use only that edge's coordinate)
      // the wobble fades to 0 at the tile edges, so neighbouring tiles always meet on the same line
      const n = (pnoise(x, y, T / 4, T, seed + 21) - 0.5) * 2 * wobble * Math.min(1, 4 * Math.min(u, 1 - u, v, 1 - v))
      up[y * T + x] = m + n > 0.5 ? 1 : 0
    }
    // remove single-pixel islands and notches so the edge reads as a clean pixel line
    for (let pass = 0; pass < 2; pass++) for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const i = y * T + x
      let same = 0, n = 0
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy
        if (X < 0 || Y < 0 || X >= T || Y >= T) continue
        n++
        if (up[Y * T + X] === up[i]) same++
      }
      if (n >= 3 && same <= 1) up[i] ^= 1
    }
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const i = y * T + x
      let col
      if (up[i]) {
        col = UC[upper.fill(x, y, T, seed, 0)]
        // rim: upper pixels that touch lower on their south or east side get the dark edge (light comes from top-left)
        if (rim && ((y < T - 1 && !up[i + T]) || (x < T - 1 && !up[i + 1]))) col = UC[upper.edge]
      } else {
        col = LC[lower.fill(x, y, T, seed, 0)]
        // lip: lower pixels right under/next to upper (e.g. foam on water)
        if (lower.lip && ((y > 0 && up[i - T]) || (x > 0 && up[i - 1]) || (y < T - 1 && up[i + T]) || (x < T - 1 && up[i + 1]))) col = LC[lower.edge]
      }
      const o = ((ty + y) * T * 4 + tx + x) * 4
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  // extra versions of the two solid tiles (same patches, different small clusters) to break up repetition
  const solids = {
    lower: Array.from({ length: variants }, (_, v) => tile(lower, { size: T, seed, variant: v })),
    upper: Array.from({ length: variants }, (_, v) => tile(upper, { size: T, seed, variant: v }))
  }
  return { canvas: c, size: T, solids, index: (nw, ne, sw, se) => nw * 8 + ne * 4 + sw * 2 + se }
}

/**
 * Build a map image from a corner grid: corners[(H+1)][(W+1)] of 0/1 (1 = upper terrain).
 * Returns a canvas of W×H tiles. Generate corners from noise, a hand-drawn string grid, or a level file.
 */
export function buildMap(set, corners) {
  const H = corners.length - 1, W = corners[0].length - 1, T = set.size
  const c = document.createElement('canvas')
  c.width = W * T
  c.height = H * T
  const g = c.getContext('2d')
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = set.index(corners[y][x], corners[y][x + 1], corners[y + 1][x], corners[y + 1][x + 1])
    const solid = t === 0 ? set.solids?.lower : t === 15 ? set.solids?.upper : null
    if (solid) g.drawImage(solid[Math.floor(hash(x, y, 77) * solid.length)], x * T, y * T)
    else g.drawImage(set.canvas, (t % 4) * T, Math.floor(t / 4) * T, T, T, x * T, y * T, T, T)
  }
  return c
}

/** Corner grid from noise: 1 where noise > threshold. Use the same seed to rebuild the same map. */
export function noiseCorners(w, h, { cell = 4, threshold = 0.5, seed = 1 } = {}) {
  return Array.from({ length: h + 1 }, (_, y) => Array.from({ length: w + 1 }, (_, x) => (pnoise(x, y, cell, 1e6, seed) > threshold ? 1 : 0)))
}
