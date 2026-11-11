// Level maps from text (environments skill): draw a level as a grid of characters with a legend, for any
// grid-based game — platformer stages, top-down rooms, dungeon floors, puzzle boards, racing-track tiles,
// tower-defence paths. Gives layers, entity spawns and merged collision rectangles; the game decides how
// each layer looks (autotile.js) and behaves (physics-feel).
//
//   const level = parseLevel(`
//     ##########
//     #..P...c.#
//     #..####..#
//     #~~~~~~~E#
//     ##########`, { legend: { '#': 'wall', '.': 'floor', '~': 'water', P: { entity: 'player', tile: 'floor' },
//                               c: { entity: 'coin', tile: 'floor' }, E: { entity: 'exit', tile: 'floor' } } })

export function parseLevel(text, { legend = {}, empty = ' ' } = {}) {
  const lines = text.replace(/\r/g, '').split('\n')
  while (lines.length && !lines[0].trim()) lines.shift()
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length))
  const rows = lines.map((l) => l.slice(indent))
  const h = rows.length, w = Math.max(...rows.map((r) => r.length))
  const grid = [], entities = [], unknown = new Set()
  for (let y = 0; y < h; y++) {
    const row = []
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x] ?? empty
      const def = legend[ch]
      if (def === undefined && ch !== empty) unknown.add(ch)
      if (def && typeof def === 'object') {
        row.push(def.tile ?? null)
        if (def.entity) entities.push({ type: def.entity, x, y, ...def.props })
      } else row.push(def ?? null)
    }
    grid.push(row)
  }
  return { w, h, grid, entities, unknown: [...unknown] }
}

/**
 * Merge solid cells into as few rectangles as possible (greedy meshing): fewer colliders, no seams for
 * things to catch on. Returns [{ x, y, w, h }] in cells; multiply by the tile size.
 */
export function solidRects(grid, isSolid) {
  const h = grid.length, w = grid[0]?.length ?? 0
  const used = Array.from({ length: h }, () => new Uint8Array(w))
  const out = []
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (used[y][x] || !isSolid(grid[y][x])) continue
    let rw = 1
    while (x + rw < w && !used[y][x + rw] && isSolid(grid[y][x + rw])) rw++
    let rh = 1
    grow: while (y + rh < h) {
      for (let i = 0; i < rw; i++) if (used[y + rh][x + i] || !isSolid(grid[y + rh][x + i])) break grow
      rh++
    }
    for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) used[y + j][x + i] = 1
    out.push({ x, y, w: rw, h: rh })
  }
  return out
}

/** Flood fill from (x, y) over cells where pass(value) — reachability checks (is the exit reachable?). */
export function reachable(grid, x, y, pass) {
  const h = grid.length, w = grid[0].length, seen = new Uint8Array(w * h), q = [[x, y]]
  seen[y * w + x] = 1
  while (q.length) {
    const [cx, cy] = q.pop()
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny * w + nx] || !pass(grid[ny][nx])) continue
      seen[ny * w + nx] = 1
      q.push([nx, ny])
    }
  }
  return (tx, ty) => !!seen[ty * w + tx]
}
