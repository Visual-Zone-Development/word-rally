// Showcase for the pixel-art toolkit. Everything is rendered at native pixel size and blitted at whole-number
// scales with smoothing off; text is drawn at full resolution with the bundled pixel font.
import { character, render, ANIMS, DIRS8 } from './pixelforge.js'
import { TERRAIN, tile, wang, buildMap, noiseCorners } from './tiles.js'
import { panel, button, bar, slot, speech, CHROME } from './pixelui.js'
import { tree, rock, bush, chest, slime, SLIME_HOP, potion, coin, swordIcon } from './props.js'
import { renderHD } from './hd.js'
import { figure, standPose, holdPose } from './figure.js'
import { flame, sparkles } from './fx.js'

const BG = '#1b1626', INK = '#f4ead2', DIM = '#9a8fb0'
const q = new URLSearchParams(location.search)
const only = q.get('section')

const CAST = {
  knight: character({ hair: 'spiky', cape: true, weapon: 'sword', shield: true, colors: { hair: '#e8e2d0', top: '#3d6fb6', bottom: '#3b3550', accent: '#c0392b', metal: '#b8c4d0' } }),
  mage: character({ hat: 'wizard', hair: 'long', weapon: 'staff', colors: { hair: '#c9a0dc', top: '#5b3f8c', bottom: '#40305e', accent: '#7a4fc0', skin: '#f6d3b8' } }),
  rogue: character({ hat: 'hood', weapon: 'sword', build: 0.9, colors: { top: '#3f5f3a', bottom: '#3a3226', accent: '#4f7a3f', shoes: '#4a3022' } }),
  dwarf: character({ heads: 2.2, build: 1.3, hat: 'helmet', beard: true, weapon: 'axe', colors: { hair: '#b5532a', top: '#8a5a2b', bottom: '#4a3b30', accent: '#d9a536' } })
}

function canvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  document.body.appendChild(c)
  const g = c.getContext('2d')
  g.imageSmoothingEnabled = false
  g.fillStyle = BG; g.fillRect(0, 0, w, h)
  return g
}
const blit = (g, img, x, y, s) => g.drawImage(img, Math.round(x), Math.round(y), img.width * s, img.height * s)
function label(g, str, x, y, size = 24, color = INK, align = 'left') {
  g.font = `400 ${size}px "Pixelify Sans"`
  g.textBaseline = 'top'
  g.textAlign = align
  g.fillStyle = '#0c0a14'; g.fillText(str, x + 2, y + 2)
  g.fillStyle = color; g.fillText(str, x, y)
}

function chars() {
  const g = canvas(1280, 800)
  label(g, 'Characters: 8 directions, low top-down, 64 px, from one model each', 24, 16)
  DIRS8.forEach((d, i) => {
    const img = render(CAST.knight, { size: 64, scale: 1.4, dir: d, view: 'low top-down', pose: ANIMS.idle.pose(0) })
    blit(g, img, 24 + i * 154, 52, 2)
    label(g, d, 34 + i * 154, 186, 24, DIM)
  })
  const names = Object.keys(CAST)
  label(g, 'Same rules, different specs (south-east, ×3)', 24, 234)
  names.forEach((n, i) => {
    blit(g, render(CAST[n], { size: 64, scale: 1.4, dir: 'south-east', view: 'low top-down', pose: ANIMS.idle.pose(0) }), 24 + i * 214, 268, 3)
  })
  label(g, 'Views: side · low top-down · high top-down · isometric', 24, 470)
  ;['side', 'low top-down', 'high top-down', 'isometric'].forEach((v, i) => {
    blit(g, render(CAST.mage, { size: 64, scale: 1.4, dir: i === 0 ? 'east' : 'south-west', view: v, pose: ANIMS.idle.pose(0) }), 24 + i * 214, 504, 3)
  })
  label(g, 'Shading: flat / basic / medium / detailed', 900, 470, 24, DIM)
  ;['flat', 'basic', 'medium', 'detailed'].forEach((s, i) => {
    const m = character({ hair: 'bob', shading: s, colors: { top: '#c0392b', hair: '#3a2a4a' } })
    blit(g, render(m, { size: 64, scale: 1.4, dir: 'south', pose: ANIMS.idle.pose(0) }), 900 + (i % 2) * 180, 504 + Math.floor(i / 2) * 140, 2)
  })
}

function anims() {
  const g = canvas(1280, 800)
  label(g, 'Animation templates (east, ×2): idle 4 · walk 8 · run 8 · attack 6 · cast 6 · jump 6 · hurt 3 · death 6', 24, 16, 24)
  const rows = [['walk', CAST.knight], ['run', CAST.knight], ['attack', CAST.knight], ['cast', CAST.mage], ['jump', CAST.dwarf], ['death', CAST.rogue]]
  rows.forEach(([a, m], r) => {
    const t = ANIMS[a]
    label(g, a, 24, 70 + r * 120, 24, DIM)
    for (let f = 0; f < t.frames; f++) {
      const phase = t.loop ? f / t.frames : f / (t.frames - 1)
      blit(g, render(m, { size: 64, scale: 1.4, dir: 'east', view: 'low top-down', pose: t.pose(phase) }), 130 + f * 132, 52 + r * 120, 2)
    }
  })
}

function world() {
  const g = canvas(1280, 800)
  label(g, 'Terrain: seamless 16 px tiles (×3) and a 16-tile corner set (water → grass)', 24, 16)
  const grass = TERRAIN.grass(), water = TERRAIN.water(), dirt = TERRAIN.dirt(), sand = TERRAIN.sand(), stone = TERRAIN.stone()
  ;[grass, dirt, sand, water, stone].forEach((t, i) => {
    const c = tile(t, { size: 16 })
    for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) blit(g, c, 24 + i * 112 + k * 48, 56 + j * 48, 3)
  })
  const set = wang(water, grass, { size: 16 })
  blit(g, set.canvas, 600, 56, 2)
  // a map: water → grass with props and characters standing on it
  const corners = noiseCorners(24, 13, { cell: 5, threshold: 0.42, seed: 3 })
  for (let y = 4; y < 10; y++) for (let x = 7; x < 17; x++) corners[y][x] = 1
  const map = buildMap(set, corners)
  const mg = map.getContext('2d')
  const view = 'high top-down'
  const props = [[tree(), 40, 70], [tree({ leaves: '#3f8a4a', seed: 3 }), 300, 64], [rock(), 150, 112], [bush(), 236, 140], [chest(), 196, 96], [tree({ seed: 5 }), 120, 60]]
  const items = [...props.map(([m, x, y]) => ({ img: render(m, { size: 64, dir: 'south', view }), x, y })),
    { img: render(CAST.knight, { size: 48, scale: 1, dir: 'south-east', view, pose: ANIMS.idle.pose(0) }), x: 170, y: 132 },
    { img: render(slime(), { size: 40, dir: 'south-west', view, pose: SLIME_HOP.pose(0.1) }), x: 214, y: 132 },
    { img: render(slime({ color: '#4a8fd9' }), { size: 40, dir: 'south', view }), x: 248, y: 112 }]
  items.sort((a, b) => a.y - b.y).forEach((o) => mg.drawImage(o.img, Math.round(o.x - o.img.width / 2), Math.round(o.y - o.img.height * 0.9)))
  label(g, 'Map built from corner grid + props and characters in the same view (×3)', 24, 214, 24, DIM)
  blit(g, map, 24, 248, 3)
  const tw = map.width * 3
  if (tw > 1232) g.fillRect(1256, 248, 24, 552)
}

function ui() {
  const g = canvas(1280, 800)
  label(g, 'UI chrome at native size (×4), text in the pixel font at full resolution', 24, 16)
  // build the chrome at native pixels on a 300×180 buffer, then blit ×4
  const W = 300, H = 180
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const u = c.getContext('2d')
  panel(u, 4, 4, 140, 104, CHROME.wood())
  button(u, 16, 18, 116, 18, 'focus')
  button(u, 16, 42, 116, 18, 'idle')
  button(u, 16, 66, 116, 18, 'pressed')
  panel(u, 152, 4, 144, 74, CHROME.night())
  bar(u, 160, 18, 128, 11, 0.62, { color: '#d9453b', lag: 0.78, ticks: 5 })
  bar(u, 160, 42, 128, 11, 0.4, { color: '#3a7bd5' })
  bar(u, 160, 60, 96, 9, 0.85, { color: '#e3b23c' })
  panel(u, 152, 84, 144, 34, CHROME.stone())
  const icons = [render(potion(), { size: 20, dir: 'south', view: 'low top-down', shadow: false }), render(potion({ liquid: '#3a7bd5' }), { size: 20, dir: 'south', view: 'low top-down', shadow: false }),
    render(coin(), { size: 20, dir: 'south-east', view: 'side', shadow: false }), render(swordIcon(), { size: 20, dir: 'south-east', view: 'side', shadow: false }), null]
  icons.forEach((it, i) => slot(u, 158 + i * 27, 89, 24, { item: it, selected: i === 0 }))
  speech(u, 4, 124, 200, 40, 40, CHROME.parchment())
  panel(u, 214, 124, 82, 52, CHROME.stone(), { inset: true, fill: 1 })
  u.drawImage(render(CAST.knight, { size: 48, scale: 0.95, dir: 'south', pose: ANIMS.idle.pose(0), shadow: false }), 231, 126)
  blit(g, c, 40, 60, 4)
  // text on top, at full resolution, aligned to the 4× grid
  const T = (s, x, y, size = 32, col = INK, align) => label(g, s, 40 + x * 4, 60 + y * 4, size, col, align)
  // button labels centred on the centre button() returns, nudged up half the cap height
  T('Continue', 74, 21, 32, '#2a1a0c', 'center'); T('New Game', 74, 45, 32, INK, 'center'); T('Settings', 74, 70, 32, '#c8b898', 'center')
  T('HP  62 / 100', 160, 9, 24); T('MP  40 / 100', 160, 33, 24, '#cfe0ff')
  T('A wild slime appears!', 12, 132, 32, '#3a2616')
}

function hd() {
  const g = canvas(1280, 800)
  label(g, 'High detail (hd.js + figure.js): 160 px cells, 3× supersampled, 7–8-step ramps, patterns, rim light', 24, 16)
  const figs = [
    [figure({ outfit: 'gown', wings: true, halo: true, hair: 'long', colors: { hair: '#e6c27a', cloth: '#efedf4' } }), 'south', holdPose(), null],
    [figure({ outfit: 'plate', wings: { span: 2.7, height: 3.0 }, hair: 'swept', sword: true, colors: { hair: '#8a5a3a', feather: '#ab927a', featherDark: '#82695a', cloth2: '#4a5470' } }), 'south', standPose(), 'flame'],
    [figure({ outfit: 'robe', cloak: true, crown: true, beard: true, hair: 'long', cloakColor: '#3c3f4c', colors: { hair: '#d8d4cc', beard: '#e6e2da', cloth: '#e9e5dc', skin: '#e8c4a8' } }), 'south', standPose({ swordOut: false, armsOut: 0.3 }), null],
    [figure({ outfit: 'druid', hair: 'long', staff: true, height: 100, heads: 6, colors: { hair: '#7a4a2a', cloth: '#5f7d3c', cloth2: '#c9a14a', leather: '#6a4a2a' } }), 'south-east', standPose({ swordOut: false }), 'gem']
  ]
  figs.forEach(([m, dir, pose, fx], i) => {
    const r = renderHD(m, { size: 160, scale: 1, dir, view: 'low top-down', pose, ss: 3, points: ['swordBase', 'swordTip', 'staffTop'] })
    if (fx === 'flame' && r.points.swordBase) flame(r.canvas, r.points.swordBase, r.points.swordTip, { t: 0.4, height: 16, width: 3.2, occlude: r })
    if (fx === 'gem' && r.points.staffTop) sparkles(r.canvas, r.points.staffTop[0], r.points.staffTop[1], { t: 0.3, radius: 9, color: '#bff0ff' })
    blit(g, r.canvas, 8 + i * 318, 50, 2)
    blit(g, r.canvas, 8 + i * 318, 380, 1)
  })
  label(g, '×2 above, ×1 (actual size) below', 24, 560, 24, DIM)
}

function anatomy() {
  const g = canvas(1280, 800)
  label(g, 'Anatomy: muscle masses, contrapposto (×2)', 24, 12)
  const body = (sex, face) => figure({ outfit: 'tunic', hair: sex === 'fem' ? 'long' : 'short', body: sex, face,
    colors: sex === 'fem' ? { hair: '#b0582e', cloth: '#7a9a5a', cloth2: '#4a3f38', skin: '#f2cfb4' } : { hair: '#5a3a26', cloth: '#5a7a9a', cloth2: '#4a3f38', skin: '#e2b08c' } })
  ;[['masc', 'south'], ['masc', 'south-east'], ['fem', 'south'], ['fem', 'south-west']].forEach(([sx, d], i) => {
    blit(g, renderHD(body(sx), { size: 160, dir: d, pose: standPose({ swordOut: false }) }).canvas, i * 320, 30, 2)
  })
  // Face styles are data measured from a reference (SKILL.md "Matching a face style"). Three examples of how
  // different references translate: the same models, three styles, portrait scale.
  const STYLES = {
    'minimal (16-bit RPG)': { eye: { sclera: false, w: 0.028, h: 0.042, lid: 0, crease: 0 }, brow: null, socket: 0, nose: null,
      mouth: { line: 0.015, upper: 0, lower: 0, underShade: 0, w: 0.055, smile: 0 }, head: { browRidge: 0, nose: null, ears: 0.8 } },
    'painted (default)': {},
    'bold lines (comic)': { eye: { lid: 0.032, lower: 0.012, crease: 0, catchlight: 0.011, iris: 0.03 }, brow: { thick: 0.032, taper: 0.04, arch: 0.1 },
      socket: 0.05, nose: { bridge: 0, nostrils: 0.8, under: 0.3 }, mouth: { line: 0.013, upper: 0, lower: 0.03, underShade: 0.2 } }
  }
  label(g, 'Face styles are data: one model, three styles measured from different references (portraits, 4×)', 24, 372)
  let i = 0
  for (const [name, st] of Object.entries(STYLES)) {
    for (const sx of ['masc', 'fem']) {
      const hu = 110 / 7, sc = 4
      const r = renderHD(body(sx, st), { size: [96, 112], scale: sc, dir: 'south-east', view: 'side', pose: standPose({ swordOut: false }), shadow: false, ground: 44 + (110 - 0.5 * hu) * sc })
      blit(g, r.canvas, 16 + i * 210, 410, 2)
      i++
    }
    label(g, name, 30 + (i - 2) * 210, 640, 24, DIM)
  }
}

const sections = { chars, anims, world, ui, hd, anatomy }
try {
  await Promise.all([['400', 'pixelify-sans-latin-400-normal'], ['700', 'pixelify-sans-latin-700-normal']].map(async ([w, f]) => {
    const face = new FontFace('Pixelify Sans', `url(./fonts/${f}.woff2)`, { weight: w })
    document.fonts.add(await face.load())
  }))
} catch {}
const t0 = performance.now()
for (const [k, fn] of Object.entries(sections)) if (!only || only === k) fn()
console.log('render ms', Math.round(performance.now() - t0))
document.title = 'ready'
