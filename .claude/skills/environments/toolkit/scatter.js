// Scattering (environments skill): place many things naturally — trees, rocks, grass tufts, debris, crowds,
// stars, asteroids, pickups, 3D instances — with no grid look and no clumps, for any game type. Seeded, so a
// level looks the same every time. Returns points; drawing or instancing them is the game's job.

export function seeded(seed = 1) {
  let s = Math.floor(Math.abs(seed) * 2147483646) % 2147483647 || 1
  return () => ((s = (s * 16807) % 2147483647) / 2147483647)
}

/**
 * Poisson-disk sampling (Bridson): points at least minDist apart, filling the area evenly but irregularly.
 * density(x, y) → 0..1 thins points (forest edges, fewer rocks near paths); avoid(x, y) → true rejects a
 * spot (walls, roads, the player's start, other objects). Each point gets a seeded rnd value for variation
 * (which sprite, scale, rotation, tint).
 */
export function poisson(w, h, { minDist = 32, density = null, avoid = null, seed = 1, tries = 24, max = Infinity } = {}) {
  const rnd = seeded(seed)
  const cell = minDist / Math.SQRT2
  const gw = Math.ceil(w / cell), gh = Math.ceil(h / cell)
  const grid = new Int32Array(gw * gh).fill(-1)
  const pts = [], active = []
  const fits = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false
    const gx = Math.floor(x / cell), gy = Math.floor(y / cell)
    for (let j = Math.max(0, gy - 2); j <= Math.min(gh - 1, gy + 2); j++)
      for (let i = Math.max(0, gx - 2); i <= Math.min(gw - 1, gx + 2); i++) {
        const k = grid[j * gw + i]
        if (k >= 0 && Math.hypot(pts[k].x - x, pts[k].y - y) < minDist) return false
      }
    return true
  }
  const add = (x, y) => {
    const p = { x, y, r: rnd() }
    grid[Math.floor(y / cell) * gw + Math.floor(x / cell)] = pts.length
    pts.push(p); active.push(p)
  }
  add(rnd() * w, rnd() * h)
  while (active.length && pts.length < max * 4) {
    const i = Math.floor(rnd() * active.length), p = active[i]
    let placed = false
    for (let t = 0; t < tries; t++) {
      const a = rnd() * Math.PI * 2, d = minDist * (1 + rnd())
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d
      if (fits(x, y)) { add(x, y); placed = true; break }
    }
    if (!placed) active.splice(i, 1)
  }
  // density and avoid filter afterwards, so spacing stays even where points remain
  const out = pts.filter((p) => (!density || rnd() < density(p.x, p.y)) && !(avoid && avoid(p.x, p.y)))
  return out.slice(0, max)
}

/** Clusters: a few seeds, each spawning a tight group (flower patches, rubble, crowds, asteroid belts). */
export function clusters(w, h, { count = 6, per = 8, radius = 40, seed = 1, avoid = null } = {}) {
  const rnd = seeded(seed)
  const out = []
  for (let c = 0; c < count; c++) {
    const cx = rnd() * w, cy = rnd() * h
    for (let i = 0; i < per; i++) {
      const a = rnd() * Math.PI * 2, d = radius * Math.sqrt(rnd())
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d
      if (x >= 0 && y >= 0 && x < w && y < h && !(avoid && avoid(x, y))) out.push({ x, y, r: rnd(), cluster: c })
    }
  }
  return out
}

/** Pick from weighted options with a point's r: pick(p.r, [['tree', 5], ['bush', 3], ['rock', 1]]). */
export function pick(r, options) {
  const total = options.reduce((s, o) => s + o[1], 0)
  let x = r * total
  for (const [v, wgt] of options) { if ((x -= wgt) < 0) return v }
  return options[options.length - 1][0]
}
