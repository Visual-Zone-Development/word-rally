// Asset gallery (canvas2d-assets skill): draws a game's assets from assets2d.js in isolation, at
// several scales, as animation strips, in several facings or side by side, so changes can be compared
// with a reference and with before/after. Sets document.title = 'ready' for scripts/shot.mjs.
//
// An asset is { size: [w, h] (px at play size), anchor: 'feet' | 'center', anims: { name: seconds per cycle },
//   hitbox?: [x, y, w, h] (relative to the anchor, play-size px), pixel?: true (whole-number scales only),
//   draw(ctx, { anim, phase, t, facing, team, seed }) } and draws itself around (0, 0) = its anchor.
import { ASSETS } from './assets2d.js'

const P = new URLSearchParams(location.search)
const canvas = document.getElementById('c')
const ctx = canvas.getContext('2d')
const W = canvas.width
const H = canvas.height
const BG = { game: P.get('gameBg') ?? '#2a2f3a', light: '#e8e8e8', dark: '#101014', checker: null }

function background(x, y, w, h) {
  const bg = P.get('bg') ?? 'game'
  if (bg === 'checker') {
    for (let j = 0; j < h; j += 16) for (let i = 0; i < w; i += 16) {
      ctx.fillStyle = ((i + j) / 16) % 2 ? '#3a3a44' : '#4a4a56'
      ctx.fillRect(x + i, y + j, 16, 16)
    }
  } else {
    ctx.fillStyle = BG[bg] ?? bg
    ctx.fillRect(x, y, w, h)
  }
}

function label(text, x, y) {
  ctx.font = '600 14px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(x, y, ctx.measureText(text).width + 12, 22)
  ctx.fillStyle = '#fff'
  ctx.fillText(text, x + 6, y + 15)
}

/** Draw asset a in the cell (x, y, w, h) at scale s, anchored so it sits nicely in the cell. */
function cell(a, id, x, y, w, h, s, opts, text) {
  background(x, y, w, h)
  const sc = a.pixel ? Math.max(1, Math.round(s)) : s
  const cx = x + w / 2
  const cy = a.anchor === 'center' ? y + h / 2 + 10 : y + h / 2 + (a.size[1] * sc) / 2 + 10
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  // ground line for assets that stand on something
  if (a.anchor !== 'center') {
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.beginPath()
    ctx.moveTo(x, cy + 0.5)
    ctx.lineTo(x + w, cy + 0.5)
    ctx.stroke()
  }
  ctx.translate(cx, cy)
  ctx.scale(sc, sc)
  if (a.pixel) ctx.imageSmoothingEnabled = false
  a.draw(ctx, opts)
  if (P.has('hitbox') && a.hitbox) {
    const [hx, hy, hw, hh] = a.hitbox
    ctx.strokeStyle = '#ff2bd6'
    ctx.lineWidth = 1.5 / sc
    ctx.strokeRect(hx, hy, hw, hh)
  }
  ctx.restore()
  ctx.strokeStyle = '#000'
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
  label(text, x + 4, y + 4)
}

if (P.has('list')) {
  ctx.fillStyle = '#111'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#ddd'
  ctx.font = '16px monospace'
  Object.entries(ASSETS).forEach(([id, a], i) => ctx.fillText(`${id}  ${a.size.join('×')}  ${Object.keys(a.anims ?? {}).join(', ')}`, 24, 32 + i * 22))
} else {
  const ids = [P.get('asset') ?? Object.keys(ASSETS)[0], ...(P.get('compare') ? P.get('compare').split(',') : [])]
  for (const id of ids) if (!ASSETS[id]) throw new Error(`no asset ${id}; open gallery.html?list`)
  const frames = +(P.get('frames') ?? 0)
  const facings = +(P.get('facings') ?? 0)
  const scales = (P.get('scales') ?? P.get('scale') ?? '1,3').split(',').map(Number)
  const t = +(P.get('t') ?? 0.25)
  const team = P.get('team') ?? undefined
  const rows = ids.length
  const cols = frames || facings || scales.length
  const cw = Math.floor(W / cols)
  const ch = Math.floor(H / rows)
  ids.forEach((id, r) => {
    const a = ASSETS[id]
    // each row plays the requested animation if it has it, otherwise its own first one
    const anim = a.anims?.[P.get('anim')] ? P.get('anim') : Object.keys(a.anims ?? { idle: 1 })[0]
    const cycle = a.anims?.[anim] ?? 1
    for (let c = 0; c < cols; c++) {
      const phase = frames ? c / frames : (t / cycle) % 1
      const facing = facings ? (c / facings) * Math.PI * 2 : +(P.get('facing') ?? 1)
      const s = frames || facings ? scales.at(-1) : scales[c]
      const opts = { anim, phase, t: frames ? phase * cycle : t, facing, team, seed: 0.5 }
      const what = frames ? `${anim} ${c + 1}/${frames}` : facings ? `facing ${Math.round((facing * 180) / Math.PI)}°` : `${anim} ×${s}`
      cell(a, id, c * cw, r * ch, cw, ch, s, opts, `${id} · ${what}`)
    }
  })
}
document.title = 'ready'
