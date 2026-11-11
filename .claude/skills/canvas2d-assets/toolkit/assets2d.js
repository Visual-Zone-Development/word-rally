// Example 2D assets for the gallery (canvas2d-assets skill), one per common case. Each draws itself
// around (0, 0) = its anchor, at play size, for any phase of an animation, with no stored state, so
// the gallery (and the game) can draw any frame. Replace these with the game's own assets.
import { TAU, keys, squash, createStyle, shape, blobPath, roundPoly, pixels, pixelOutline, tint } from './sprite.js'

// One style object for the whole game: outlines, shading and light match across assets.
const STYLE = createStyle({ outline: '#1a1420', outlineWidth: 2.5, shading: 'cel', light: [-0.6, -1] })
const TEAM = { red: '#d8433b', blue: '#3a7ae0' }

/** Side-view platformer hero, vector shapes, cel-shaded with outlines: idle, run, jump, attack. */
const hero = {
  size: [36, 52],
  anchor: 'feet',
  anims: { idle: 1.6, run: 0.5, jump: 0.9, attack: 0.6 },
  hitbox: [-13, -48, 26, 48],
  draw(ctx, { anim, phase, facing = 1, team = 'red' }) {
    const p = phase * TAU
    let bob = 0
    let sq = 0
    let lean = 0
    let lift = 0
    let legA = 0
    let arm = -0.2
    if (anim === 'idle') {
      bob = Math.sin(p) * 1.2
      sq = Math.sin(p) * 0.03
    } else if (anim === 'run') {
      bob = -Math.abs(Math.sin(p)) * 4 // up on each passing step, down on contact
      sq = Math.cos(2 * p) * 0.05
      lean = 0.15
      legA = Math.sin(p) * 0.9
      arm = -Math.sin(p) * 0.9
    } else if (anim === 'jump') {
      // anticipation crouch → stretch on take-off → arc → squash on landing → recover
      sq = keys(phase, [[0, 0], [0.12, 0.28, 'out'], [0.22, -0.28, 'out'], [0.5, 0, 'inOut'], [0.78, -0.12], [0.86, 0.32, 'out'], [1, 0, 'inOut']])
      lift = phase > 0.15 && phase < 0.85 ? Math.sin(((phase - 0.15) / 0.7) * Math.PI) * 46 : 0
      legA = phase > 0.2 && phase < 0.8 ? 0.5 : 0
      arm = keys(phase, [[0, -0.2], [0.12, 0.6], [0.25, -2.4, 'out'], [0.8, -1.2], [1, -0.2]])
    } else if (anim === 'attack') {
      lean = keys(phase, [[0, 0], [0.4, -0.18, 'inOut'], [0.52, 0.28, 'out'], [1, 0, 'inOut']])
      arm = keys(phase, [[0, -0.2], [0.4, -2.6, 'inOut'], [0.52, 1.2, 'out'], [0.7, 0.9], [1, -0.2, 'inOut']])
      sq = keys(phase, [[0, 0], [0.4, 0.08], [0.52, -0.1, 'out'], [1, 0]])
    }
    const { sx, sy } = squash(sq)
    ctx.save()
    ctx.scale(facing < 0 ? -1 : 1, 1)
    ctx.translate(0, -lift)
    // shadow stays on the ground and shrinks with height
    ctx.save()
    ctx.translate(0, lift)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.beginPath()
    ctx.ellipse(0, 0, 14 * (1 - lift / 120), 3.5, 0, 0, TAU)
    ctx.fill()
    ctx.restore()
    ctx.scale(sx, sy)
    ctx.rotate(lean)
    // legs from the hips, swinging opposite each other
    for (const [s, a] of [[-1, -legA], [1, legA]]) {
      ctx.save()
      ctx.translate(s * 5, -18 + bob)
      ctx.rotate(a)
      shape(ctx, STYLE, roundPoly([[-4, 0], [4, 0], [4, 16], [-5, 18]], 3), '#3a3a52', { x: -5, y: 0, w: 10, h: 18 })
      ctx.restore()
    }
    // body
    shape(ctx, STYLE, blobPath(0, -28 + bob, 13, 14), '#4f86d8', { x: -13, y: -42 + bob, w: 26, h: 28 })
    // scarf in team colour, trailing behind by more when moving fast (secondary motion from phase)
    const trail = anim === 'run' ? 8 + Math.sin(p * 2) * 3 : anim === 'jump' ? 6 : 2 + Math.sin(p) * 1.5
    shape(ctx, STYLE, roundPoly([[-6, -40 + bob], [8, -40 + bob], [4, -36 + bob], [-10 - trail, -34 + bob + trail * 0.3], [-12 - trail, -38 + bob]], 2), TEAM[team] ?? TEAM.red, { x: -14 - trail, y: -42, w: 22 + trail, h: 8 })
    // head with eyes that look where it's going
    shape(ctx, STYLE, blobPath(2, -50 + bob, 11, 10), '#f2c49a', { x: -9, y: -60 + bob, w: 22, h: 20 })
    ctx.fillStyle = '#1a1420'
    for (const ex of [4, 9]) ctx.fillRect(ex, -53 + bob, 2.5, 5)
    // sword arm: rotates from the shoulder, sword follows through on the attack
    ctx.save()
    ctx.translate(4, -34 + bob)
    ctx.rotate(arm)
    shape(ctx, STYLE, roundPoly([[-3, 0], [3, 0], [3, 12], [-3, 12]], 3), '#4f86d8', { x: -3, y: 0, w: 6, h: 12 })
    shape(ctx, STYLE, roundPoly([[-1.8, 12], [1.8, 12], [1.6, 30], [0, 34], [-1.6, 30]], 1), '#d8dde6', { x: -2, y: 12, w: 4, h: 22 })
    shape(ctx, STYLE, roundPoly([[-5, 11], [5, 11], [5, 14], [-5, 14]], 1), '#e8b830', { x: -5, y: 11, w: 10, h: 3 })
    ctx.restore()
    ctx.restore()
  }
}

/** Pixel-art slime: drawn at native resolution, a few frames, a 1-px outline, whole-number scaling only. */
const slimeFrames = {}
function slimeFrame(i, hop) {
  const key = `${hop}:${i}`
  if (slimeFrames[key]) return slimeFrames[key]
  const sq = hop ? [0.3, -0.3, -0.1, 0.25][i] : [0, 0.12, 0.2, 0.12][i]
  const w = Math.round(7 * (1 + sq * 0.6))
  const h = Math.round(5 * (1 - sq * 0.6))
  const art = pixels(18, 14, (px) => {
    const cx = 9
    const by = 13
    px.ellipse(cx, by - h, w, h, '#4caf50')
    px.ellipse(cx - 1, by - h - 1, w - 2, h - 2, '#6fd36a')
    px.rect(cx - Math.round(w / 2), by - h - Math.round(h * 0.6), 2, 1, '#c8f5b0') // highlight
    px.rect(cx - 2, by - h, 1, 2, '#1a1420') // eyes
    px.rect(cx + 2, by - h, 1, 2, '#1a1420')
  })
  return (slimeFrames[key] = pixelOutline(art, '#1a1420'))
}
const slime = {
  size: [20, 16],
  anchor: 'feet',
  pixel: true,
  anims: { idle: 1.0, hop: 0.6 },
  hitbox: [-8, -11, 16, 11],
  draw(ctx, { anim, phase, facing = 1 }) {
    const hop = anim === 'hop'
    const i = Math.floor(phase * 4) % 4 // 4 frames per cycle: pixel art reads best with few, held frames
    const lift = hop ? Math.round(Math.max(0, Math.sin(phase * TAU)) * 8) : 0
    const img = slimeFrame(i, hop)
    ctx.save()
    if (facing < 0) ctx.scale(-1, 1)
    ctx.drawImage(img, -Math.round(img.width / 2), -img.height - lift)
    ctx.restore()
  }
}

/** Top-down tank: rotates freely (facing in radians), treads roll when moving, the turret recoils on fire. */
const tank = {
  size: [48, 48],
  anchor: 'center',
  anims: { idle: 1, move: 0.4, fire: 0.5 },
  hitbox: [-18, -18, 36, 36],
  draw(ctx, { anim, phase, facing = 0, team = 'blue' }) {
    const flat = createStyle({ ...STYLE, shading: 'soft' })
    const col = TEAM[team] ?? TEAM.blue
    const moving = anim === 'move'
    const recoil = anim === 'fire' ? keys(phase, [[0, 0], [0.08, 6, 'out'], [1, 0, 'inOut']]) : 0
    ctx.save()
    ctx.rotate(facing)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(-20, -14, 42, 32)
    // treads with moving cleats
    for (const y of [-18, 12]) {
      shape(ctx, flat, roundPoly([[-21, y], [21, y], [21, y + 7], [-21, y + 7]], 3), '#3a3a3a', { x: -21, y, w: 42, h: 7 })
      ctx.fillStyle = '#5a5a5a'
      const off = moving ? (phase * 8) % 8 : 0
      for (let x = -20 + off; x < 20; x += 8) ctx.fillRect(x, y + 1, 3, 5)
    }
    shape(ctx, flat, roundPoly([[-18, -12], [18, -12], [20, 0], [18, 12], [-18, 12]], 4), col, { x: -18, y: -12, w: 38, h: 24 })
    // turret and barrel (the barrel slides back on fire, then eases out)
    ctx.translate(-recoil, 0)
    shape(ctx, flat, roundPoly([[4, -3], [28, -3], [28, 3], [4, 3]], 1.5), '#2a2a32', { x: 4, y: -3, w: 24, h: 6 })
    shape(ctx, flat, blobPath(0, 0, 9, 9), tint(col, -0.15), { x: -9, y: -9, w: 18, h: 18 })
    if (anim === 'fire' && phase < 0.12) {
      ctx.fillStyle = '#ffe070'
      ctx.beginPath()
      ctx.moveTo(29, -6)
      ctx.lineTo(42, 0)
      ctx.lineTo(29, 6)
      ctx.fill()
    }
    ctx.restore()
  }
}

/** Pickup coin: a spin made from horizontal squash (no 3D needed) and a sparkle on the bright side. */
const coin = {
  size: [20, 20],
  anchor: 'center',
  anims: { spin: 1.0 },
  hitbox: [-9, -9, 18, 18],
  draw(ctx, { phase }) {
    const c = Math.cos(phase * TAU)
    const w = Math.max(0.12, Math.abs(c))
    ctx.save()
    ctx.translate(0, Math.sin(phase * TAU) * 1.5)
    ctx.scale(w, 1)
    shape(ctx, STYLE, blobPath(0, 0, 9, 9), c > 0 ? '#f2c230' : '#d89a20', { x: -9, y: -9, w: 18, h: 18 })
    if (w > 0.4) {
      ctx.strokeStyle = 'rgba(120,70,10,0.8)'
      ctx.lineWidth = 2
      ctx.strokeRect(-2, -5, 4, 10)
    }
    ctx.restore()
    const sp = keys(phase, [[0, 0], [0.15, 1, 'out'], [0.35, 0]])
    if (sp > 0) {
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      for (let i = 0; i < 8; i++) {
        const r = i % 2 ? 1.2 : 5 * sp
        const a = (i / 8) * TAU
        ctx.lineTo(-4 + Math.cos(a) * r, -5 + Math.sin(a) * r)
      }
      ctx.fill()
    }
  }
}

/** UI card (card, puzzle and board games): flips over with a squash, lifts with a shadow on hover. */
const card = {
  size: [90, 126],
  anchor: 'center',
  anims: { flip: 1.2, hover: 1.5 },
  draw(ctx, { anim, phase }) {
    const ui = createStyle({ ...STYLE, shading: 'flat', outlineWidth: 3 })
    let sx = 1
    let lift = 0
    let faceUp = true
    if (anim === 'flip') {
      // ease the half-turn; swap faces at the edge-on moment, overshoot a touch at the end
      const a = keys(phase, [[0, 0], [0.7, 1, 'inOut'], [0.85, 1.04, 'out'], [1, 1, 'inOut']])
      sx = Math.cos(a * Math.PI)
      faceUp = sx < 0
      lift = Math.sin(Math.min(1, a) * Math.PI) * 10
    } else lift = 6 + Math.sin(phase * TAU) * 2
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.beginPath()
    ctx.ellipse(0, 62, 40 * Math.abs(sx), 6, 0, 0, TAU)
    ctx.fill()
    ctx.save()
    ctx.translate(0, -lift)
    ctx.scale(Math.abs(sx), 1)
    shape(ctx, ui, roundPoly([[-45, -63], [45, -63], [45, 63], [-45, 63]], 9), faceUp ? '#f4ead5' : '#7a3a8a', null)
    if (faceUp) {
      ctx.fillStyle = '#c4201a'
      ctx.font = '700 30px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('7', 0, 12)
      ctx.fillText('♦', -28, -36)
    } else {
      ctx.strokeStyle = '#e8c860'
      ctx.lineWidth = 2
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath()
        ctx.moveTo(-36, i * 16)
        ctx.lineTo(36, i * 16 + 20)
        ctx.stroke()
      }
    }
    ctx.restore()
  }
}

export const ASSETS = { hero, slime, tank, coin, card }
