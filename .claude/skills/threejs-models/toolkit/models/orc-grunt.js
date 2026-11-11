// Asset: orc grunt (Warcraft III style). One file per asset: its sculpted shapes, painted textures
// and part list live here, so it can be edited without touching other units.
// Built with the model-asset + threejs-models skills; style rules in the game's STYLE.md. A worked example: copy it as a
// starting point for a new sculpted unit, rename the 'orc.*' parts to your asset's prefix.
import { loft, plate, hornGeo, shell, shellRim, furRoll, canvas, grad, blob, rnd, registerShapes, registerMaterials, texturedMaterial } from '../sculpt.js'

const PI = Math.PI

/** Orc skin over the torso: u around (front at 0.5), v up. Painted pecs, abs, ribs and shading. */
function orcTorsoTexture() {
  return canvas(256, 256, (g, W, H) => {
    // v=0 is the waist (bottom of the canvas after flipY)
    g.fillStyle = grad(g, 0, 0, W, 0, [[0, '#4e7a1a'], [0.3, '#78aa28'], [0.5, '#8cbc30'], [0.7, '#78aa28'], [1, '#4e7a1a']])
    g.fillRect(0, 0, W, H)
    const cx = W / 2
    // pecs
    for (const s of [-1, 1]) {
      blob(g, cx + s * 30, 70, 34, 26, '#a8d040', 0.9)
      g.strokeStyle = 'rgba(52,80,14,0.8)'
      g.lineWidth = 3
      g.beginPath()
      g.moveTo(cx, 60)
      g.quadraticCurveTo(cx + s * 30, 104, cx + s * 58, 74)
      g.stroke()
    }
    // abs: soft painted bulges with shadowed grooves between them
    for (let r = 0; r < 3; r++)
      for (const s of [-1, 1]) {
        blob(g, cx + s * 13, 128 + r * 28, 13, 12, '#a4cc3c', 0.95)
        blob(g, cx + s * 13, 140 + r * 28, 12, 4, '#4a6a12', 0.35)
      }
    g.strokeStyle = 'rgba(52,80,14,0.45)'
    g.lineWidth = 3
    g.beginPath()
    g.moveTo(cx, 96)
    g.lineTo(cx, 206)
    g.stroke()
    // ribs and lats on the flanks
    for (const s of [-1, 1])
      for (let i = 0; i < 3; i++) {
        g.beginPath()
        g.moveTo(cx + s * 52, 100 + i * 16)
        g.quadraticCurveTo(cx + s * 70, 104 + i * 16, cx + s * 80, 96 + i * 18)
        g.stroke()
      }
    // shoulder-blade and spine shading on the back
    for (const x of [0, W]) blob(g, x, 120, 60, 140, '#4a6a14', 0.6)
    g.strokeStyle = 'rgba(20,50,12,0.6)'
    g.beginPath()
    g.moveTo(1, 40)
    g.lineTo(1, 230)
    g.stroke()
    // battle scars
    g.strokeStyle = 'rgba(140,190,110,0.8)'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(cx + 26, 50)
    g.lineTo(cx + 44, 86)
    g.moveTo(cx - 40, 150)
    g.lineTo(cx - 24, 170)
    g.stroke()
    // crossed leather straps (an X over the chest) with iron studs
    g.save()
    g.lineCap = 'round'
    for (const s of [-1, 1]) {
      const path = () => {
        g.beginPath()
        g.moveTo(cx - s * 56, 14)
        g.quadraticCurveTo(cx - s * 6, 112, cx + s * 44, 236)
      }
      path()
      g.strokeStyle = '#3a2412'
      g.lineWidth = 20
      g.stroke()
      path()
      g.strokeStyle = '#8a5a2a'
      g.lineWidth = 15
      g.stroke()
      g.fillStyle = '#d0d4da'
      for (let i = 1; i < 9; i++) {
        const t = i / 9
        const x = (1 - t) * (1 - t) * (cx - s * 56) + 2 * (1 - t) * t * (cx - s * 6) + t * t * (cx + s * 44)
        const y = (1 - t) * (1 - t) * 14 + 2 * (1 - t) * t * 112 + t * t * 236
        if (Math.abs(x - cx) < 10) continue
        g.beginPath()
        g.arc(x, y, 2.4, 0, 7)
        g.fill()
      }
    }
    g.restore()
    // traps/neck darker at the top, belt shadow at the bottom
    g.fillStyle = grad(g, 0, 0, 0, 40, [[0, 'rgba(30,60,16,0.7)'], [1, 'rgba(30,60,16,0)']])
    g.fillRect(0, 0, W, 40)
    g.fillStyle = grad(g, 0, H - 30, 0, H, [[0, 'rgba(20,40,10,0)'], [1, 'rgba(20,40,10,0.7)']])
    g.fillRect(0, H - 30, W, 30)
  })
}

/** Orc face: eyes under the brow, flared nostrils, a grim mouth; skin shading around. */
function orcHeadTexture() {
  return canvas(256, 128, (g, W, H) => {
    g.fillStyle = grad(g, 0, 0, W, 0, [[0, '#4e7a1a'], [0.32, '#7aac2a'], [0.5, '#8cbc30'], [0.68, '#7aac2a'], [1, '#4e7a1a']])
    g.fillRect(0, 0, W, H)
    const cx = W / 2
    // canvas y=0 is the top of the head
    // deep eye sockets and glowing eyes
    for (const s of [-1, 1]) {
      blob(g, cx + s * 16, 52, 14, 9, '#3a5210', 0.9)
      g.fillStyle = '#ffd23a'
      g.beginPath()
      g.ellipse(cx + s * 15, 53, 6, 3.4, s * -0.25, 0, 7)
      g.fill()
      g.fillStyle = '#c8320a'
      g.beginPath()
      g.arc(cx + s * 15, 53.5, 2.2, 0, 7)
      g.fill()
      // war paint stripe under each eye
      g.fillStyle = 'rgba(30,30,30,0.75)'
      g.fillRect(cx + s * 22 - 3, 60, 6, 16)
    }
    // nose
    blob(g, cx, 70, 9, 7, '#6a9a22', 1)
    g.fillStyle = '#1e3a10'
    for (const s of [-1, 1]) {
      g.beginPath()
      g.arc(cx + s * 4, 74, 2.2, 0, 7)
      g.fill()
    }
    // mouth: a hard line with an underbite curve
    g.strokeStyle = '#1a300c'
    g.lineWidth = 3
    g.beginPath()
    g.moveTo(cx - 18, 92)
    g.quadraticCurveTo(cx, 86, cx + 18, 92)
    g.stroke()
    // cheekbone highlights
    for (const s of [-1, 1]) blob(g, cx + s * 26, 70, 10, 8, '#a8d040', 0.6)
  })
}

registerMaterials({
  'orc.skin': () => texturedMaterial(orcTorsoTexture(), { rough: 0.62 }),
  'orc.face': () => texturedMaterial(orcHeadTexture(), { rough: 0.62 })
})

registerShapes({
  // torso from the waist (y=0) to the base of the neck: narrow waist, huge chest and lats, traps
  'orc.torso': () =>
    loft(
      [
        [0.0, 0.25, 0.19, 0.0],
        [0.1, 0.27, 0.21, 0.01],
        [0.24, 0.33, 0.25, 0.03],
        [0.38, 0.43, 0.3, 0.05, 0, 0.2],
        [0.5, 0.48, 0.31, 0.04, 0, 0.25],
        [0.6, 0.42, 0.27, 0.0, 0, 0.2],
        [0.67, 0.28, 0.2, -0.02],
        [0.71, 0.15, 0.13, 0.0]
      ],
      18
    ),
  // head, chin to crown, with a jutting underbite jaw and a heavy, low skull
  'orc.head': () =>
    loft(
      [
        [0.0, 0.1, 0.08, 0.09],
        [0.04, 0.16, 0.13, 0.08, 0, 0.35],
        [0.1, 0.17, 0.14, 0.06, 0, 0.3],
        [0.16, 0.155, 0.15, 0.03],
        [0.22, 0.16, 0.16, 0.01],
        [0.27, 0.14, 0.14, -0.01],
        [0.31, 0.09, 0.1, -0.02],
        [0.33, 0.03, 0.04, -0.02]
      ],
      16
    ),
  'orc.brow': () => loft([[0, 0.15, 0.05, 0, 0, 0.3], [0.03, 0.165, 0.06, 0, 0, 0.3], [0.055, 0.14, 0.04]], 12),
  'orc.pelvis': () => loft([[-0.16, 0.24, 0.18], [-0.04, 0.29, 0.21], [0.06, 0.28, 0.2], [0.14, 0.25, 0.19]], 14),
  'orc.belt': () => loft([[0, 0.3, 0.225], [0.09, 0.3, 0.225]], 16),
  'orc.thigh': () => loft([[-0.42, 0.12, 0.125, 0.0], [-0.3, 0.155, 0.16, 0.01], [-0.15, 0.175, 0.175, 0.015], [0.0, 0.165, 0.165, 0]], 12),
  'orc.calf': () => loft([[-0.38, 0.1, 0.105], [-0.26, 0.125, 0.14, -0.02], [-0.12, 0.135, 0.145, -0.025], [0.0, 0.12, 0.12]], 12),
  'orc.foot': () => loft([[0, 0.14, 0.23, 0.07, 0, 0.3], [0.07, 0.14, 0.22, 0.06, 0, 0.3], [0.13, 0.1, 0.13, 0.0]], 12),
  'orc.upperarm': () => loft([[-0.4, 0.12, 0.12], [-0.3, 0.155, 0.165, 0.02], [-0.16, 0.17, 0.18, 0.03], [-0.04, 0.165, 0.165], [0.04, 0.12, 0.12]], 12),
  'orc.forearm': () => loft([[-0.36, 0.1, 0.1], [-0.22, 0.13, 0.135, 0.015], [-0.08, 0.15, 0.15, 0.015], [0.03, 0.13, 0.13]], 12),
  'orc.bracer': () => loft([[-0.33, 0.12, 0.12], [-0.31, 0.135, 0.135], [-0.2, 0.15, 0.155], [-0.09, 0.165, 0.17], [-0.07, 0.15, 0.155]], 12),
  'orc.fist': () => loft([[-0.17, 0.09, 0.1, 0.02, 0, 0.55], [-0.09, 0.125, 0.14, 0.03, 0, 0.55], [0.0, 0.11, 0.11, 0.0, 0, 0.4]], 10),
  'orc.pauldron': () => {
    // a domed shoulder guard with a flared lip
    const g = loft([[-0.12, 0.27, 0.26], [-0.08, 0.29, 0.28], [-0.05, 0.25, 0.24], [0.04, 0.22, 0.21], [0.11, 0.15, 0.14], [0.15, 0.04, 0.04]], 16)
    return g
  },
  'orc.spike': () => hornGeo(0.24, 0.045, 0.6, 6),
  'orc.tusk': () => hornGeo(0.12, 0.022, 1.4, 5),
  'orc.ear': () => {
    const g = plate([[0, 0], [0.12, 0.03], [0.02, 0.07]], 0.015, 0.006)
    return g
  },
  'orc.topknot': () => loft([[0, 0.04, 0.04], [0.05, 0.06, 0.06], [0.1, 0.05, 0.05], [0.2, 0.03, 0.03], [0.32, 0.01, 0.01]], 8),
  'orc.hair': () => loft([[0, 0.14, 0.15], [0.03, 0.15, 0.155], [0.07, 0.12, 0.13], [0.1, 0.05, 0.06]], 12),
  'orc.strap': () => loft([[-0.5, 0.05, 0.012], [0.5, 0.05, 0.012]], 6),
  // loincloth flap: a tapered cloth with a ragged hem, hanging from the belt
  'orc.flap': () => plate([[-0.13, 0], [0.13, 0], [0.11, -0.3], [0.06, -0.36], [0.02, -0.31], [-0.03, -0.37], [-0.08, -0.31], [-0.12, -0.34]], 0.02, 0.008),
  'orc.buckle': () => loft([[0, 0.08, 0.025], [0.02, 0.085, 0.03], [0.04, 0.06, 0.02]], 12),
  'orc.kneepad': () => loft([[-0.06, 0.1, 0.06], [0.0, 0.11, 0.075, 0.02], [0.07, 0.08, 0.05, 0.01]], 10),
  'orc.wrap': () => loft([[0, 0.13, 0.135], [0.07, 0.15, 0.155], [0.15, 0.13, 0.135]], 12),
  // the grunt's axe: a crescent blade with a back spike, on a wrapped haft
  'orc.axeHead': () =>
    plate(
      [
        [0.0, -0.1],
        [0.08, -0.08],
        [0.2, -0.22],
        [0.34, -0.26],
        [0.3, -0.1],
        [0.33, 0.06],
        [0.3, 0.22],
        [0.34, 0.36],
        [0.2, 0.32],
        [0.08, 0.18],
        [0.0, 0.18],
        [-0.04, 0.1],
        [-0.18, 0.06],
        [-0.04, 0.0]
      ],
      0.035,
      0.012
    ),
  'orc.plate': () => shell(0.56, 0.62, 0.15),
  'orc.plateRim': () => shellRim(0.56, 0.62, 0.036),
  'orc.noseGuard': () => plate([[-0.03, 0.08], [0.03, 0.08], [0.035, -0.06], [0, -0.1], [-0.035, -0.06]], 0.02, 0.008),
  'orc.fur': () => furRoll(0.5, 0.2),
  'orc.strip': () => plate([[-0.045, 0], [0.045, 0], [0.05, -0.26], [0.02, -0.3], [-0.01, -0.27], [-0.05, -0.31]], 0.015, 0.006),
  'orc.emblem': () => plate([[-0.1, 0.08], [0.1, 0.08], [0.1, -0.02], [0, -0.13], [-0.1, -0.02]], 0.025, 0.008),
  'orc.bracerPlate': () => plate([[-0.1, -0.2], [0.1, -0.2], [0.12, 0.17], [0, 0.22], [-0.12, 0.17]], 0.03, 0.01),
  'orc.toe': () => plate([[-0.07, 0], [0.07, 0], [0.06, 0.1], [0, 0.13], [-0.06, 0.1]], 0.02, 0.008),
  'orc.horn': () => hornGeo(0.5, 0.06, 1.5, 7),
  'orc.haft': () => loft([[-0.3, 0.032, 0.032], [0.9, 0.028, 0.028], [0.96, 0.04, 0.04]], 8),
  'orc.grip': () => loft([[-0.1, 0.04, 0.04], [0.2, 0.04, 0.04]], 8)
})

/**
 * The orc grunt, modelled after Warcraft III's: a hunched slab of green muscle with a small low head,
 * an underbite and tusks, huge spiked pauldrons, bracers, a team-coloured loincloth and a crescent axe.
 */
export function orcGrunt() {
  const W = '#ffffff'
  const S = (bone, shape, mat, pos = [0, 0, 0], rot = [0, 0, 0], size = [1, 1, 1], color = W) => ({ bone, shape, mat, pos, rot, size, color })
  const SKIN = '#8cbc30'
  const FIST = '#94c234'
  const BONE = '#f0e6cc'
  const parts = [
    // torso, fur collar, the iron ring where the straps cross
    S('chest', 'orc.torso', 'orc.skin'),
    S('chest', 'orc.fur', 'common.fur', [0, 0.64, -0.02], [0.2, 0, 0], [0.56, 0.5, 0.46]),
    S('chest', 'orc.fur', 'common.metal', [0, 0.33, 0.3], [PI / 2 - 0.3, 0, 0], [0.09, 0.1, 0.09]),
    // hips: belt, buckle, team emblem, a skirt of tan leather strips front and back
    S('body', 'orc.pelvis', 'common.darkleather'),
    S('body', 'orc.belt', 'common.leather', [0, 0.02, 0], [0, 0, 0], [1.04, 1.3, 1.04]),
    S('body', 'orc.emblem', 'common.metal', [0, 0.02, 0.245], [0.1, 0, 0], [1.22, 1.18, 1]),
    { ...S('body', 'orc.emblem', 'cloth', [0, 0.02, 0.262], [0.1, 0, 0]), color: 'team' },
    ...[-0.2, -0.1, 0, 0.1, 0.2].flatMap((x, i) => [
      S('skirtF', 'orc.strip', 'common.strip', [x * 1.1, -0.04, 0.23 - Math.abs(x) * 0.3], [0.2, x * 1.2, (i - 2) * 0.05], [1.5, 1.35 + (i % 2) * 0.2, 1]),
      S('skirtB', 'orc.strip', 'common.strip', [x * 1.1, -0.04, -0.22 + Math.abs(x) * 0.3], [-0.2, PI - x * 1.2, (i - 2) * 0.05], [1.5, 1.4 - (i % 2) * 0.15, 1])
    ]),
    ...[1, -1].map((sx) => S('body', 'orc.strip', 'common.strip', [sx * 0.28, -0.06, 0], [0, sx * PI / 2, sx * 0.25], [1.1, 0.9, 1])),
    // head: helmet with a red face plate and great curved horns, goatee, tusks
    S('head', 'orc.head', 'orc.face'),
    S('head', 'orc.brow', 'skin', [0, 0.195, 0.115], [0.2, 0, 0], [1, 1, 1], '#6a9a22'),
    S('head', 'egg', 'common.metal', [0, 0.25, -0.01], [0, 0, 0], [0.36, 0.24, 0.37]),
    S('head', 'orc.plateRim', 'common.steel', [0, 0.235, -0.01], [0, 0, 0], [0.62, 1, 0.58]),
    S('head', 'orc.noseGuard', 'common.metal', [0, 0.2, 0.175], [-0.15, 0, 0], [1.1, 1.1, 1]),
    S('head', 'orc.horn', 'skin', [0.16, 0.27, 0.02], [0.25, -0.2, -1.15], [1.15, 1.15, 1.15], BONE),
    S('head', 'orc.horn', 'skin', [-0.16, 0.27, 0.02], [0.25, 0.2, 1.15], [1.15, 1.15, 1.15], BONE),
    S('head', 'cone', 'common.hair', [0, -0.02, 0.15], [PI + 0.35, 0, 0], [0.11, 0.17, 0.08]),
    S('head', 'orc.tusk', 'skin', [0.085, 0.045, 0.15], [0.55, 0, -0.45], [1, 0.95, 1], BONE),
    S('head', 'orc.tusk', 'skin', [-0.085, 0.045, 0.15], [0.55, 0, 0.45], [1, 0.95, 1], BONE),
    S('head', 'orc.ear', 'skin', [0.15, 0.15, -0.02], [0, -1.9, 0.2], [1, 1, 1], SKIN),
    S('head', 'orc.ear', 'skin', [-0.15, 0.15, -0.02], [0, 1.9 + PI, -0.2], [-1, 1, 1], SKIN),
    // pauldrons: two stacked red plates per shoulder with rolled steel rims
    ...[1, -1].flatMap((s) => [
      { ...S('chest', 'orc.plate', 'common.plate', [s * 0.5, 0.6, -0.02], [0, 0, -s * 0.62], [0.88, 1, 0.9]), color: 'team' },
      S('chest', 'orc.plateRim', 'common.steel', [s * 0.5, 0.6, -0.02], [0, 0, -s * 0.62], [0.88, 1, 0.9]),
      { ...S('chest', 'orc.plate', 'common.plate', [s * 0.64, 0.45, -0.02], [0, 0, -s * 1.1], [0.76, 0.85, 0.82]), color: 'team' },
      S('chest', 'orc.plateRim', 'common.steel', [s * 0.64, 0.45, -0.02], [0, 0, -s * 1.1], [0.76, 0.85, 0.82])
    ]),
    // arms: long, hanging to the knees, with big fists
    ...['L', 'R'].flatMap((s) => [
      S('arm' + s, 'orc.upperarm', 'skin', [0, 0, 0], [0, 0, 0], [1, 1.02, 1], SKIN),
      S('fore' + s, 'egg', 'skin', [0, 0, 0], [0, 0, 0], [0.27, 0.27, 0.27], SKIN),
      S('fore' + s, 'orc.forearm', 'skin', [0, 0, 0], [0, 0, 0], [1, 1.16, 1], SKIN),
      S('fore' + s, 'orc.fur', 'common.fur', [0, -0.08, 0], [0, 0, 0], [0.3, 0.32, 0.3]),
      S('fore' + s, 'orc.bracer', 'common.darkleather', [0, -0.12, 0], [0, 0, 0], [0.95, 1, 0.95]),
      S('hand' + s, 'orc.fist', 'skin', [0, 0.02, 0], [0, 0, 0], [1.15, 1.15, 1.15], FIST)
    ]),
    // the left forearm carries a red bracer-shield
    S('foreL', 'orc.bracerPlate', 'common.metal', [0.12, -0.26, 0.08], [0, 0.75, 0], [1.12, 1.08, 1]),
    { ...S('foreL', 'orc.bracerPlate', 'cloth', [0.132, -0.26, 0.093], [0, 0.75, 0]), color: 'team' },
    // legs: bare green thighs, grey fur rolls at the knee, chunky boots with red toe plates
    ...['L', 'R'].flatMap((s) => [
      S('leg' + s, 'orc.thigh', 'skin', [0, 0, 0], [0, 0, 0], [1.1, 1.15, 1.1], SKIN),
      S('shin' + s, 'orc.fur', 'common.fur', [0, -0.09, 0], [0, 0, 0], [0.3, 0.36, 0.3]),
      S('shin' + s, 'orc.calf', 'common.leather', [0, 0, 0], [0, 0, 0], [1.12, 1.26, 1.12]),
      S('shin' + s, 'orc.wrap', 'common.darkleather', [0, -0.48, 0], [0, 0, 0], [1.08, 1, 1.08]),
      S('shin' + s, 'orc.foot', 'common.darkleather', [0, -0.49, 0.04], [0, 0, 0], [1.1, 1.1, 1.05]),
      S('shin' + s, 'orc.toe', 'common.metal', [0, -0.38, 0.24], [-1.1, 0, 0], [1.15, 1.15, 1]),
      { ...S('shin' + s, 'orc.toe', 'cloth', [0, -0.375, 0.25], [-1.1, 0, 0], [0.8, 0.8, 1]), color: 'team' }
    ]),
    // a short axe hanging head-down from the right fist
    S('handR', 'orc.grip', 'common.darkleather', [0, -0.05, 0.02], [PI, 0, 0]),
    S('handR', 'orc.haft', 'common.leather', [0, 0.06, 0.02], [PI, 0, 0], [1.3, 0.62, 1.3], '#8a6038'),
    S('handR', 'orc.axeHead', 'common.blade', [0, -0.56, 0.02], [0, 0, PI], [0.62, 0.62, 1])
  ]
  return { rig: 'biped', hip: 0.96, chest: 0.62, waist: 0.1, shoulder: 0.47, arm: 0.9, neckZ: 0.17, lean: 0.24, splay: 0.2, stance: 2.1, legSplay: 0.1, stride: 7, scale: 1, footprint: 1.2, sculpted: true, parts }
}
