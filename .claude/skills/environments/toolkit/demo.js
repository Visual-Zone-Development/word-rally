// Environments demo: the same toolkit in four game types. All art here is placeholder vector drawing in
// palettes picked for the demo; a game takes its palette and drawing from its own STYLE.md.
import { bakeTileset, drawTiles, N, E, S, W, BLOB_BITS as B } from './autotile.js'
import { poisson, clusters, pick, seeded } from './scatter.js'
import { parseLevel, reachable } from './levelmap.js'
import { sky, layer, drawParallax, haze, timeOfDay, mix } from './backdrop.js'

const canvasFor = (title) => {
  const c = document.createElement('canvas'); c.width = 1280; c.height = 800; document.body.appendChild(c)
  const ctx = c.getContext('2d')
  return { ctx, label: () => { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, 1280, 64); ctx.fillStyle = '#fff'; ctx.font = '600 30px system-ui'; ctx.fillText(title, 24, 42) } }
}

// 1. Side-view platformer: parallax (sky → mountains → hills → forest), edge-autotiled ground, scattered tufts
{
  const { ctx, label } = canvasFor('side view: parallax + edge autotiles + scatter')
  const P = { skyTop: '#5aa0d8', horizon: '#cfe6f0', far: '#6d8fb3', mid: '#5f9a6a', near: '#3f7a4a', ground: '#7a5236', grass: '#6cbf4a', dark: '#4a3020' }
  sky(ctx, 1280, 800, [P.skyTop, P.horizon])
  const layers = [
    { strip: layer('clouds', 1280, 300, { color: '#ffffff', light: '#ffffff', base: 0.35, amp: 0.4, seed: 2 }), factor: 0.05, y: 40 },
    { strip: layer('mountains', 1280, 420, { color: haze(P.far, P.horizon, 0.6), light: '#f4f8fb', base: 0.95, amp: 0.7, seed: 4 }), factor: 0.15, y: 160 },
    { strip: layer('hills', 1280, 360, { color: haze(P.mid, P.horizon, 0.35), base: 0.9, amp: 0.4, seed: 7, rim: 3, light: mix(P.mid, '#ffffff', 0.25) }), factor: 0.35, y: 300 },
    { strip: layer('forest', 1280, 300, { color: haze(P.near, P.horizon, 0.15), base: 0.85, amp: 0.25, seed: 9 }), factor: 0.6, y: 380 }
  ]
  drawParallax(ctx, layers, 900)
  const T = 40
  const set = bakeTileset('edge', T, (g, m, s) => {
    g.fillStyle = P.ground; g.fillRect(0, 0, s, s)
    g.fillStyle = P.dark
    for (let i = 0; i < 3; i++) g.fillRect(6 + ((i * 13 + m * 7) % 26), 12 + ((i * 11 + m * 5) % 22), 4, 3) // pebbles
    if (!(m & W)) g.fillRect(0, 0, 4, s)
    if (!(m & E)) g.fillRect(s - 4, 0, 4, s)
    if (!(m & S)) g.fillRect(0, s - 5, s, 5)
    if (!(m & N)) { g.fillStyle = P.grass; g.fillRect(0, 0, s, 10); for (let x = 2; x < s; x += 7) g.fillRect(x, 8, 4, 5) } // grass cap
  }, { scale: 2 })
  const L = parseLevel(`
    ................................
    ................................
    ................................
    ................................
    ................................
    ................................
    ................................
    ................................
    ................................
    .........#####..................
    ................................
    .....................######.....
    ..........................#.....
    ###########.....###############.
    ###########.....################
    ###########..##.################
    ################################
    ################################
    ################################
    ################################`, { legend: { '#': 'ground', '.': null } })
  drawTiles(ctx, set, L.grid, (v) => v === 'ground', { outsideIs: false })
  // tufts only on top surfaces (cells whose north neighbour is empty)
  const rnd = seeded(5)
  for (let y = 1; y < L.h; y++) for (let x = 0; x < L.w; x++) if (L.grid[y][x] && !L.grid[y - 1][x] && rnd() < 0.5) {
    ctx.fillStyle = rnd() < 0.3 ? '#f4d35e' : '#8fd65a'; ctx.beginPath(); ctx.arc(x * T + 8 + rnd() * 24, y * T - 4, 4 + rnd() * 3, 0, 7); ctx.fill()
  }
  label()
}

// 2. Top-down room: blob-autotiled walls with a front face, a level from text, scattered props avoiding walls
{
  const { ctx, label } = canvasFor('top-down: blob walls + level text + scatter + reachability')
  const P = { floor: '#3a3448', floor2: '#423b52', wallTop: '#8b7fa8', wallFace: '#5a4f72', line: '#1c1726', moss: '#5f9a6a' }
  const T = 40
  const L = parseLevel(`
    ################################
    #..............##..............#
    #..P...........##.......c......#
    #..............##..............#
    #.......####.......####........#
    #.......#..#.......#..#........#
    #.......####.......####........#
    #..............................#
    ######.....##########.....######
    #..............##..............#
    #......c.......##.........E....#
    #..............................#
    #..............................#
    #.......###............###.....#
    #.......###............###.....#
    #..............................#
    #..............................#
    #..............................#
    ################################`, { legend: { '#': 'wall', '.': 'floor', P: { entity: 'player', tile: 'floor' }, c: { entity: 'chest', tile: 'floor' }, E: { entity: 'exit', tile: 'floor' } } })
  // floor checker
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) { ctx.fillStyle = (x + y) % 2 ? P.floor : P.floor2; ctx.fillRect(x * T, 64 + y * T, T, T) }
  const set = bakeTileset('blob', T, (g, m, s) => {
    g.fillStyle = P.wallTop; g.fillRect(0, 0, s, s)
    g.fillStyle = P.line
    if (!(m & B.N)) g.fillRect(0, 0, s, 3)
    if (!(m & B.W)) g.fillRect(0, 0, 3, s)
    if (!(m & B.E)) g.fillRect(s - 3, 0, 3, s)
    if (!(m & B.S)) { g.fillStyle = P.wallFace; g.fillRect(0, s * 0.55, s, s * 0.45); g.fillStyle = P.line; g.fillRect(0, s - 3, s, 3) } // front face
    if (m & B.N && m & B.W && !(m & B.NW)) g.fillRect(0, 0, 4, 4) // inner corners
    if (m & B.N && m & B.E && !(m & B.NE)) g.fillRect(s - 4, 0, 4, 4)
  }, { scale: 2 })
  drawTiles(ctx, set, L.grid, (v) => v === 'wall', { y0: 64 })
  const solid = (px, py) => { const x = Math.floor(px / T), y = Math.floor((py - 64) / T); return !L.grid[y] || L.grid[y][x] !== 'floor' || L.grid[y + 1]?.[x] === 'wall' }
  for (const p of poisson(1280, 800, { minDist: 70, seed: 8, avoid: (x, y) => y < 70 || solid(x, y) || solid(x + 12, y + 12) || solid(x - 12, y - 12) })) {
    const kind = pick(p.r, [['rug', 1], ['pot', 3], ['moss', 4]])
    ctx.fillStyle = kind === 'pot' ? '#c98a5a' : kind === 'rug' ? '#7a3a4a' : P.moss
    ctx.beginPath(); kind === 'rug' ? ctx.rect(p.x - 18, p.y - 12, 36, 24) : ctx.arc(p.x, p.y, kind === 'pot' ? 9 : 6, 0, 7); ctx.fill()
  }
  const reach = reachable(L.grid, L.entities[0].x, L.entities[0].y, (v) => v === 'floor')
  for (const e of L.entities) {
    ctx.fillStyle = e.type === 'player' ? '#5cc8ff' : e.type === 'exit' ? '#ffd36b' : '#e0904a'
    ctx.fillRect(e.x * T + 8, 64 + e.y * T + 8, T - 16, T - 16)
    if (!reach(e.x, e.y)) { ctx.strokeStyle = '#ff4060'; ctx.lineWidth = 4; ctx.strokeRect(e.x * T + 2, 64 + e.y * T + 2, T - 4, T - 4) }
  }
  label()
}

// 3. Space shooter: three star layers at different speeds, a nebula haze, clustered asteroid belt
{
  const { ctx, label } = canvasFor('space: star parallax + clustered scatter')
  sky(ctx, 1280, 800, ['#05040c', '#120a24', '#0a0614'])
  const g = ctx.createRadialGradient(900, 300, 20, 900, 300, 420); g.addColorStop(0, 'rgba(160,60,200,0.35)'); g.addColorStop(1, 'rgba(160,60,200,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1280, 800)
  drawParallax(ctx, [
    { strip: layer('stars', 1280, 800, { color: '#5a5a7a', light: '#9aa0c0', seed: 1, detail: 1.4 }), factor: 0.1 },
    { strip: layer('stars', 1280, 800, { color: '#9aa0c0', light: '#ffffff', seed: 2 }), factor: 0.3 },
    { strip: layer('stars', 1280, 800, { color: '#ffffff', light: '#bfe8ff', seed: 3, detail: 0.3 }), factor: 0.8 }
  ], 300)
  for (const a of clusters(1280, 800, { count: 4, per: 14, radius: 110, seed: 6, avoid: (x, y) => y < 70 })) {
    const r = 8 + a.r * 22
    ctx.fillStyle = '#6a5a5a'; ctx.beginPath()
    for (let i = 0; i < 9; i++) { const ang = (i / 9) * 6.283, rr = r * (0.8 + ((i * 7 + a.cluster) % 5) / 12); ctx.lineTo(a.x + Math.cos(ang) * rr, a.y + Math.sin(ang) * rr) }
    ctx.fill(); ctx.fillStyle = '#8a7a72'; ctx.beginPath(); ctx.arc(a.x - r * 0.25, a.y - r * 0.25, r * 0.45, 0, 7); ctx.fill()
  }
  label()
}

// 4. Runner / racer at dusk: time-of-day palette, pixel-art mode layers (city, waves), road strip
{
  const { ctx, label } = canvasFor('time of day + pixel-mode layers (city, sea)')
  const pal = timeOfDay({
    0.0: { top: '#0b1030', horizon: '#2a2a5a', far: '#1a1a3a', near: '#0e0e22', lights: '#ffd36b', sea: '#141838' },
    0.5: { top: '#4a90d8', horizon: '#cfe6f0', far: '#7a8aa8', near: '#4a5068', lights: '#4a5068', sea: '#3a78b8' },
    0.75: { top: '#2a2858', horizon: '#ff9a6a', far: '#6a4a7a', near: '#2e2440', lights: '#ffd36b', sea: '#4a3a6a' }
  }, 0.78)
  sky(ctx, 1280, 560, [pal.top, pal.horizon])
  ctx.fillStyle = mix(pal.horizon, '#ffffff', 0.4); ctx.beginPath(); ctx.arc(980, 470, 60, 0, 7); ctx.fill() // low sun
  drawParallax(ctx, [
    { strip: layer('city', 1280, 400, { color: haze(pal.far, pal.horizon, 0.5), base: 1, amp: 0.7, seed: 3, pixel: 4 }), factor: 0.2, y: 160 },
    { strip: layer('city', 1280, 360, { color: pal.near, light: pal.lights, base: 1, amp: 0.85, seed: 8, pixel: 4 }), factor: 0.5, y: 200 },
    { strip: layer('waves', 1280, 260, { color: pal.sea, light: mix(pal.horizon, '#ffffff', 0.3), base: 0.15, amp: 0.05, seed: 2, pixel: 4 }), factor: 0.8, y: 540 }
  ], 500)
  ctx.fillStyle = '#26202e'; ctx.fillRect(0, 700, 1280, 100)
  ctx.fillStyle = '#f4d35e'; for (let x = 20; x < 1280; x += 120) ctx.fillRect(x, 746, 60, 8)
  label()
}
document.title = 'ready'
