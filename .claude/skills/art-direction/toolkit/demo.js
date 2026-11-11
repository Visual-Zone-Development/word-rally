// Demo for the art-direction skill: one screen in the "storybook paper & ink" look (painted wash, stamped
// pattern, brush-stroke header, torn paper card, ink-blot prompts, serif + small caps type, grain overlay).
// Everything static is baked once; the frame only blits and draws text.
import { wash, stamp, fret, vignette, paperCard, brush, inkBlot, grainTile, surface, mix } from './texture.js'

const W = 1280, H = 800
const scale = Number(new URLSearchParams(location.search).get('scale')) || 1
const canvas = document.getElementById('c')
canvas.width = W * scale
canvas.height = H * scale
const ctx = canvas.getContext('2d')
ctx.scale(scale, scale)

const PAL = { ink: '#1b1712', paper: '#efe3c6', accent: '#b8262b', teal: ['#1d4e48', '#2f7468', '#4f9a82', '#7fbf9f'], ochre: '#c98a3c' }
const SERIF = '"EB Garamond", Georgia, serif'

async function fonts() {
  const faces = [['400', 'normal', 'eb-garamond-latin-400-normal'], ['600', 'normal', 'eb-garamond-latin-600-normal'], ['400', 'italic', 'eb-garamond-latin-400-italic']]
  await Promise.all(faces.map(async ([weight, style, file]) => {
    const f = new FontFace('EB Garamond', `url(./fonts/${file}.woff2)`, { weight, style })
    document.fonts.add(await f.load())
  }))
}

// ---- baked layers ----
function background() {
  const s = surface(W, H, scale)
  s.ctx.drawImage(wash(W, H, { colors: PAL.teal, seed: 4 }).canvas, 0, 0, W, H)
  stamp(s.ctx, W, H, fret, { cell: 300, color: PAL.ochre, alpha: 0.3, fade: 0.9, seed: 2 })
  vignette(s.ctx, W, H, { strength: 0.4, color: '#06110f' })
  return s
}

function header() {
  const s = surface(560, 70, scale)
  brush(s.ctx, [[10, 38], [200, 33], [520, 40]], { width: 34, color: PAL.ink, seed: 9 })
  return s
}

const card = { x: 730, y: 120, w: 500, h: 560 }
function cardLayer() {
  return paperCard(card.w, card.h, { color: PAL.paper, seed: 5 })
}

function hero() {
  // A stand-in character so the composition can be judged; a real game draws its own (or a 3D model).
  const s = surface(420, 560, scale)
  const c = s.ctx
  c.translate(210, 0)
  const skin = '#f3d9c4', white = '#f4f1ea', grey = '#3a3a40', red = PAL.accent
  c.lineJoin = 'round'
  c.lineWidth = 3
  c.strokeStyle = '#2a1d1a'
  const shape = (fill, path) => { c.fillStyle = fill; c.fill(path); c.stroke(path) }
  const P = (fn) => { const p = new Path2D(); fn(p); return p }
  // legs, boots
  shape(grey, P((p) => { p.rect(-48, 330, 40, 150); p.rect(8, 330, 40, 150) }))
  shape('#4a3a33', P((p) => { p.roundRect(-56, 460, 52, 46, 8); p.roundRect(4, 460, 52, 46, 8) }))
  // cape back
  shape(red, P((p) => { p.moveTo(-70, 200); p.quadraticCurveTo(-150, 320, -120, 390); p.lineTo(120, 390); p.quadraticCurveTo(150, 320, 70, 200); p.closePath() }))
  // tunic
  shape(white, P((p) => { p.moveTo(-62, 205); p.lineTo(-80, 380); p.lineTo(80, 380); p.lineTo(62, 205); p.closePath() }))
  shape(red, P((p) => p.rect(-70, 290, 140, 26)))
  shape(red, P((p) => { p.moveTo(-10, 312); p.lineTo(-30, 400); p.lineTo(-8, 396); p.lineTo(4, 314); p.closePath() }))
  // arms
  shape(white, P((p) => { p.moveTo(-62, 210); p.lineTo(-102, 330); p.lineTo(-76, 338); p.lineTo(-52, 250); p.closePath() }))
  shape(white, P((p) => { p.moveTo(62, 210); p.lineTo(102, 330); p.lineTo(76, 338); p.lineTo(52, 250); p.closePath() }))
  shape(grey, P((p) => { p.rect(-104, 300, 30, 32); p.rect(74, 300, 30, 32) }))
  // cape front panels
  shape(red, P((p) => { p.moveTo(-70, 190); p.lineTo(-130, 330); p.lineTo(-92, 340); p.lineTo(-30, 215); p.closePath() }))
  shape(red, P((p) => { p.moveTo(70, 190); p.lineTo(130, 330); p.lineTo(92, 340); p.lineTo(30, 215); p.closePath() }))
  shape('#4b4b52', P((p) => p.arc(0, 212, 12, 0, Math.PI * 2)))
  // head and hair
  shape(skin, P((p) => p.ellipse(0, 120, 78, 84, 0, 0, Math.PI * 2)))
  shape('#e8e6ea', P((p) => {
    p.moveTo(-86, 130); p.lineTo(-96, 60); p.lineTo(-60, 20); p.lineTo(-30, 30); p.lineTo(0, 8); p.lineTo(30, 26)
    p.lineTo(70, 18); p.lineTo(98, 70); p.lineTo(86, 140); p.lineTo(64, 90); p.lineTo(40, 110); p.lineTo(28, 72)
    p.lineTo(4, 100); p.lineTo(-18, 70); p.lineTo(-40, 104); p.lineTo(-62, 84); p.closePath()
  }))
  c.fillStyle = '#2a2430'
  c.beginPath(); c.ellipse(-28, 136, 9, 13, 0, 0, Math.PI * 2); c.ellipse(28, 136, 9, 13, 0, 0, Math.PI * 2); c.fill()
  c.fillStyle = '#fff'
  c.beginPath(); c.arc(-25, 131, 3, 0, Math.PI * 2); c.arc(31, 131, 3, 0, Math.PI * 2); c.fill()
  // soft ground shadow
  c.fillStyle = 'rgba(6,17,15,0.35)'
  c.beginPath(); c.ellipse(0, 512, 120, 16, 0, 0, Math.PI * 2); c.fill()
  return s
}

const ROWS = [
  ['Body type', 'Type 1'], ['Skin', 'Natural', 'skin'], ['Hairstyle', 'Windswept'], ['Hair colour', 'Silver', 'hair'],
  ['Eyes', 'Red Mantle'], ['Eye colour', 'Natural', 'eyes']
]
const SWATCH = {
  skin: ['#f6e2d3', '#efd0b8', '#e2b591', '#c98f69', '#a86d4b', '#7d4f36', '#4f3426'],
  hair: ['#2a2224', '#5a3a2a', '#9a5a2e', '#c99a5a', '#e8e6ea', '#9aa0a8', '#3f6a3a', '#5a4a8a'],
  eyes: ['#3a2a22', '#6a4a2a', '#4a7a4a', '#3a6a9a', '#7a3a8a', '#b8262b']
}

let bg, head, cardS, heroS, grain
function draw(t) {
  ctx.drawImage(bg.canvas, 0, 0, W, H)
  // hero with a slow idle breathe
  const breathe = 1 + Math.sin(t * 1.6) * 0.008
  ctx.save()
  ctx.translate(330, 700)
  ctx.scale(1, breathe)
  ctx.drawImage(heroS.canvas, -210, -520, 420, 560)
  ctx.restore()

  head.draw(ctx, 0, 34)
  ctx.fillStyle = PAL.paper
  ctx.font = `600 30px ${SERIF}`
  ctx.fillText('Your Hero', 40, 78)
  ctx.font = `italic 400 24px ${SERIF}`
  ctx.globalAlpha = 0.7
  ctx.fillText('full body', 196, 78)
  ctx.globalAlpha = 1

  cardS.draw(ctx, card.x - 18, card.y - 18)
  const sel = Math.floor(t / 1.2) % ROWS.length
  let y = card.y + 56
  for (let i = 0; i < ROWS.length; i++) {
    const [label, value, sw] = ROWS[i]
    const on = i === sel
    ctx.font = `600 24px ${SERIF}`
    ctx.letterSpacing = '2px'
    ctx.fillStyle = on ? PAL.accent : mix(PAL.ink, PAL.paper, 0.35)
    ctx.fillText(label.toUpperCase(), card.x + 34, y)
    ctx.letterSpacing = '0px'
    if (on) { ctx.beginPath(); ctx.moveTo(card.x + 16, y - 12); ctx.lineTo(card.x + 24, y - 6); ctx.lineTo(card.x + 16, y); ctx.fill() }
    ctx.fillStyle = PAL.ink
    ctx.font = `400 28px ${SERIF}`
    ctx.textAlign = 'center'
    ctx.fillText(value, card.x + 370, y)
    ctx.fillText('‹', card.x + 275, y)
    ctx.fillText('›', card.x + 465, y)
    ctx.textAlign = 'left'
    y += 40
    if (sw) {
      SWATCH[sw].forEach((c, k) => {
        const x = card.x + 200 + k * 34
        ctx.beginPath(); ctx.arc(x, y - 8, 13, 0, Math.PI * 2)
        ctx.fillStyle = c; ctx.fill()
        ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(27,23,18,0.5)'; ctx.stroke()
        if (k === 4 && sw === 'hair') { ctx.lineWidth = 2.5; ctx.strokeStyle = PAL.ink; ctx.beginPath(); ctx.arc(x, y - 8, 17, 0, Math.PI * 2); ctx.stroke() }
      })
      y += 40
    }
  }
  // prompts on ink blots (a real game builds these from input.label())
  const prompt = (x, key, text, color) => {
    inkBlot(ctx, x + 70, card.y + card.h - 40, 88, 24, { color, seed: x })
    ctx.fillStyle = PAL.paper
    ctx.font = `600 24px ${SERIF}`
    ctx.fillText(`${key}  ${text}`, x + 20, card.y + card.h - 32)
  }
  prompt(card.x + 50, 'B', 'Undo', PAL.ink)
  prompt(card.x + 270, 'A', 'Accept', '#1f5a55')

  ctx.font = `italic 400 48px ${SERIF}`
  ctx.fillStyle = PAL.paper
  ctx.fillText('Make your hero', 380, 700)
  ctx.font = `600 24px ${SERIF}`
  ctx.letterSpacing = '2px'
  ctx.globalAlpha = 0.75
  ctx.fillText('EARLY DEVELOPMENT', W - 330, H - 34)
  ctx.letterSpacing = '0px'
  ctx.globalAlpha = 1

  // one grain over everything ties the layers into one surface
  ctx.save()
  ctx.globalCompositeOperation = 'overlay'
  ctx.globalAlpha = 0.18
  ctx.fillStyle = ctx.createPattern(grain.canvas, 'repeat')
  ctx.fillRect(0, 0, W, H)
  ctx.restore()
}

await fonts().catch(() => {})
bg = background(); head = header(); cardS = cardLayer(); heroS = hero(); grain = grainTile()
const t0 = performance.now()
const still = new URLSearchParams(location.search).has('t')
const loop = (now) => {
  draw(still ? Number(new URLSearchParams(location.search).get('t')) : (now - t0) / 1000)
  if (!still) requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
document.title = 'ready'
