// Autotiling (environments skill): pick the right tile variant from a grid automatically, for any game
// type and any renderer (pixel tiles, vector shapes, painted sprites, 3D modular pieces). The rules are
// pure functions on a grid; how a tile looks is up to the game (draw callbacks, sprite sheets, meshes).
//
// Three standard schemes:
// - edge (16):   4-bit mask of same-type neighbours N, E, S, W. Side-view ground and platforms (grass caps on
//                top, walls at the sides), pipes, rails, fences, roads, rivers drawn as lines.
// - blob (47):   8-neighbour mask with corners counted only when both adjacent edges match. Top-down walls,
//                cliffs, water bodies, carpets, any filled region whose outline has inner and outer corners.
// - corner (16): terrain stored on cell corners (vertices). Blending two terrains (sand → grass, floor →
//                lava) where the border should wobble through the middle of tiles (Wang tiles).

export const N = 1, E = 2, S = 4, W = 8

/** Read a grid of rows (arrays or strings) safely: outside counts as `outside`. */
export function cellAt(grid, x, y, outside = null) {
  if (y < 0 || y >= grid.length || x < 0 || x >= grid[y].length) return outside
  return grid[y][x]
}

/** Edge mask (0–15): which of N, E, S, W neighbours satisfy is(value). */
export function edgeMask(grid, x, y, is, outsideIs = true) {
  const t = (dx, dy) => { const v = cellAt(grid, x + dx, y + dy, undefined); return v === undefined ? outsideIs : is(v) }
  return (t(0, -1) ? N : 0) | (t(1, 0) ? E : 0) | (t(0, 1) ? S : 0) | (t(-1, 0) ? W : 0)
}

// blob: bit order N, NE, E, SE, S, SW, W, NW
const B = { N: 1, NE: 2, E: 4, SE: 8, S: 16, SW: 32, W: 64, NW: 128 }

/** Blob mask reduced to one of the 47 meaningful values (corners only count with both neighbouring edges). */
export function blobMask(grid, x, y, is, outsideIs = true) {
  const t = (dx, dy) => { const v = cellAt(grid, x + dx, y + dy, undefined); return v === undefined ? outsideIs : is(v) }
  let m = 0
  if (t(0, -1)) m |= B.N
  if (t(1, 0)) m |= B.E
  if (t(0, 1)) m |= B.S
  if (t(-1, 0)) m |= B.W
  if (t(1, -1) && m & B.N && m & B.E) m |= B.NE
  if (t(1, 1) && m & B.S && m & B.E) m |= B.SE
  if (t(-1, 1) && m & B.S && m & B.W) m |= B.SW
  if (t(-1, -1) && m & B.N && m & B.W) m |= B.NW
  return m
}

/** The 47 reduced blob masks in a fixed order: BLOB47[i] is the mask drawn at tile i of a blob tileset. */
export const BLOB47 = (() => {
  const set = new Set()
  for (let m = 0; m < 256; m++) {
    let r = m & (B.N | B.E | B.S | B.W)
    if (m & B.NE && r & B.N && r & B.E) r |= B.NE
    if (m & B.SE && r & B.S && r & B.E) r |= B.SE
    if (m & B.SW && r & B.S && r & B.W) r |= B.SW
    if (m & B.NW && r & B.N && r & B.W) r |= B.NW
    set.add(r)
  }
  return [...set].sort((a, b) => a - b)
})()
const BLOB_INDEX = new Map(BLOB47.map((m, i) => [m, i]))
export const blobIndex = (mask) => BLOB_INDEX.get(mask)
export const BLOB_BITS = B

/** Corner index (0–15) for cell (x, y) from a vertex grid of size (w+1)×(h+1): NW·8 + NE·4 + SW·2 + SE·1. */
export function cornerIndex(vertices, x, y, is) {
  const v = (vx, vy) => (is(cellAt(vertices, vx, vy, null)) ? 1 : 0)
  return v(x, y) * 8 + v(x + 1, y) * 4 + v(x, y + 1) * 2 + v(x + 1, y + 1)
}

/**
 * Bake a tileset by drawing every variant with your own draw function, so the art stays the game's own:
 * bakeTileset('blob', 32, (ctx, mask, size) => { … }) → { canvas, size, index(mask) → [sx, sy] }.
 * scheme: 'edge' (16 variants), 'blob' (47) or 'corner' (16). Works for pixel art (draw at native size,
 * blit with smoothing off) and vector art (bake at 2× for DPR 2 with scale).
 */
export function bakeTileset(scheme, size, draw, { cols = 8, scale = 1 } = {}) {
  const masks = scheme === 'blob' ? BLOB47 : [...Array(16).keys()]
  const rows = Math.ceil(masks.length / cols)
  const canvas = document.createElement('canvas')
  canvas.width = cols * size * scale
  canvas.height = rows * size * scale
  const ctx = canvas.getContext('2d')
  masks.forEach((mask, i) => {
    ctx.save()
    ctx.translate((i % cols) * size * scale, Math.floor(i / cols) * size * scale)
    ctx.scale(scale, scale)
    ctx.beginPath(); ctx.rect(0, 0, size, size); ctx.clip()
    draw(ctx, mask, size)
    ctx.restore()
  })
  const at = new Map(masks.map((m, i) => [m, [(i % cols) * size * scale, Math.floor(i / cols) * size * scale]]))
  return { canvas, size, scale, scheme, index: (mask) => at.get(mask) }
}

/** Draw a whole grid with a baked tileset: maskFn(grid, x, y) → mask; only cells where is(value) are drawn. */
export function drawTiles(ctx, set, grid, is, { maskFn, x0 = 0, y0 = 0, outsideIs = true } = {}) {
  const fn = maskFn || (set.scheme === 'blob' ? (g, x, y) => blobMask(g, x, y, is, outsideIs) : (g, x, y) => edgeMask(g, x, y, is, outsideIs))
  const s = set.size, k = set.scale
  for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid[y].length; x++) {
    if (!is(grid[y][x])) continue
    const [sx, sy] = set.index(fn(grid, x, y))
    ctx.drawImage(set.canvas, sx, sy, s * k, s * k, x0 + x * s, y0 + y * s, s, s)
  }
}
