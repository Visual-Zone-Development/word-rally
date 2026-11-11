// Pixel forge (pixel-art skill): build a character, creature or prop once as a few 3D primitives on a small
// skeleton, then render it to *pixel art* from any of 4/8 directions, in any view (side, low top-down,
// high top-down, isometric) and any animation frame. Every frame goes through the same pixel-art rules:
// hue-shifted colour ramps, banded shading from one fixed light, 1-px outer outlines (black or selective),
// inner lines where parts overlap, and cleanup of stray pixels. Because every direction and frame comes from
// one model, they always match: the consistency hand-made sheets and AI tools struggle with.
//
// Bake, never per frame (48 px × 8 directions × 18 frames ≈ 0.3 s on a desktop, roughly double on a Deck:
// spread it over a few ticks or bake each animation on first use), then draw frames with
// ctx.imageSmoothingEnabled = false at whole-number scales.

// ---------- colour ramps ----------

function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360
  const f = (p, q, t) => {
    t = (t + 1) % 1
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p
  }
  if (s === 0) return [l * 255, l * 255, l * 255].map(Math.round)
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q
  return [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)].map((v) => Math.round(v * 255))
}

const toHex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')

/** Move hue h toward target by up to amount degrees (shortest way round). */
function hueToward(h, target, amount) {
  let d = ((target - h + 540) % 360) - 180
  return h + Math.sign(d) * Math.min(Math.abs(d), amount)
}

/**
 * A pixel-art colour ramp from one base colour, darkest first. Shadows shift hue toward blue-violet and
 * lose a little saturation; highlights shift toward warm yellow. This hue shift is what makes pixel art
 * look painted instead of "base colour multiplied by grey".
 * ramp('#c0392b', 5) → ['#…dark', …, '#…light'] with the base near the middle.
 */
export function ramp(base, steps = 5, { hueShift = 22, spread = 0.52, sat = 0.08 } = {}) {
  const [h, s, l] = hexToHsl(base)
  spread *= Math.min(1, (steps - 1) / 4 + 0.25)
  const mid = (steps - 1) * 0.55
  const out = []
  for (let i = 0; i < steps; i++) {
    const k = (i - mid) / Math.max(1, steps - 1) // −0.55..0.45
    // darken proportionally (light bases still reach a deep shadow), lighten toward white proportionally
    // (eased so the first shadow step stays close to the base and the line colour gets properly deep)
    const L = Math.max(0.04, Math.min(0.96, k < 0 ? l * (1 - Math.pow(-k * spread * 2.4, 1.3)) : l + (1 - l) * k * spread * 2.2))
    let H = k < 0 ? hueToward(h, 250, -k * 2 * hueShift) : hueToward(h, 55, k * 2 * hueShift * 0.8)
    // shadows lose saturation in proportion to how saturated the base is (keeps skin from going orange)
    let S = Math.max(0, Math.min(1, k < 0 ? s * (1 + k * 1.2) + -k * sat * 0.5 : s - k * sat * 1.5 + (k < 0.2 ? sat * 0.3 : 0)))
    // near-greys (white cloth, steel, silver hair) get cool blue-violet shadows instead of muddy brown ones
    if (s < 0.12 && k < 0) { H = 238; S = Math.min(1, 0.08 + (0.12 - s) * 0.8 - k * 0.2) }
    out.push(toHex(hslToRgb(H, S, L)))
  }
  return out
}

// ---------- small vector / matrix helpers ----------

const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c] }
const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c] }
const rotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1] }
const mm = (A, B) => {
  const C = new Array(9)
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) C[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]
  return C
}
const mv = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]]
const mtv = (M, v) => [M[0] * v[0] + M[3] * v[1] + M[6] * v[2], M[1] * v[0] + M[4] * v[1] + M[7] * v[2], M[2] * v[0] + M[5] * v[1] + M[8] * v[2]]
const euler = ([x = 0, y = 0, z = 0] = []) => mm(mm(rotY(y), rotX(x)), rotZ(z))
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }

// ---------- views and directions ----------

/** Camera pitch per view (degrees): how far the camera looks down. Matches common pixel-art perspectives. */
export const VIEWS = { side: 0, 'low top-down': 20, 'high top-down': 35, isometric: 30 }

/** Facing yaw per direction (degrees): south faces the camera, east faces screen-right. */
export const DIRS = { south: 0, 'south-east': 45, east: 90, 'north-east': 135, north: 180, 'north-west': 225, west: 270, 'south-west': 315 }
export const DIRS8 = Object.keys(DIRS)
export const DIRS4 = ['south', 'east', 'north', 'west']

// ---------- model ----------

/**
 * A model is { bones, parts, materials }.
 * - bones: { name: { parent, at: [x, y, z] } }: joint position relative to the parent joint (rest pose).
 *   Units: 1 unit = 1 pixel at scale 1; +y up, +z toward the viewer when facing south, feet at y = 0.
 * - parts: [{ bone, shape: 'ellipsoid' | 'capsule' | 'box', mat, at, r | size | to, rot }]:
 *   ellipsoid: r = [rx, ry, rz]; box: size = [hx, hy, hz] (half sizes); capsule: from `at` to `to`, radius r.
 * - materials: { name: '#base' } or { name: { base, steps, hueShift, ramp, decal } }: ramps are built from these.
 *   decal: true for small surface details (eyes, catch-lights, buttons, emblems): flat colour, and they never
 *   cause inner lines or outlines (otherwise every eye gets a dark ring).
 * mirror(parts) adds the L/R copies of parts on bones ending in 'L'.
 */
export function model({ bones, parts, materials, outline = 'selective', outlineColor = '#16101e', shading = 'medium' }) {
  const ramps = {}, decals = new Set(), mats = {}
  const steps = { flat: 2, basic: 3, medium: 4, detailed: 5 }[shading] || 4
  for (const [k, v] of Object.entries(materials)) {
    const m = typeof v === 'string' ? { base: v } : v
    mats[k] = m // full specs, read by hd.js (steps, spec, gloss, rim, pattern, emissive…)
    ramps[k] = m.ramp || ramp(m.base, m.steps || steps, m)
    if (m.decal) decals.add(k)
  }
  return { bones, parts, ramps, decals, mats, outline, outlineColor, shading }
}

/** Duplicate parts on left-side bones (…L) to the matching right-side bones (…R), mirrored in x. */
export function mirror(parts) {
  const out = [...parts]
  for (const p of parts) {
    if (!/L$/.test(p.bone)) continue
    const q = { ...p, bone: p.bone.replace(/L$/, 'R') }
    if (p.at) q.at = [-p.at[0], p.at[1], p.at[2]]
    if (p.to) q.to = [-p.to[0], p.to[1], p.to[2]]
    if (p.rot) q.rot = [p.rot[0], -(p.rot[1] || 0), -(p.rot[2] || 0)]
    out.push(q)
  }
  return out
}

/** Mirror bones: every bone ending in 'L' gets an 'R' twin with x negated (and parent renamed). */
export function mirrorBones(bones) {
  const out = { ...bones }
  for (const [k, b] of Object.entries(bones)) {
    if (!/L$/.test(k)) continue
    out[k.replace(/L$/, 'R')] = { parent: /L$/.test(b.parent || '') ? b.parent.replace(/L$/, 'R') : b.parent, at: [-b.at[0], b.at[1], b.at[2]] }
  }
  return out
}

// Forward kinematics: world rotation and position of every bone for a pose (also used by hd.js).
export function solve(bones, pose = {}) {
  const out = {}
  const get = (name) => {
    if (out[name]) return out[name]
    const b = bones[name]
    const local = euler(pose[name])
    if (!b.parent) {
      // $root rotates the whole body about the feet; $offset then moves it (bob, lunge, slide)
      return (out[name] = { R: mm(euler(pose.$root), local), P: add(mv(euler(pose.$root), b.at), pose.$offset || [0, 0, 0]) })
    }
    const p = get(b.parent)
    return (out[name] = { R: mm(p.R, local), P: add(p.P, mv(p.R, b.at)) })
  }
  for (const k of Object.keys(bones)) get(k)
  return out
}

// ---------- rendering ----------

const EMPTY = -1

/**
 * Render one frame to a pixel-art canvas.
 * opts: size (canvas px, square, or [w, h]), scale (px per unit), dir ('south'… or yaw degrees),
 * view ('side' | 'low top-down' | 'high top-down' | 'isometric'), pose (from an animation), ground
 * (anchor: feet at this canvas y; default 90 % of height), shadow (true: soft ground ellipse).
 */
export function render(m, { size = 48, scale = 1, dir = 'south', view = 'low top-down', pose = {}, ground, shadow = true, light = [-0.55, 0.75, 0.5] } = {}) {
  const [W, H] = Array.isArray(size) ? size : [size, size]
  const yaw = ((typeof dir === 'number' ? dir : DIRS[dir]) * Math.PI) / 180
  const pitch = ((VIEWS[view] ?? view) * Math.PI) / 180
  const cam = mm(rotX(pitch), rotY(yaw))
  const gy = ground ?? Math.round(H * 0.9)
  const cx = W / 2
  const L = norm(light)
  const B = solve(m.bones, pose)
  const matIndex = Object.keys(m.ramps)

  // primitives in camera space (units), with screen bounds
  const prims = []
  for (const p of m.parts) {
    const b = B[p.bone]
    if (!b) continue
    const R = mm(cam, mm(b.R, euler(p.rot)))
    const toCam = (v) => mv(cam, add(b.P, mv(b.R, v)))
    const mat = matIndex.indexOf(p.mat)
    if (mat < 0) throw new Error(`pixelforge: unknown material ${p.mat}`)
    if (p.shape === 'capsule') {
      const a = toCam(p.at), c = toCam(p.to)
      prims.push({ type: 1, a, b: c, r: p.r, mat, bound: [Math.min(a[0], c[0]) - p.r, Math.max(a[0], c[0]) + p.r, Math.min(a[1], c[1]) - p.r, Math.max(a[1], c[1]) + p.r] })
    } else {
      const c = toCam(p.at || [0, 0, 0])
      const r = p.shape === 'box' ? p.size : p.r
      const ext = p.shape === 'box' ? Math.hypot(r[0], r[1], r[2]) : Math.max(r[0], r[1], r[2])
      prims.push({ type: p.shape === 'box' ? 2 : 0, c, R, r, mat, bound: [c[0] - ext, c[0] + ext, c[1] - ext, c[1] + ext] })
    }
  }

  const N = W * H
  const depth = new Float32Array(N).fill(-Infinity)
  const matB = new Int16Array(N).fill(EMPTY)
  const shade = new Float32Array(N)
  const Z0 = 1e4
  for (let py = 0; py < H; py++) {
    const y = (gy - py - 0.5) / scale
    for (let px = 0; px < W; px++) {
      const x = (px + 0.5 - cx) / scale
      let best = -Infinity, bm = EMPTY, bn = null
      for (const q of prims) {
        if (x < q.bound[0] || x > q.bound[1] || y < q.bound[2] || y > q.bound[3]) continue
        const hit = intersect(q, x, y, Z0)
        if (hit && hit.z > best) { best = hit.z; bm = q.mat; bn = hit.n }
      }
      if (bm === EMPTY) continue
      const i = py * W + px
      depth[i] = best
      matB[i] = bm
      // light fixed to the screen (top-left-front), so every direction is lit the same way
      shade[i] = Math.max(0, dot(bn, L)) * 0.85 + 0.15 + bn[1] * 0.08
    }
  }
  return toPixels(m, { W, H, depth, matB, shade, matIndex, shadow, gy, scale })
}

function intersect(q, x, y, Z0) {
  const o = [x, y, Z0], d = [0, 0, -1]
  if (q.type === 0) {
    const lo = mtv(q.R, sub(o, q.c)), ld = mtv(q.R, d)
    const so = [lo[0] / q.r[0], lo[1] / q.r[1], lo[2] / q.r[2]], sd = [ld[0] / q.r[0], ld[1] / q.r[1], ld[2] / q.r[2]]
    const a = dot(sd, sd), b = dot(so, sd), c = dot(so, so) - 1, h = b * b - a * c
    if (h < 0) return null
    const t = (-b - Math.sqrt(h)) / a
    const p = [so[0] + sd[0] * t, so[1] + sd[1] * t, so[2] + sd[2] * t]
    return { z: Z0 - t, n: norm(mv(q.R, [p[0] / q.r[0], p[1] / q.r[1], p[2] / q.r[2]])) }
  }
  if (q.type === 1) {
    const ba = sub(q.b, q.a), oa = sub(o, q.a)
    const baba = dot(ba, ba), bard = dot(ba, d), baoa = dot(ba, oa), rdoa = dot(d, oa), oaoa = dot(oa, oa)
    const A = baba - bard * bard, Bq = baba * rdoa - baoa * bard, C = baba * oaoa - baoa * baoa - q.r * q.r * baba
    let h = Bq * Bq - A * C, t = null
    if (h >= 0 && A > 1e-9) {
      const tt = (-Bq - Math.sqrt(h)) / A, yy = baoa + tt * bard
      if (yy > 0 && yy < baba) t = tt
    }
    if (t === null) {
      // end caps
      let bestT = null
      for (const e of [q.a, q.b]) {
        const oc = sub(o, e), b2 = dot(d, oc), c2 = dot(oc, oc) - q.r * q.r, h2 = b2 * b2 - c2
        if (h2 > 0) { const tt = -b2 - Math.sqrt(h2); if (bestT === null || tt < bestT) bestT = tt }
      }
      if (bestT === null) return null
      t = bestT
    }
    const p = [o[0], o[1], o[2] - t]
    const k = Math.max(0, Math.min(1, dot(sub(p, q.a), ba) / baba))
    const cpt = add(q.a, [ba[0] * k, ba[1] * k, ba[2] * k])
    return { z: p[2], n: norm(sub(p, cpt)) }
  }
  // box: slab test in local space
  const lo = mtv(q.R, sub(o, q.c)), ld = mtv(q.R, d)
  let tn = -Infinity, tf = Infinity, axis = 0, sign = 1
  for (let k = 0; k < 3; k++) {
    if (Math.abs(ld[k]) < 1e-9) { if (Math.abs(lo[k]) > q.r[k]) return null; continue }
    let t1 = (-q.r[k] - lo[k]) / ld[k], t2 = (q.r[k] - lo[k]) / ld[k]
    let s = -1
    if (t1 > t2) { [t1, t2] = [t2, t1]; s = 1 }
    if (t1 > tn) { tn = t1; axis = k; sign = s }
    if (t2 < tf) tf = t2
    if (tn > tf) return null
  }
  const nl = [0, 0, 0]
  nl[axis] = sign
  return { z: Z0 - tn, n: norm(mv(q.R, nl)) }
}

const rgbOf = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }

function toPixels(m, { W, H, depth, matB, shade, matIndex, shadow, gy, scale }) {
  const N = W * H
  const idx = new Int8Array(N).fill(-1)
  // 1. band the light into ramp steps (leave the darkest step for lines)
  for (let i = 0; i < N; i++) {
    if (matB[i] === EMPTY) continue
    const r = m.ramps[matIndex[matB[i]]]
    const usable = r.length - 1
    let k = Math.floor(shade[i] * usable + 0.15)
    if (m.shading === 'detailed') {
      // ordered dither only right at band edges
      const f = shade[i] * usable + 0.15 - k
      const px = i % W, py = (i / W) | 0
      if (f > 0.42 && f < 0.58 && (px + py) % 2 === 0) k += 1
    }
    idx[i] = 1 + Math.max(0, Math.min(usable - 1, k))
  }
  // 2. cleanup: a pixel whose band differs from all 4 same-material neighbours, which agree, takes theirs
  const nb = [-1, 1, -W, W]
  for (let i = 0; i < N; i++) {
    if (idx[i] < 0) continue
    const px = i % W
    let agree = -2, ok = true
    for (const d of nb) {
      const j = i + d
      if (j < 0 || j >= N || (d === -1 && px === 0) || (d === 1 && px === W - 1) || matB[j] !== matB[i]) { ok = false; break }
      if (agree === -2) agree = idx[j]
      else if (agree !== idx[j]) { ok = false; break }
    }
    if (ok && agree !== idx[i]) idx[i] = agree
  }
  // 3. inner lines: where a part sits clearly in front of another, darken the pixel behind
  const thr = 2.2 / Math.max(scale, 0.5)
  const decal = new Uint8Array(matIndex.length)
  matIndex.forEach((k, i) => { decal[i] = m.decals?.has(k) ? 1 : 0 })
  const line = new Uint8Array(N)
  for (let i = 0; i < N; i++) {
    if (idx[i] < 0) continue
    const px = i % W
    for (const d of nb) {
      const j = i + d
      if (j < 0 || j >= N || (d === -1 && px === 0) || (d === 1 && px === W - 1) || idx[j] < 0) continue
      if (depth[j] - depth[i] > thr && matB[j] !== matB[i] && !decal[matB[j]] && !decal[matB[i]]) { line[i] = 1; break }
    }
  }
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(W, H)
  const D = img.data
  const put = (i, rgb, a = 255) => { D[i * 4] = rgb[0]; D[i * 4 + 1] = rgb[1]; D[i * 4 + 2] = rgb[2]; D[i * 4 + 3] = a }
  // ground shadow: a flat, translucent ellipse in pixels (no soft gradient: pixel art)
  if (shadow) {
    let minX = W, maxX = 0
    for (let i = 0; i < N; i++) if (idx[i] >= 0) { const x = i % W; if (x < minX) minX = x; if (x > maxX) maxX = x }
    const rx = Math.max(3, Math.round((maxX - minX) * 0.36)), ry = Math.max(1, Math.round(rx * 0.32))
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
      if ((x * x) / (rx * rx) + (y * y) / (ry * ry) > 1) continue
      const px = Math.round(W / 2 + x), py = gy + y - 1
      if (px >= 0 && px < W && py >= 0 && py < H) put(py * W + px, [20, 14, 30], 90)
    }
  }
  const cache = {}
  const col = (mat, k) => (cache[mat + ':' + k] ??= rgbOf(m.ramps[matIndex[mat]][k]))
  for (let i = 0; i < N; i++) if (idx[i] >= 0) put(i, line[i] ? col(matB[i], 0) : col(matB[i], idx[i]))
  // 4. outer outline (1 px outside the silhouette)
  if (m.outline !== 'none') {
    const oc = rgbOf(m.outlineColor)
    const out = []
    for (let i = 0; i < N; i++) {
      if (idx[i] >= 0) continue
      const px = i % W
      for (const d of nb) {
        const j = i + d
        if (j < 0 || j >= N || (d === -1 && px === 0) || (d === 1 && px === W - 1) || idx[j] < 0) continue
        if (m.outline === 'black') { out.push([i, oc]); break }
        // selective outline: the darkest step of the neighbouring material; the lit (top / left) edge one step lighter
        const lit = d === W || d === 1
        out.push([i, col(matB[j], lit ? 1 : 0)])
        break
      }
    }
    for (const [i, c] of out) put(i, c)
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

// ---------- animation ----------

/** Linear-in-time keyframes for one value: k = [[t, v], …] sampled at phase t (0..1), eased in-out. */
export function key(k, t) {
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) {
      const [t0, v0] = k[i - 1], [t1, v1] = k[i]
      const f = (t - t0) / (t1 - t0 || 1), e = f * f * (3 - 2 * f)
      return v0 + (v1 - v0) * e
    }
  }
  return k.at(-1)[1]
}

const S = Math.sin, TAU = Math.PI * 2

/**
 * Animation templates for the humanoid rig: (phase 0..1, opts) → pose. Frame counts are what reads well
 * at 32–64 px: idle 4, walk 8, run 8, attack 6, cast 6, hurt 3, jump 6, death 6.
 * Conventions: negative x rotation swings a limb forward; positive z rotation lifts a left (…L) limb away
 * from the body and negative z lifts a right (…R) one (L bones sit at +x).
 */
export const ANIMS = {
  idle: { frames: 4, fps: 5, loop: true, pose: (p) => {
    const b = S(p * TAU)
    return { $offset: [0, b < 0 ? -0.6 : 0, 0], chest: [b * 0.03, 0, 0], head: [-b * 0.04, 0, 0],
      upperArmL: [0, 0, 0.12 + b * 0.04], upperArmR: [0, 0, -0.12 - b * 0.04], foreArmL: [-0.15, 0, 0], foreArmR: [-0.15, 0, 0] }
  } },
  walk: { frames: 8, fps: 10, loop: true, pose: (p) => {
    const s = S(p * TAU), c = Math.cos(p * TAU)
    return { $offset: [0, -Math.abs(s) * 1.0 + 0.4, 0], spine: [0.04, s * 0.08, 0],
      thighL: [-s * 0.55, 0, 0], thighR: [s * 0.55, 0, 0],
      shinL: [Math.max(0, -c) * 0.7, 0, 0], shinR: [Math.max(0, c) * 0.7, 0, 0],
      upperArmL: [s * 0.5, 0, 0.1], upperArmR: [-s * 0.5, 0, -0.1], foreArmL: [-0.35, 0, 0], foreArmR: [-0.35, 0, 0], head: [-0.03, -s * 0.05, 0],
      cape: [0.18 + Math.abs(Math.sin(p * TAU - 0.6)) * 0.12, 0, 0] } // secondary motion: trails and lags the bob
  } },
  run: { frames: 8, fps: 13, loop: true, pose: (p) => {
    const s = S(p * TAU), c = Math.cos(p * TAU)
    return { $offset: [0, -Math.abs(s) * 1.6 + 1.2, 0], spine: [-0.28, s * 0.12, 0], head: [0.18, 0, 0],
      thighL: [-s * 0.95, 0, 0], thighR: [s * 0.95, 0, 0],
      shinL: [Math.max(0, -c) * 1.3 + 0.2, 0, 0], shinR: [Math.max(0, c) * 1.3 + 0.2, 0, 0],
      upperArmL: [s * 0.9, 0, 0.15], upperArmR: [-s * 0.9, 0, -0.15], foreArmL: [-1.3, 0, 0], foreArmR: [-1.3, 0, 0],
      cape: [0.42 + Math.abs(Math.sin(p * TAU - 0.6)) * 0.15, 0, 0] }
  } },
  attack: { frames: 6, fps: 12, loop: false, pose: (p) => {
    // anticipation (0–0.35) → strike (0.35–0.5) → follow-through (0.5–0.7) → recover
    const arm = key([[0, -0.2], [0.35, -2.7], [0.5, -0.6], [0.7, 0.1], [1, -0.2]], p)
    const twist = key([[0, 0], [0.35, 0.45], [0.5, -0.4], [0.7, -0.5], [1, 0]], p)
    const lean = key([[0, 0], [0.35, 0.12], [0.5, -0.3], [0.7, -0.25], [1, 0]], p)
    return { $offset: [0, key([[0, 0], [0.35, -0.5], [0.5, -1.2], [1, 0]], p), 0], spine: [lean, twist, 0],
      upperArmR: [arm, 0, -0.25], foreArmR: [key([[0, -0.3], [0.35, -1.2], [0.5, -0.1], [1, -0.3]], p), 0, 0],
      upperArmL: [-arm * 0.25, 0, 0.35], foreArmL: [-0.6, 0, 0],
      thighL: [-0.35, 0, 0], thighR: [0.3, 0, 0], shinR: [0.35, 0, 0] }
  } },
  cast: { frames: 6, fps: 10, loop: false, pose: (p) => {
    const up = key([[0, 0], [0.4, 1], [0.6, 1], [1, 0]], p)
    return { $offset: [0, -up * 0.6, 0], spine: [0.1 * up, 0, 0], head: [-0.15 * up, 0, 0],
      upperArmL: [-1.4 * up - 0.1, 0, 0.5 * up], upperArmR: [-1.4 * up - 0.1, 0, -0.5 * up], foreArmL: [-0.5 * up, 0, 0], foreArmR: [-0.5 * up, 0, 0] }
  } },
  hurt: { frames: 3, fps: 10, loop: false, pose: (p) => {
    const k = key([[0, 0], [0.3, 1], [1, 0.3]], p)
    return { spine: [0.35 * k, 0, 0], head: [0.3 * k, 0, 0], upperArmL: [0.6 * k, 0, 0.4 * k], upperArmR: [0.6 * k, 0, -0.4 * k], $offset: [0, 0, -1.5 * k] }
  } },
  jump: { frames: 6, fps: 10, loop: false, pose: (p) => {
    const crouch = key([[0, 0], [0.15, 1], [0.3, 0], [0.8, 0], [0.92, 1], [1, 0]], p)
    const air = key([[0, 0], [0.25, 0], [0.5, 1], [0.75, 0.6], [0.88, 0], [1, 0]], p)
    return { $offset: [0, -crouch * 2 + air * 8, 0], spine: [-0.2 * crouch, 0, 0],
      thighL: [-0.9 * crouch - 0.7 * air, 0, 0], thighR: [-0.9 * crouch - 0.3 * air, 0, 0], shinL: [1.6 * crouch + 1.0 * air, 0, 0], shinR: [1.6 * crouch + 0.5 * air, 0, 0],
      upperArmL: [-2.2 * air + 0.4 * crouch, 0, 0.3], upperArmR: [-2.2 * air + 0.4 * crouch, 0, -0.3],
      cape: [0.2 + key([[0, 0], [0.3, 0.6], [0.5, 0.2], [0.75, -0.3], [0.9, 0.5], [1, 0]], p), 0, 0] }
  } },
  death: { frames: 6, fps: 8, loop: false, pose: (p) => {
    const f = key([[0, 0], [0.3, 0.15], [0.8, 1], [1, 1]], p)
    return { $root: [-f * 1.42, 0, 0], $offset: [0, f * 2.5, f * 18], head: [-0.3 * f, 0, 0],
      upperArmL: [0.8 * f, 0, 0.6 * f], upperArmR: [0.8 * f, 0, -0.6 * f], shinL: [0.3 * f, 0, 0], shinR: [0.5 * f, 0, 0] }
  } }
}

/**
 * Bake a sprite sheet: rows = directions, columns = frames of each animation, laid out one after another.
 * Returns { canvas, cell: [w, h], dirs, anims: { name: { start, frames, fps, loop } }, frame(dir, anim, i) → [sx, sy] }.
 * Mirroring west from east halves the work but breaks asymmetric characters (a sword in one hand): render all.
 */
export function sheet(m, { size = 48, scale = 1, view = 'low top-down', dirs = DIRS8, anims = ['idle', 'walk'], templates = ANIMS, shadow = true } = {}) {
  const [W, H] = Array.isArray(size) ? size : [size, size]
  const layout = {}
  let col = 0
  for (const a of anims) {
    const t = templates[a]
    layout[a] = { start: col, frames: t.frames, fps: t.fps, loop: t.loop }
    col += t.frames
  }
  const canvas = document.createElement('canvas')
  canvas.width = W * col
  canvas.height = H * dirs.length
  const ctx = canvas.getContext('2d')
  dirs.forEach((d, row) => {
    for (const a of anims) {
      const t = templates[a], L = layout[a]
      for (let f = 0; f < t.frames; f++) {
        const phase = t.loop ? f / t.frames : f / Math.max(1, t.frames - 1)
        const c = render(m, { size, scale, dir: d, view, pose: t.pose(phase), shadow })
        ctx.drawImage(c, (L.start + f) * W, row * H)
      }
    }
  })
  return { canvas, cell: [W, H], dirs, anims: layout, frame: (dir, anim, i) => [(layout[anim].start + (i % layout[anim].frames)) * W, dirs.indexOf(dir) * H] }
}

/** Nearest of the sheet's directions to a movement vector (screen x right, y down). */
export function dirFromVector(x, y, dirs = DIRS8) {
  // screen-down is south (yaw 0), screen-right is east (yaw 90)
  const yaw = ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360
  let best = dirs[0], bd = 999
  for (const d of dirs) { const dd = Math.abs(((DIRS[d] - yaw + 540) % 360) - 180); if (dd < bd) { bd = dd; best = d } }
  return best
}

// ---------- the humanoid rig and a character builder ----------

/**
 * Bones for a humanoid of `height` units. proportions: heads (2–2.5 chibi, 3–4 heroic), build (0.8 slim … 1.3 stocky).
 */
export function humanoidBones({ height = 40, heads = 2.4 } = {}) {
  const head = height / heads, body = height - head
  const leg = body * 0.48, torso = body * 0.52
  return mirrorBones({
    root: { at: [0, leg, 0] },
    spine: { parent: 'root', at: [0, 0.5, 0] },
    chest: { parent: 'spine', at: [0, torso * 0.45, 0] },
    head: { parent: 'chest', at: [0, torso * 0.55, 0] },
    upperArmL: { parent: 'chest', at: [torso * 0.42, torso * 0.42, 0] },
    foreArmL: { parent: 'upperArmL', at: [0, -leg * 0.42, 0] },
    handL: { parent: 'foreArmL', at: [0, -leg * 0.4, 0] },
    thighL: { parent: 'root', at: [torso * 0.22, 0, 0] },
    shinL: { parent: 'thighL', at: [0, -leg * 0.5, 0] },
    footL: { parent: 'shinL', at: [0, -leg * 0.5, 0] },
    cape: { parent: 'chest', at: [0, torso * 0.4, -torso * 0.3] }
  })
}

/**
 * Build a humanoid character from a short spec (the "text to character" step done in code).
 * spec: { height, heads, build, colors: { skin, hair, eyes, top, bottom, shoes, accent, metal },
 *   hair: 'short' | 'spiky' | 'bob' | 'long' | 'none', beard: bool, hat: null | 'hood' | 'wizard' | 'helmet',
 *   face: { eyeY, spacing, w, h, shine, mouth } (head radii; measure them from the reference),
 *   cape: bool, weapon: null | 'sword' | 'staff' | 'axe', shield: bool, outline, shading }
 * Returns a model: tweak or append parts for anything the spec doesn't cover.
 */
export function character(spec = {}) {
  const { height = 40, heads = 2.4, build = 1 } = spec
  const C = { skin: '#f2c7a5', hair: '#6b3e26', eyes: '#1e1a2e', top: '#3d6fb6', bottom: '#4a3b52', shoes: '#5a3a28', accent: '#d8a23a', metal: '#b8c4d0', ...spec.colors }
  const bones = humanoidBones({ height, heads })
  const head = height / heads, body = height - head, leg = body * 0.48, torso = body * 0.52
  const hr = head * 0.5 // head radius
  const w = build
  const P = []
  // legs, feet
  P.push({ bone: 'thighL', shape: 'capsule', at: [0, 0, 0], to: [0, -leg * 0.5, 0], r: 1.9 * w, mat: 'bottom' })
  P.push({ bone: 'shinL', shape: 'capsule', at: [0, 0, 0], to: [0, -leg * 0.42, 0], r: 1.7 * w, mat: 'bottom' })
  P.push({ bone: 'footL', shape: 'ellipsoid', at: [0, 0.6, 1.0], r: [2.0 * w, 1.5, 2.8], mat: 'shoes' })
  // torso
  P.push({ bone: 'spine', shape: 'ellipsoid', at: [0, 0.6, 0], r: [torso * 0.42 * w, torso * 0.3, torso * 0.3 * w], mat: 'bottom' })
  P.push({ bone: 'chest', shape: 'ellipsoid', at: [0, torso * 0.12, 0], r: [torso * 0.44 * w, torso * 0.42, torso * 0.32 * w], mat: 'top' })
  P.push({ bone: 'spine', shape: 'ellipsoid', at: [0, torso * 0.3, 0], r: [torso * 0.46 * w, torso * 0.09, torso * 0.34 * w], mat: 'accent' }) // belt
  // arms
  P.push({ bone: 'upperArmL', shape: 'capsule', at: [0, 0, 0], to: [0, -leg * 0.42, 0], r: 1.5 * w, mat: 'top' })
  P.push({ bone: 'foreArmL', shape: 'capsule', at: [0, 0, 0], to: [0, -leg * 0.36, 0], r: 1.35 * w, mat: 'skin' })
  P.push({ bone: 'handL', shape: 'ellipsoid', at: [0, -0.4, 0], r: [1.6, 1.6, 1.6], mat: 'skin' })
  // head and face
  P.push({ bone: 'head', shape: 'ellipsoid', at: [0, hr * 0.95, 0], r: [hr, hr * 0.95, hr * 0.92], mat: 'skin' })
  // face: measured from the game's reference and kept in STYLE.md (SKILL.md "Matching a face style"); the
  // defaults are neutral placeholders. Sizes in head radii; eyes sit on the front of the head.
  const F = { eyeY: 0.82, spacing: 0.36, w: 0.13, h: 0.2, shine: true, mouth: 0, ...spec.face }
  const eyes = (z) => {
    for (const sx of [1, -1]) {
      P.push({ bone: 'head', shape: 'ellipsoid', at: [sx * hr * F.spacing, hr * F.eyeY, hr * z], r: [hr * F.w, hr * F.h, hr * 0.12], mat: 'eyes' })
      if (F.shine) P.push({ bone: 'head', shape: 'ellipsoid', at: [sx * hr * F.spacing - hr * 0.05, hr * (F.eyeY + F.h * 0.5), hr * (z + 0.08)], r: [hr * 0.06, hr * 0.07, hr * 0.06], mat: 'shine' })
    }
    if (F.mouth > 0) P.push({ bone: 'head', shape: 'ellipsoid', at: [0, hr * (F.eyeY - 0.38), hr * (z - 0.02)], r: [hr * F.mouth, hr * 0.05, hr * 0.1], mat: 'eyes' })
  }
  eyes(0.84)
  if (spec.beard) {
    P.push({ bone: 'head', shape: 'ellipsoid', at: [0, hr * 0.3, hr * 0.62], r: [hr * 0.78, hr * 0.62, hr * 0.42], mat: 'hair' })
    P.push({ bone: 'head', shape: 'ellipsoid', at: [0, hr * -0.1, hr * 0.7], r: [hr * 0.5, hr * 0.5, hr * 0.32], mat: 'hair' })
  }
  // hair
  const hair = spec.hair ?? 'short'
  if (hair !== 'none') {
    P.push({ bone: 'head', shape: 'ellipsoid', at: [0, hr * 1.24, -hr * 0.16], r: [hr * 1.04, hr * 0.78, hr * 0.98], mat: 'hair' })
    P.push({ bone: 'head', shape: 'ellipsoid', at: [0, hr * 1.48, hr * 0.5], r: [hr * 0.86, hr * 0.32, hr * 0.48], rot: [-0.25, 0, 0], mat: 'hair' }) // fringe
  }
  if (hair === 'spiky') {
    for (const [x, y, z, rz, rx] of [[0, 1.9, -0.1, 0, -0.3], [0.6, 1.75, 0, -0.6, -0.2], [-0.6, 1.75, 0, 0.6, -0.2], [0.35, 1.55, 0.7, -0.3, -1.0], [-0.35, 1.55, 0.7, 0.3, -1.0], [0, 1.5, -0.8, 0, 0.9]])
      P.push({ bone: 'head', shape: 'ellipsoid', at: [x * hr, y * hr, z * hr], r: [hr * 0.24, hr * 0.5, hr * 0.24], rot: [rx, 0, rz], mat: 'hair' })
  }
  if (hair === 'bob' || hair === 'long') {
    const len = hair === 'long' ? 1.25 : 0.55
    P.push({ bone: 'head', shape: 'ellipsoid', at: [0, hr * (0.95 - len * 0.4), -hr * 0.5], r: [hr * 1.06, hr * (0.45 + len * 0.6), hr * 0.62], mat: 'hair' })
  }
  // hats
  if (spec.hat === 'hood') {
    P.push({ bone: 'head', shape: 'ellipsoid', at: [0, hr * 1.05, -hr * 0.15], r: [hr * 1.15, hr * 1.1, hr * 1.08], mat: 'accent' })
    P.push({ bone: 'head', shape: 'ellipsoid', at: [0, hr * 0.85, hr * 0.62], r: [hr * 0.8, hr * 0.78, hr * 0.5], mat: 'skin' }) // face opening
    eyes(1.04)
  }
  if (spec.hat === 'wizard') {
    P.push({ bone: 'head', shape: 'ellipsoid', at: [0, hr * 1.55, 0], r: [hr * 1.5, hr * 0.14, hr * 1.5], mat: 'accent' })
    P.push({ bone: 'head', shape: 'capsule', at: [0, hr * 1.6, 0], to: [-hr * 0.3, hr * 2.7, -hr * 0.3], r: hr * 0.62, mat: 'accent' })
    P.push({ bone: 'head', shape: 'capsule', at: [-hr * 0.3, hr * 2.6, -hr * 0.3], to: [-hr * 0.9, hr * 3.0, -hr * 0.6], r: hr * 0.3, mat: 'accent' })
  }
  if (spec.hat === 'helmet') {
    P.push({ bone: 'head', shape: 'ellipsoid', at: [0, hr * 1.2, -hr * 0.05], r: [hr * 1.1, hr * 0.85, hr * 1.06], mat: 'metal' })
    P.push({ bone: 'head', shape: 'box', at: [0, hr * 1.95, -hr * 0.1], size: [hr * 0.12, hr * 0.35, hr * 0.8], mat: 'accent' })
  }
  // cape
  if (spec.cape) P.push({ bone: 'cape', shape: 'box', at: [0, -torso * 0.55, -0.4], size: [torso * 0.5 * w, torso * 0.68, 0.7], rot: [0.12, 0, 0], mat: 'accent' })
  // weapon in the right hand (points forward-up from the fist)
  if (spec.weapon === 'sword') {
    P.push({ bone: 'handR', shape: 'box', at: [0, -0.4, 1.8], size: [0.5, 0.5, 1.6], mat: 'shoes' })
    P.push({ bone: 'handR', shape: 'box', at: [0, -0.4, 3.6], size: [2.2, 0.6, 0.5], mat: 'accent' })
    P.push({ bone: 'handR', shape: 'box', at: [0, -0.4, 8.6], size: [0.9, 0.35, 4.6], mat: 'metal' })
  }
  if (spec.weapon === 'staff') {
    P.push({ bone: 'handR', shape: 'capsule', at: [0, -7, 0], to: [0, 10, 0], r: 0.8, mat: 'shoes' })
    P.push({ bone: 'handR', shape: 'ellipsoid', at: [0, 11.5, 0], r: [1.9, 1.9, 1.9], mat: 'accent' })
  }
  if (spec.weapon === 'axe') {
    P.push({ bone: 'handR', shape: 'capsule', at: [0, -0.4, -1], to: [0, -0.4, 9], r: 0.7, mat: 'shoes' })
    P.push({ bone: 'handR', shape: 'box', at: [0, 1.2, 7.8], size: [0.5, 2.6, 1.6], mat: 'metal' })
  }
  if (spec.shield) P.push({ bone: 'foreArmL', shape: 'ellipsoid', at: [2.0, -leg * 0.22, 0.4], r: [0.8, 4.2, 3.6], mat: 'metal' })
  return model({
    bones,
    parts: mirror(P),
    materials: { skin: C.skin, hair: C.hair, eyes: { base: C.eyes, ramp: Array(5).fill(C.eyes), decal: true }, shine: { base: '#ffffff', ramp: Array(5).fill('#fdf8ee'), decal: true }, top: C.top, bottom: C.bottom, shoes: C.shoes, accent: C.accent, metal: { base: C.metal, hueShift: 30 } },
    outline: spec.outline ?? 'selective',
    shading: spec.shading ?? 'medium'
  })
}
