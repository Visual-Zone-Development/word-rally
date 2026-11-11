// Detailed figures for hd.js (pixel-art skill): heroic proportions (6–8 heads), anatomy built from overlapping
// muscle masses, painted faces from a face style (facePainter, FACE_DEFAULTS), masculine / feminine builds, outfits (gown, tunic, bare, plate
// armour, robe with cloak, druid), feathered wings, halo, crown, hood, long hair,
// and weapons with effect anchor points. Rendered at 96–128 px with renderHD(). It is a starting point:
// add, move and recolour parts per character, and keep the result in the game's STYLE.md.
import { model, mirror, mirrorBones } from './pixelforge.js'

const mixHex = (a, b, t) => { const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16); return '#' + [16, 8, 0].map((sh) => Math.round(((A >> sh) & 255) * (1 - t) + ((B >> sh) & 255) * t).toString(16).padStart(2, '0')).join('') }
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); return '#' + [16, 8, 0].map((sh) => Math.round(((n >> sh) & 255) * k).toString(16).padStart(2, '0')).join('') }

/**
 * A face style: every measurement the face painter and head shape use, in head units (hu, 1 = the head's
 * height) relative to the head centre. There is deliberately no built-in "look": the defaults are neutral
 * placeholders. Fill a style from the game's reference (SKILL.md "Matching a face style"), store it in
 * STYLE.md, and pass it as figure({ face: style }). Nested keys merge, so a style only lists what differs.
 */
export const FACE_DEFAULTS = {
  eyeLine: 0.03,        // eye centre height (+ up); head centre is 0, chin ≈ −0.5, crown ≈ +0.47
  eyeSpacing: 0.15,     // centre of each eye from the middle
  eye: {
    w: 0.068, h: 0.03,  // half width / half height of the eye opening
    sclera: true,       // whites visible (false: the eye is one dark shape)
    iris: 0.033,        // iris radius (0: none)
    pupil: 0.013,       // pupil radius (0: none)
    catchlight: 0.008,  // highlight radius (0: none)
    lid: 0.02,          // thickness of the dark upper-lid line (0: none)
    lidCurve: 2.2,      // how much the lid arches
    flick: 0,           // extra lid length at the outer corner (lashes, a winged look)
    crease: 0.08,       // lid-crease shading strength (0: none)
    lower: 0            // lower-lid line thickness (0: none)
  },
  brow: { gap: 0.1, thick: 0.02, taper: 0.08, len: [0.075, 0.085], arch: 0.28 }, // null: no brows
  socket: 0.16,         // shading in the eye socket under the brow ridge (0: flat)
  nose: { bridge: 0.07, nostrils: 0.5, under: 0.15, bottom: -0.2 }, // light offsets; null: no nose marks
  mouth: { at: -0.31, w: 0.075, line: 0.008, upper: 0.026, lower: 0.042, underShade: 0.12, smile: 0.15 }, // null: none
  blush: 0,             // blush radius (0: none)
  head: { jaw: 0.3, chin: 0.13, browRidge: 0.065, nose: [0.042, 0.1, 0.06], ears: 1 } // head-shape measurements
}

function mergeStyle(base, over = {}) {
  const out = { ...base }
  for (const [k, v] of Object.entries(over)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' ? { ...base[k], ...v } : v
  }
  return out
}

/**
 * Paints a face onto head parts in head-bone space, so it turns with the head in every direction, from a
 * face style (FACE_DEFAULTS shape) plus expression: smile (−1..1, overrides the style's), browTilt (anger
 * < 0 < worry), gaze ([x, y] −1..1), z (front of the face in hu; a hood's face sits further forward).
 * Returns the painter and the merged style (its head measurements shape the head blob).
 */
export function facePainter(hu, opts = {}) {
  const { browTilt = 0, gaze = [0, 0], z = 0.18, ...styleOpts } = opts
  const st = mergeStyle(FACE_DEFAULTS, styleOpts)
  const E = st.eye, B = st.brow, N = st.nose, Mo = st.mouth
  const smile = opts.smile ?? Mo?.smile ?? 0
  const EY = st.eyeLine, EX = st.eyeSpacing
  const paint = ([x, y, zz], n) => {
    const X = x / hu, Y = y / hu - 0.5, Z = zz / hu
    if (Z < z) return null
    // features on a surface turning away from the viewer collapse into the silhouette edge: skip them there
    if (n && n[2] < 0.3) return null
    const ax = Math.abs(X), side = X >= 0 ? 1 : -1
    const ex = ax - EX, ey = Y - EY
    if (B) {
      const browY = EY + B.gap - Math.max(0, ex + 0.04) * B.arch + ex * browTilt * 0.3
      if (Math.abs(Y - browY) < B.thick - Math.max(0, ex) * B.taper && ex > -B.len[0] && ex < B.len[1]) return { mat: 'brow' }
    }
    const lidY = E.h - 0.002 - ex * ex * E.lidCurve
    if (E.lid > 0 && ey > lidY && ey < lidY + E.lid && Math.abs(ex) < E.w + 0.004 + (ex > 0 ? E.flick : 0)) return { mat: 'lash' }
    if (E.crease > 0 && ey > lidY + E.lid + 0.01 && ey < lidY + E.lid + 0.03 && Math.abs(ex) < E.w - 0.008) return { light: -E.crease * (1 - Math.abs(ex) / E.w) }
    if (E.lower > 0 && ey < -E.h + E.lower && ey > -E.h - 0.002 && Math.abs(ex) < E.w * 0.8) return { mat: 'lash' }
    if ((ex * ex) / (E.w * E.w) + (ey * ey) / (E.h * E.h) <= 1) {
      if (!E.sclera) return { mat: 'pupil' }
      const ix = ex - side * gaze[0] * 0.02, iy = ey - gaze[1] * 0.01
      const r = Math.hypot(ix, iy * 1.2)
      if (E.catchlight > 0 && Math.hypot(ix + 0.012 * side, iy - 0.01) < E.catchlight) return { mat: 'sclera' }
      if (r < E.pupil) return { mat: 'pupil' }
      if (r < E.iris) return { mat: 'iris' }
      return { mat: 'sclera' }
    }
    // smooth falloffs only: a hard-edged patch reads as a crease when the head turns
    if (st.socket > 0) {
      const sock = 1 - (ex / (E.w + 0.06)) ** 2 - ((ey - 0.02) / 0.085) ** 2
      if (sock > 0) return { light: -st.socket * sock * (ex < 0 ? 1.2 : 1) }
    }
    if (N) {
      if (ax < 0.02 && Y > N.bottom + 0.03 && Y < EY - 0.06) return { light: N.bridge }
      if (Y > N.bottom - 0.015 && Y < N.bottom + 0.01 && ax > 0.022 && ax < 0.058) return { light: -N.nostrils }
      if (Y > N.bottom - 0.05 && Y < N.bottom - 0.015 && ax < 0.05) return { light: -N.under }
    }
    if (Mo) {
      const mY = Mo.at + ax * ax * 6 * smile
      if (Math.abs(Y - mY) < Mo.line && ax < Mo.w) return { mat: 'lipline' }
      if (Mo.upper > 0 && Y > mY + Mo.line && Y < mY + Mo.upper && ax < Mo.w - 0.012) return { mat: 'lips', light: -0.04 }
      if (Mo.lower > 0 && Y < mY - Mo.line - 0.003 && Y > mY - Mo.lower && ax < Mo.w - 0.02) return { mat: 'lips', light: 0.12 }
      if (Mo.underShade > 0 && Y < mY - Mo.lower - 0.008 && Y > mY - Mo.lower - 0.033 && ax < 0.045) return { light: -Mo.underShade }
    }
    if (st.blush > 0 && Math.hypot((ax - 0.21) * 0.8, Y + 0.11) < st.blush) return { mat: 'blush' }
    return null
  }
  return { paint, style: st }
}

/** Bones in head units (hu): height = heads × hu, feet at y = 0. Bone names match pixelforge's ANIMS. */
export function figureBones({ height = 110, heads = 7, body = 'masc', build = 0.88 } = {}) {
  const hu = height / heads
  // shoulder joints sit just inside the edge of the ribcage, so arms hang from the body, not beside it
  const sh = (body === 'fem' ? 0.66 : 0.78) * build + 0.1, hip = (body === 'fem' ? 0.47 : 0.42) * Math.min(1.1, build + 0.12)
  const leg = height * 0.47, chin = height - hu, shoulder = chin - 0.42 * hu
  return {
    hu,
    bones: mirrorBones({
      root: { at: [0, leg, 0] },
      spine: { parent: 'root', at: [0, 0.3 * hu, 0] },
      chest: { parent: 'spine', at: [0, (shoulder - leg) * 0.5, 0] },
      head: { parent: 'chest', at: [0, chin - leg - 0.3 * hu - (shoulder - leg) * 0.5, 0] },
      upperArmL: { parent: 'chest', at: [sh * hu, shoulder - leg - 0.3 * hu - (shoulder - leg) * 0.5, 0] },
      foreArmL: { parent: 'upperArmL', at: [0, -1.45 * hu, 0] },
      handL: { parent: 'foreArmL', at: [0, -1.25 * hu, 0] },
      thighL: { parent: 'root', at: [hip * hu, 0, 0] },
      shinL: { parent: 'thighL', at: [0, -leg * 0.5, 0] },
      footL: { parent: 'shinL', at: [0, -leg * 0.5 + 0.25 * hu, 0] },
      cape: { parent: 'chest', at: [0, (shoulder - leg) * 0.45, -0.5 * hu] },
      wingL: { parent: 'chest', at: [0.3 * hu, (shoulder - leg) * 0.3, -0.55 * hu] }
    })
  }
}

/**
 * Feathered wing on bone wingL (mirrored to wingR): an arched leading edge with rows of coverts, secondaries
 * and fanned primaries, each feather a flattened ellipsoid with the 'feather' pattern.
 */
function wing(hu, { span = 2.4, height = 3.2, drop = 3.4, mat = 'feather', dark = 'featherDark' } = {}) {
  const P = []
  // leading edge: shoulder → wrist (up and out) → tip (higher, a little further out): the tall angel silhouette
  const wrist = [span * 0.55 * hu, height * 0.7 * hu, -0.35 * hu], tip = [span * hu, height * hu, -0.6 * hu]
  const arm = (t) => {
    const a = t < 0.5 ? t * 2 : 1, b = t < 0.5 ? 0 : (t - 0.5) * 2
    const p0 = [0, 0, 0]
    const q = t < 0.5 ? p0.map((v, i) => v + (wrist[i] - v) * Math.sin((a * Math.PI) / 2)) : wrist.map((v, i) => v + (tip[i] - v) * b)
    return q
  }
  // small coverts along the leading edge
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, [x, y, z] = arm(t)
    P.push({ bone: 'wingL', shape: 'ellipsoid', at: [x, y - 0.12 * hu, z + 0.22 * hu], r: [0.2 * hu, 0.3 * hu, 0.1 * hu], rot: [0, 0, 0.15 + t * 0.35], mat, pattern: { type: 'feather', scale: 5, amount: 0.7 } })
  }
  // secondaries hang from shoulder → wrist; primaries fan out from wrist → tip, the longest at the tip
  const rows = [
    { from: 0.0, to: 0.95, n: 12, len: 0.9, w: 0.2, z: 0.12, ang: [0.0, 0.3], m: mat, sc: 4 },
    { from: 0.02, to: 0.5, n: 8, len: drop * 0.85, w: 0.22, z: 0.0, ang: [0.0, 0.2], m: mat, sc: 7 },
    { from: 0.5, to: 1.0, n: 7, len: drop * 1.0, w: 0.16, z: -0.1, ang: [0.15, 0.75], m: dark, sc: 8 }
  ]
  rows.forEach((r) => {
    for (let i = 0; i < r.n; i++) {
      const f = i / (r.n - 1), t = r.from + (r.to - r.from) * f
      const [x, y, z] = arm(t)
      const L = r.len * hu * (r === rows[2] ? 0.8 + 0.3 * f : 1)
      const th = r.ang[0] + (r.ang[1] - r.ang[0]) * f
      const cx = x + Math.sin(th) * L * 0.5, cy = y - Math.cos(th) * L * 0.5
      P.push({ bone: 'wingL', shape: 'ellipsoid', at: [cx, cy, z + r.z * hu - f * 0.06 * hu], r: [r.w * hu, L * 0.5, 0.09 * hu], rot: [0, 0, th], mat: r.m, pattern: { type: 'feather', scale: r.sc, amount: 1 } })
    }
  })
  return P
}

/**
 * Build a detailed figure.
 * spec: { height, heads, build, body: 'masc' | 'fem', muscle (0.6–1.3), face: a face style (FACE_DEFAULTS keys) + expression,
 *   colors: { skin, hair, brow, eyes, lips, cloth, cloth2, metal, gold, feather, leather },
 *   hair: 'long' | 'short' | 'swept' | 'none', beard, outfit: 'gown' | 'tunic' | 'bare' | 'plate' | 'robe' | 'druid',
 *   wings, halo, crown, hood, cloak, sword, flame, shield, staff }
 * Returns a model with points (swordBase, swordTip, staffTop, handR) for effects.
 */
export function figure(spec = {}) {
  const { height = 110, heads = 7, build = 0.88 } = spec
  const body = spec.body || 'masc', fem = body === 'fem'
  const { hu, bones } = figureBones({ height, heads, body, build })
  const C = { skin: '#f0c9a8', hair: '#d9b77a', eyes: '#3a5a7a', lips: '#bd7068', faceLine: '#2a1c22', cloth: '#ece8f2', cloth2: '#8a2c3a', metal: '#a9b4c2', gold: '#e0b04a', feather: '#e9e6ef', featherDark: '#c8c4d6', leather: '#6b4630', ...spec.colors }
  const w = build, P = []
  const outfit = spec.outfit || 'gown'
  const armour = outfit === 'plate'
  const limb = armour ? 'metal' : outfit === 'gown' ? 'skin' : 'cloth'
  const leg = height * 0.47

  // ----- body: overlapping masses, not tubes (see SKILL.md "Faces and anatomy") -----
  const torso = armour ? 'metal' : outfit === 'bare' ? 'skin' : 'cloth'
  const armMat = armour ? 'metal' : 'skin', legMat = armour ? 'metal' : 'cloth2'
  const shY = (bones.upperArmL.at[1]) // shoulder height in chest space
  const mus = spec.muscle ?? (fem ? 0.8 : 1)
  // pelvis, waist, ribcage
  P.push({ bone: 'root', shape: 'ellipsoid', at: [0, 0.1 * hu, 0], r: [(fem ? 0.86 : 0.74) * hu * w, 0.55 * hu, 0.5 * hu * w], mat: armour ? 'leather' : torso === 'skin' ? 'cloth2' : torso })
  // torso: flattened ellipsoids (a body is wider than deep; round cones jut out in side view)
  P.push({ bone: 'spine', shape: 'ellipsoid', at: [0, 0.5 * hu, 0], r: [(fem ? 0.5 : 0.6) * hu * w, 0.75 * hu, 0.38 * hu * w], mat: torso, pattern: armour ? { type: 'bands', scale: 3, amount: 1 } : null })
  P.push({ bone: 'chest', shape: 'ellipsoid', at: [0, 0.38 * hu, 0.02 * hu], r: [(fem ? 0.7 : 0.84) * hu * w, 0.78 * hu, 0.46 * hu * w], mat: torso, pattern: torso === 'cloth' ? { type: 'folds', scale: 5, amount: 0.5 } : null })
  if (fem && !armour) for (const sx of [1, -1]) P.push({ bone: 'chest', shape: 'ellipsoid', at: [sx * 0.24 * hu, 0.36 * hu, 0.34 * hu], r: [0.23 * hu, 0.21 * hu, 0.19 * hu], mat: torso })
  if (!fem && torso === 'skin') for (const sx of [1, -1]) P.push({ bone: 'chest', shape: 'ellipsoid', at: [sx * 0.28 * hu, 0.62 * hu, 0.32 * hu], r: [0.3 * hu, 0.17 * hu, 0.11 * hu], rot: [0, 0, sx * -0.12], mat: 'skin' }) // pectorals: flat plates
  // trapezius: the slope from neck to shoulder (a straight horizontal shoulder line looks like a coat hanger)
  for (const sx of [1, -1]) P.push({ bone: 'chest', shape: 'ellipsoid', at: [sx * 0.36 * hu, shY - 0.04 * hu, -0.06 * hu], r: [0.4 * hu * w, 0.14 * hu, 0.28 * hu * w], rot: [0, 0, sx * 0.32], mat: torso })
  // neck: thinner than the head, leaning slightly forward, wider at the base
  P.push({ bone: 'head', shape: 'cone', at: [0, -0.5 * hu, -0.04 * hu], to: [0, 0.15 * hu, 0], r: [(fem ? 0.22 : 0.27) * hu, (fem ? 0.17 : 0.21) * hu], mat: 'skin' })
  // head and face: shape and painted features both come from the face style (spec.face)
  const { paint: face, style: faceStyle } = facePainter(hu, spec.face)
  const H = faceStyle.head
  // one smooth blob: cranium, the lower face tapering into the chin, brow ridge, nose and ears, melted together
  // (separate shapes leave creases and lumps); measurements come from the face style (spec.face.head)
  P.push({
    bone: 'head', shape: 'blob', mat: 'skin', paint: face, k: 0.2 * hu,
    items: [
      { at: [0, 0.53 * hu, -0.05 * hu], r: [0.39 * hu, 0.45 * hu, 0.42 * hu] },
      { at: [0, 0.27 * hu, 0.06 * hu], r: [H.jaw * hu, 0.27 * hu, 0.3 * hu] },
      { at: [0, 0.06 * hu, 0.16 * hu], r: [H.chin * hu, 0.09 * hu, 0.12 * hu] },
      ...(H.browRidge > 0 ? [{ at: [0, 0.6 * hu, (0.17 + H.browRidge) * hu], r: [0.3 * hu, H.browRidge * hu, (0.035 + H.browRidge) * hu] }] : []),
      ...(H.nose ? [{ at: [0, 0.4 * hu, 0.38 * hu], r: H.nose.map((v) => v * hu), rot: [0.35, 0, 0], k: 0.05 * hu }] : []),
      ...(H.ears ? [1, -1].map((sx) => ({ at: [sx * 0.37 * hu, 0.47 * hu, -0.04 * hu], r: [0.035 * H.ears * hu, 0.09 * H.ears * hu, 0.06 * H.ears * hu], rot: [0, sx * 0.4, 0], k: 0.04 * hu })) : [])
    ]
  })
  // arms: deltoid cap, upper arm with biceps, elbow, forearm that swells near the elbow and tapers to the wrist
  P.push({ bone: 'upperArmL', shape: 'ellipsoid', at: [0.04 * hu, -0.2 * hu, 0], r: [0.24 * hu * w, 0.38 * hu, 0.26 * hu * w], mat: armMat })
  P.push({ bone: 'upperArmL', shape: 'cone', at: [0, -0.1 * hu, 0], to: [0, -1.4 * hu, 0], r: [0.25 * hu * w, 0.19 * hu * w], mat: armMat, pattern: armour ? { type: 'bands', scale: 3, amount: 1 } : null })
  P.push({ bone: 'upperArmL', shape: 'ellipsoid', at: [0, -0.68 * hu, 0.07 * hu], r: [0.2 * hu * w * mus, 0.42 * hu, 0.21 * hu * w * mus], mat: armMat })
  P.push({ bone: 'foreArmL', shape: 'ellipsoid', at: [0, -0.02 * hu, -0.02 * hu], r: [0.17 * hu, 0.17 * hu, 0.17 * hu], mat: armMat })
  P.push({ bone: 'foreArmL', shape: 'ellipsoid', at: [0, -0.36 * hu, 0.02 * hu], r: [0.21 * hu * w * mus, 0.42 * hu, 0.19 * hu * w * mus], mat: armMat })
  P.push({ bone: 'foreArmL', shape: 'cone', at: [0, -0.1 * hu, 0], to: [0, -1.18 * hu, 0], r: [0.19 * hu * w, 0.12 * hu * w], mat: armMat })
  // hand: palm, finger block with finger gaps, thumb; about three quarters of a face long
  P.push({ bone: 'handL', shape: 'ellipsoid', at: [0, -0.12 * hu, 0], r: [0.08 * hu, 0.2 * hu, 0.16 * hu], mat: armMat })
  P.push({ bone: 'handL', shape: 'ellipsoid', at: [-0.01 * hu, -0.38 * hu, 0.02 * hu], r: [0.07 * hu, 0.16 * hu, 0.15 * hu], rot: [0, Math.PI / 2, 0], mat: armMat, pattern: { type: 'fingers', scale: 1, amount: 1 } })
  P.push({ bone: 'handL', shape: 'capsule', at: [-0.04 * hu, -0.06 * hu, 0.12 * hu], to: [-0.07 * hu, -0.3 * hu, 0.17 * hu], r: 0.045 * hu, mat: armMat })
  // legs: thigh with the quadriceps forward and high, kneecap, calf high on the back, slim ankle, heel and foot
  P.push({ bone: 'thighL', shape: 'cone', at: [0, 0.1 * hu, 0], to: [0, -leg * 0.5, 0], r: [0.42 * hu * w, 0.25 * hu * w], mat: legMat })
  P.push({ bone: 'thighL', shape: 'ellipsoid', at: [0.02 * hu, -leg * 0.18, 0.1 * hu], r: [0.3 * hu * w * mus, leg * 0.22, 0.3 * hu * w * mus], mat: legMat })
  P.push({ bone: 'shinL', shape: 'ellipsoid', at: [0, 0.02 * hu, 0.06 * hu], r: [0.16 * hu * w, 0.17 * hu, 0.15 * hu], mat: legMat })
  P.push({ bone: 'shinL', shape: 'ellipsoid', at: [0, -0.55 * hu, -0.08 * hu], r: [0.23 * hu * w * mus, 0.62 * hu, 0.23 * hu * w * mus], mat: armour ? 'metal' : 'leather' })
  P.push({ bone: 'shinL', shape: 'cone', at: [0, 0, 0], to: [0, -leg * 0.5 + 0.25 * hu, 0], r: [0.22 * hu * w, 0.13 * hu * w], mat: armour ? 'metal' : 'leather' })
  P.push({ bone: 'footL', shape: 'ellipsoid', at: [0, -0.04 * hu, -0.05 * hu], r: [0.14 * hu, 0.16 * hu, 0.16 * hu], mat: armour ? 'metal' : 'leather' })
  P.push({ bone: 'footL', shape: 'ellipsoid', at: [0, -0.08 * hu, 0.28 * hu], r: [0.17 * hu, 0.13 * hu, 0.36 * hu], mat: armour ? 'metal' : 'leather' })

  // ----- outfits -----
  if (outfit === 'gown') {
    P.push({ bone: 'root', shape: 'cone', at: [0, 0.4 * hu, 0], to: [0, -leg + 0.05 * hu, 0.1 * hu], r: [0.62 * hu, 1.35 * hu], mat: 'cloth', pattern: { type: 'folds', scale: 9, amount: 1 }, trim: { mat: 'gold', width: 0.05, at: 'end' } })
    P.push({ bone: 'foreArmL', shape: 'cone', at: [0, 0.1 * hu, 0], to: [0, -0.85 * hu, 0], r: [0.27 * hu, 0.44 * hu], mat: 'cloth', pattern: { type: 'folds', scale: 6, amount: 1 }, trim: { mat: 'gold', width: 0.08 } })
    P.push({ bone: 'upperArmL', shape: 'cone', at: [0, 0.22 * hu, 0], to: [0, -1.45 * hu, 0], r: [0.33 * hu, 0.28 * hu], mat: 'cloth', pattern: { type: 'folds', scale: 5, amount: 0.7 } })
    P.push({ bone: 'spine', shape: 'cone', at: [0, 0.25 * hu, 0], to: [0, 0.5 * hu, 0], r: [0.64 * hu, 0.66 * hu], mat: 'gold', pattern: { type: 'bands', scale: 2, amount: 0.6 } })
  }
  if (outfit === 'tunic') {
    P.push({ bone: 'chest', shape: 'cone', at: [0, 0.75 * hu, 0], to: [0, -1.9 * hu, 0.02 * hu], r: [(fem ? 0.72 : 0.82) * hu * w, (fem ? 0.95 : 0.9) * hu * w], mat: 'cloth', pattern: { type: 'folds', scale: 7, amount: 0.8 }, trim: { mat: 'gold', width: 0.04, at: 'end' } })
    P.push({ bone: 'upperArmL', shape: 'cone', at: [0, 0.22 * hu, 0], to: [0, -0.65 * hu, 0], r: [0.34 * hu * w, 0.29 * hu * w], mat: 'cloth', pattern: { type: 'folds', scale: 5, amount: 0.6 }, trim: { mat: 'gold', width: 0.12 } })
    P.push({ bone: 'spine', shape: 'cone', at: [0, 0.18 * hu, 0], to: [0, 0.36 * hu, 0], r: [(fem ? 0.66 : 0.74) * hu * w, (fem ? 0.68 : 0.76) * hu * w], mat: 'leather', pattern: { type: 'worn', scale: 8, amount: 0.6 } })
    P.push({ bone: 'shinL', shape: 'cone', at: [0, -0.35 * hu, 0], to: [0, -leg * 0.5 + 0.3 * hu, 0], r: [0.26 * hu * w, 0.19 * hu * w], mat: 'leather', trim: { mat: 'gold', width: 0.06, at: 'start' } }) // boots
  }
  if (armour) {
    for (const [y, r] of [[0.15, 0.62], [-0.08, 0.55], [-0.3, 0.48]]) // layered pauldron plates
      P.push({ bone: 'upperArmL', shape: 'ellipsoid', at: [0.1 * hu, (y - 0.08) * hu, 0], r: [r * 0.8 * w * hu, 0.28 * hu, r * 0.75 * w * hu], rot: [0, 0, -0.35], mat: 'metal' })
    P.push({ bone: 'upperArmL', shape: 'ellipsoid', at: [0.1 * hu, 0.07 * hu, 0], r: [0.52 * w * hu, 0.09 * hu, 0.47 * w * hu], rot: [0, 0, -0.35], mat: 'gold' })
    P.push({ bone: 'root', shape: 'cone', at: [0, 0.35 * hu, 0], to: [0, -0.95 * hu, 0], r: [0.8 * hu, 0.98 * hu], mat: 'metal', pattern: { type: 'bands', scale: 4, amount: 1 } }) // tassets
    P.push({ bone: 'shinL', shape: 'ellipsoid', at: [0, 0.05 * hu, 0.12 * hu], r: [0.27 * hu, 0.24 * hu, 0.24 * hu], mat: 'metal' }) // knee
    P.push({ bone: 'chest', shape: 'cone', at: [0, 0.95 * hu, 0], to: [0, 1.25 * hu, 0], r: [0.5 * hu, 0.32 * hu], mat: 'metal', pattern: { type: 'bands', scale: 2, amount: 1 } }) // gorget
    P.push({ bone: 'chest', shape: 'box', at: [0, 0.35 * hu, 0.56 * hu], size: [0.12 * hu, 0.55 * hu, 0.03 * hu], mat: 'gold' }) // centre ridge
    if (spec.tabard !== false) P.push({ bone: 'root', shape: 'box', at: [0, -0.5 * hu, 0.62 * hu], size: [0.42 * hu, 0.95 * hu, 0.05 * hu], rot: [-0.08, 0, 0], mat: 'cloth2', pattern: { type: 'folds', scale: 3, amount: 0.6 }, trim: { mat: 'gold', width: 0.12, at: 'edge' } })
  }
  if (outfit === 'robe' || outfit === 'druid') {
    P.push({ bone: 'chest', shape: 'cone', at: [0, 0.7 * hu, 0], to: [0, -(leg + 0.8 * hu) + 0.1 * hu, 0.05 * hu], r: [0.66 * hu, 1.4 * hu], mat: 'cloth', pattern: { type: 'folds', scale: 8, amount: 1 }, trim: { mat: outfit === 'druid' ? 'cloth2' : 'gold', width: 0.05, at: 'end' } })
    P.push({ bone: 'foreArmL', shape: 'cone', at: [0, 0.1 * hu, 0], to: [0, -0.9 * hu, 0], r: [0.28 * hu, 0.46 * hu], mat: 'cloth', pattern: { type: 'folds', scale: 6, amount: 1 }, trim: { mat: outfit === 'druid' ? 'cloth2' : 'gold', width: 0.1 } })
    P.push({ bone: 'upperArmL', shape: 'cone', at: [0, 0.22 * hu, 0], to: [0, -1.45 * hu, 0], r: [0.34 * hu, 0.3 * hu], mat: 'cloth', pattern: { type: 'folds', scale: 5, amount: 0.8 } })
    P.push({ bone: 'spine', shape: 'cone', at: [0, 0.2 * hu, 0], to: [0, 0.42 * hu, 0], r: [0.7 * hu, 0.72 * hu], mat: outfit === 'druid' ? 'leather' : 'gold', pattern: { type: 'bands', scale: 2, amount: 0.5 } })
  }
  if (spec.cloak) {
    P.push({ bone: 'cape', shape: 'cone', at: [0, 0.35 * hu, 0], to: [0, -(height * 0.82), -0.9 * hu], r: [1.05 * hu, 2.1 * hu], rot: [0, 0, 0], mat: 'cloak', pattern: { type: 'folds', scale: 10, amount: 1 }, trim: { mat: 'gold', width: 0.04, at: 'end' } })
    P.push({ bone: 'chest', shape: 'ellipsoid', at: [0, 0.8 * hu, -0.15 * hu], r: [1.15 * hu, 0.32 * hu, 0.7 * hu], mat: 'fur', pattern: { type: 'fur', scale: 9, amount: 1 } })
  }

  // ----- hair, headwear -----
  const hair = spec.hair ?? 'long'
  if (hair !== 'none' && hair !== 'swept' && !spec.hood) {
    // hair is one melted mass (blob), so it flows instead of showing planks and seams. The cap sits back so the
    // hairline is a third of the way from brows to crown; the fringe is swept to one side; the back covers the nape
    const long = hair === 'long'
    const items = [
      { at: [0, 0.8 * hu, -0.14 * hu], r: [0.43 * hu, 0.34 * hu, 0.44 * hu] },
      { at: [0.08 * hu, 0.98 * hu, 0.16 * hu], r: [0.3 * hu, 0.1 * hu, 0.2 * hu], rot: [-0.6, 0, -0.3] },
      { at: [0.36 * hu, 0.64 * hu, -0.06 * hu], r: [0.09 * hu, 0.2 * hu, 0.26 * hu] },
      { at: [-0.36 * hu, 0.64 * hu, -0.06 * hu], r: [0.09 * hu, 0.2 * hu, 0.26 * hu] },
      { at: [0, 0.45 * hu, -0.28 * hu], r: [0.36 * hu, 0.3 * hu, 0.22 * hu] }
    ]
    if (long) items.push(
      { at: [0, -0.15 * hu, -0.3 * hu], r: [0.42 * hu, 0.95 * hu, 0.17 * hu], rot: [0.12, 0, 0] },
      { at: [0.33 * hu, 0.05 * hu, -0.02 * hu], r: [0.11 * hu, 0.75 * hu, 0.16 * hu], rot: [0.05, 0, 0.08] },
      { at: [-0.33 * hu, 0.05 * hu, -0.02 * hu], r: [0.11 * hu, 0.75 * hu, 0.16 * hu], rot: [0.05, 0, -0.08] }
    )
    P.push({ bone: 'head', shape: 'blob', mat: 'hair', k: 0.12 * hu, items, pattern: { type: 'strands', scale: 6, amount: 1 } })
  }
  if (hair === 'swept' && !spec.hood) {
    for (const [x, y, rz] of [[0.25, 0.95, -0.5], [-0.05, 1.0, 0.1], [-0.3, 0.9, 0.6]])
      P.push({ bone: 'head', shape: 'ellipsoid', at: [x * hu, y * hu, 0.05 * hu], r: [0.16 * hu, 0.3 * hu, 0.3 * hu], rot: [0, 0, rz], mat: 'hair', pattern: { type: 'strands', scale: 4, amount: 1 } })
  }
  if (spec.beard) {
    P.push({ bone: 'head', shape: 'cone', at: [0, 0.22 * hu, 0.24 * hu], to: [0, -0.7 * hu, 0.4 * hu], r: [0.3 * hu, 0.1 * hu], mat: 'beard', pattern: { type: 'strands', scale: 5, amount: 1 } })
    P.push({ bone: 'head', shape: 'ellipsoid', at: [0, 0.36 * hu, 0.38 * hu], r: [0.22 * hu, 0.06 * hu, 0.05 * hu], mat: 'beard' }) // moustache
  }
  if (spec.hood) {
    P.push({ bone: 'head', shape: 'ellipsoid', at: [0, 0.6 * hu, -0.1 * hu], r: [0.55 * hu, 0.6 * hu, 0.58 * hu], mat: 'cloth', pattern: { type: 'folds', scale: 5, amount: 0.7 } })
    P.push({ bone: 'head', shape: 'ellipsoid', at: [0, 0.48 * hu, 0.24 * hu], r: [0.34 * hu, 0.4 * hu, 0.28 * hu], mat: 'skin', paint: facePainter(hu, { z: 0.5, ...spec.face }).paint })
    if (outfit === 'druid') { // antler / moon crest
      P.push({ bone: 'head', shape: 'ellipsoid', at: [0, 1.25 * hu, 0.1 * hu], r: [0.32 * hu, 0.32 * hu, 0.08 * hu], mat: 'gold' })
      P.push({ bone: 'head', shape: 'ellipsoid', at: [0.1 * hu, 1.33 * hu, 0.16 * hu], r: [0.26 * hu, 0.26 * hu, 0.08 * hu], mat: 'cloth' })
    }
  }
  if (spec.crown) {
    P.push({ bone: 'head', shape: 'cone', at: [0, 0.82 * hu, -0.05 * hu], to: [0, 1.0 * hu, -0.05 * hu], r: [0.47 * hu, 0.5 * hu], mat: 'gold', pattern: { type: 'bands', scale: 1.5, amount: 0.5 } })
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2
      P.push({ bone: 'head', shape: 'cone', at: [Math.sin(a) * 0.46 * hu, 0.98 * hu, Math.cos(a) * 0.46 * hu - 0.05 * hu], to: [Math.sin(a) * 0.5 * hu, 1.38 * hu, Math.cos(a) * 0.5 * hu - 0.05 * hu], r: [0.09 * hu, 0.02 * hu], mat: 'gold' })
    }
  }
  if (spec.halo) {
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2
      P.push({ bone: 'head', shape: 'ellipsoid', at: [Math.sin(a) * 0.55 * hu, 1.32 * hu, Math.cos(a) * 0.55 * hu - 0.1 * hu], r: [0.1 * hu, 0.06 * hu, 0.1 * hu], mat: 'halo' })
    }
  }
  if (spec.wings) P.push(...wing(hu, typeof spec.wings === 'object' ? spec.wings : {}))

  // ----- held items (right hand) -----
  const points = { handR: { bone: 'handR', at: [0, -0.2 * hu, 0] } }
  if (spec.sword) {
    P.push({ bone: 'handR', shape: 'cone', at: [0, 0.1 * hu, 0], to: [0, -0.45 * hu, 0], r: [0.07 * hu, 0.07 * hu], mat: 'leather' })
    P.push({ bone: 'handR', shape: 'box', at: [0, -0.5 * hu, 0], size: [0.42 * hu, 0.07 * hu, 0.1 * hu], mat: 'gold' })
    P.push({ bone: 'handR', shape: 'box', at: [0, -1.95 * hu, 0], size: [0.12 * hu, 1.4 * hu, 0.04 * hu], mat: 'blade' })
    points.swordBase = { bone: 'handR', at: [0, -0.6 * hu, 0] }
    points.swordTip = { bone: 'handR', at: [0, -3.35 * hu, 0] }
  }
  if (spec.staff) {
    P.push({ bone: 'handR', shape: 'cone', at: [0, -2.7 * hu, 0], to: [0, 2.0 * hu, 0], r: [0.07 * hu, 0.1 * hu], mat: 'leather', pattern: { type: 'grain', scale: 6, amount: 1 } })
    P.push({ bone: 'handR', shape: 'ellipsoid', at: [0, 2.25 * hu, 0], r: [0.22 * hu, 0.22 * hu, 0.22 * hu], mat: 'gem' })
    points.staffTop = { bone: 'handR', at: [0, 2.25 * hu, 0] }
  }
  if (spec.shield) {
    P.push({ bone: 'foreArmL', shape: 'cone', at: [0.3 * hu, 0.2 * hu, 0.2 * hu], to: [0.3 * hu, -1.5 * hu, 0.2 * hu], r: [0.62 * hu, 0.08 * hu], rot: [0, 0, 0], mat: 'cloth2', trim: { mat: 'gold', width: 0.1, at: 'start' } })
  }

  const m = model({
    bones,
    parts: mirror(P),
    materials: {
      skin: { base: C.skin, hueShift: 18, rim: 0.6, wrap: 0.55 },
      hair: { base: C.hair, spec: 0.25, gloss: 20 },
      eyes: { base: C.eyes, ramp: Array(7).fill(C.eyes), decal: true },
      sclera: { base: '#f1ebe4', ramp: Array(7).fill('#ece4dc'), decal: true },
      iris: { base: C.eyes, ramp: Array(7).fill(C.eyes), decal: true },
      pupil: { base: C.faceLine, ramp: Array(7).fill(shade(C.faceLine, 0.6)), decal: true },
      lash: { base: C.faceLine, ramp: Array(7).fill(C.faceLine), decal: true },
      brow: { base: C.brow || C.hair, ramp: Array(7).fill(shade(C.brow || C.hair, 0.55)), decal: true },
      lips: { base: C.lips, hueShift: 14, wrap: 0.55, blend: true },
      blush: { base: mixHex(C.skin, C.lips, 0.35), hueShift: 18, wrap: 0.55, blend: true },
      lipline: { base: '#6a3a3c', ramp: Array(7).fill(shade(C.lips, 0.62)), decal: true },
      beard: { base: C.beard || C.hair, hueShift: 20 },
      cloth: { base: C.cloth, wrap: 0.3 },
      cloth2: { base: C.cloth2, wrap: 0.3 },
      cloak: { base: spec.cloakColor || '#3a3d4a', hueShift: 26 },
      fur: { base: spec.furColor || '#d8d2c6' },
      leather: { base: C.leather },
      metal: { base: C.metal, spec: 0.75, gloss: 30, hueShift: 30, steps: 8 },
      gold: { base: C.gold, spec: 0.6, gloss: 26, hueShift: 20 },
      blade: { base: '#d6dde6', spec: 0.8, gloss: 40, steps: 8 },
      feather: { base: C.feather, hueShift: C.featherShift ?? 16, rim: 1.2 },
      featherDark: { base: C.featherDark, hueShift: C.featherShift ?? 16, rim: 1.2 },
      halo: { base: '#ffe9a0', emissive: true, ramp: ['#7a5a1a', '#c08a2a', '#e8b84a', '#f8d870', '#ffeaa0', '#fff6d0', '#fffbe8'], steps: 7 },
      gem: { base: '#5fd0ff', emissive: true, ramp: ['#0b2a4a', '#1a5a8a', '#2a8acb', '#5fc0f0', '#9ae0ff', '#d0f4ff', '#ffffff'], steps: 7 }
    },
    outline: 'selective',
    shading: 'detailed'
  })
  m.points = points
  return m
}

/** Both hands held together in front of the chest (praying, holding a harp, a book, an orb). */
export function holdPose() {
  return { upperArmL: [-0.3, 0, -0.1], upperArmR: [-0.3, 0, 0.1], foreArmL: [-1.25, -0.75, 0], foreArmR: [-1.25, 0.75, 0], head: [0.06, 0, 0] }
}

/** A standing pose for detailed figures: arms slightly out, sword arm angled, weight on one leg. */
export function standPose({ swordOut = true, armsOut = 0.2 } = {}) {
  return {
    upperArmL: [0.05, 0, armsOut * 0.5 + 0.05], upperArmR: [swordOut ? -0.25 : 0.05, 0, -(armsOut * 0.5 + (swordOut ? 0.25 : 0.05))],
    foreArmL: [-0.3, 0.3, 0], foreArmR: [swordOut ? -0.35 : -0.3, swordOut ? 0 : -0.3, swordOut ? -0.2 : 0],
    // contrapposto: weight on the left leg (straight), right knee relaxed forward, hips and shoulders tilt
    // against each other, head turns a little: the single biggest step from mannequin to person
    thighL: [0, 0, -0.04], thighR: [-0.1, 0, 0.08], shinR: [0.2, 0, 0], $root: [0, 0, 0.03], chest: [0, 0.06, -0.06], head: [0.04, -0.12, 0.05]
  }
}
