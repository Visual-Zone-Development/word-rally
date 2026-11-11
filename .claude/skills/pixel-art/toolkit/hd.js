// High-detail pixel renderer (pixel-art skill): the same models as pixelforge.js, rendered the way 3D-to-pixel
// games do it (Dead Cells): shade the model at ss× resolution with a richer light model (key + fill + rim,
// specular on metal, soft occlusion in crevices, surface patterns such as feathers, cloth folds, hair
// strands, armour bands and trims), then shrink each pixel to its majority material and snap the averaged
// light to that material's 6–8-step hue-shifted ramp. The averaging produces the in-between colours that
// pixel artists place by hand on curves (manual anti-aliasing), so 96–128 px sprites get detailed,
// painterly shading while every direction and frame stays consistent.
//
// Cost: measured ~0.3 s per 160 px frame (winged figure, ss 3) on a desktop. Bake sheets ahead of time to PNG
// (bake.mjs in the skill folder), never at game start.
import { ramp, solve, DIRS, VIEWS } from './pixelforge.js'

// ---------- math ----------
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
const len = (a) => Math.hypot(a[0], a[1], a[2])
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

function hash2(x, y) {
  let h = (Math.floor(x) * 374761393 + Math.floor(y) * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi
  const s = (t) => t * t * (3 - 2 * t)
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1)
  return a + (b - a) * s(fx) + (c - a) * s(fy) + (a - b - c + d) * s(fx) * s(fy)
}

// ---------- surface patterns ----------
// Each gets the hit's local coordinates { u: around (radians), v: along (−1..1 ellipsoid/box, 0..1 capsule/cone),
// x, y, z: local unit coords } and returns a light offset (about −0.5..0.5). Part or material sets
// pattern: { type, scale, amount }.
export const PATTERNS = {
  /** Cloth folds running along the part (gowns, robes, sleeves, cloaks). */
  folds: (c, s) => {
    const w = Math.sin(c.u * s + 1.6 * Math.sin(c.v * 3 + c.u * 0.7))
    return 0.5 * Math.sign(w) * Math.pow(Math.abs(w), 0.6) - 0.05
  },
  /** One feather (put it on a flattened ellipsoid whose long axis is y): shaft, barbs, darker edges. */
  feather: (c, s) => {
    const ax = Math.abs(c.x)
    if (ax < 0.09 && c.y > -0.85) return 0.32
    return 0.14 * Math.sin((c.y * s - ax * s * 0.6) * Math.PI) - 0.35 * Math.max(0, ax - 0.62) - 0.12 * Math.max(0, -c.y - 0.4)
  },
  /** Hair strands: thin highlights following the length, with a broad sheen band. */
  strands: (c, s) => 0.28 * Math.sin(c.u * s * 2 + c.v * 2 + Math.sin(c.u * 3) * 2) + 0.18 * Math.exp(-((c.v - 0.35) ** 2) * 18),
  /** Armour bands: a dark seam then a bright lip every 1/scale of the length. */
  bands: (c, s) => {
    const f = (((c.v + 1) * s) % 1 + 1) % 1
    return f < 0.12 ? -0.45 : f < 0.24 ? 0.3 : 0
  },
  /** Chain mail / scales: small rows of scallops. */
  scales: (c, s) => {
    const row = Math.floor((c.v + 1) * s), off = row % 2 ? 0.5 : 0
    const fx = ((c.u / Math.PI) * s * 0.5 + off) % 1, fy = ((c.v + 1) * s) % 1
    return 0.3 * (1 - Math.hypot(fx - 0.5, fy * 0.9) * 2) - 0.05
  },
  /** Fur: clumpy noise with a lighter tip. */
  fur: (c, s) => 0.45 * (vnoise(c.u * s, c.v * s * 2) - 0.5) + 0.1 * c.v,
  /** Worn / mottled surface (stone, leather, bark). */
  worn: (c, s) => 0.4 * (vnoise(c.u * s + 7, c.v * s) - 0.5),
  /** Fingers on a hand ellipsoid: three dark gaps across the lower part, knuckle highlights above. */
  fingers: (c, s) => {
    if (c.y > 0.25) return 0.08 * Math.cos(c.x * Math.PI * 2)
    const f = (((c.x + 1) * 2) % 1 + 1) % 1
    return f < 0.14 ? -0.5 : 0.05
  },
  /** Vertical grain (wood, bark). */
  grain: (c, s) => 0.25 * Math.sin(c.u * s * 3 + vnoise(c.v * 4, c.u) * 4)
}

// ---------- primitives ----------
// Ellipsoid (0), capsule (1), box (2), cone (3: capped, radius ra at `at`, rb at `to`), blob (4: smooth union).
function ellipsoidSDF(p, r) {
  const k0 = Math.hypot(p[0] / r[0], p[1] / r[1], p[2] / r[2])
  const k1 = Math.hypot(p[0] / (r[0] * r[0]), p[1] / (r[1] * r[1]), p[2] / (r[2] * r[2]))
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(r[0], r[1], r[2])
}
function blobSDF(q, p) {
  let d = Infinity
  for (const it of q.items) {
    const e = ellipsoidSDF(mtv(it.R, sub(p, it.c)), it.r)
    const k = it.k ?? q.k
    if (d === Infinity) { d = e; continue }
    const h = Math.max(k - Math.abs(d - e), 0) / k
    d = Math.min(d, e) - h * h * k * 0.25
  }
  return d
}
function intersectBlob(q, x, y) {
  let z = q.zf
  for (let i = 0; i < 96 && z > q.zb; i++) {
    const dd = blobSDF(q, [x, y, z])
    if (dd < 0.02) {
      const p = [x, y, z], e = 0.04
      const n = norm([blobSDF(q, [x + e, y, z]) - blobSDF(q, [x - e, y, z]), blobSDF(q, [x, y + e, z]) - blobSDF(q, [x, y - e, z]), blobSDF(q, [x, y, z + e]) - blobSDF(q, [x, y, z - e])])
      const lp = mtv(q.R, sub(p, q.a)), u = [lp[0] / q.r[0], lp[1] / q.r[1], lp[2] / q.r[2]]
      return { z, n, c: { x: u[0], y: u[1], z: u[2], u: Math.atan2(u[0], u[2]), v: u[1] } }
    }
    z -= Math.max(dd * 0.8, 0.01)
  }
  return null
}

function intersect(q, x, y, Z0) {
  if (q.type === 4) return intersectBlob(q, x, y)
  const o = [x, y, Z0], d = [0, 0, -1]
  if (q.type === 0) {
    const lo = mtv(q.R, sub(o, q.c)), ld = mtv(q.R, d)
    const so = [lo[0] / q.r[0], lo[1] / q.r[1], lo[2] / q.r[2]], sd = [ld[0] / q.r[0], ld[1] / q.r[1], ld[2] / q.r[2]]
    const a = dot(sd, sd), b = dot(so, sd), c = dot(so, so) - 1, h = b * b - a * c
    if (h < 0) return null
    const t = (-b - Math.sqrt(h)) / a
    const p = [so[0] + sd[0] * t, so[1] + sd[1] * t, so[2] + sd[2] * t]
    return { z: Z0 - t, n: norm(mv(q.R, [p[0] / q.r[0], p[1] / q.r[1], p[2] / q.r[2]])), c: { x: p[0], y: p[1], z: p[2], u: Math.atan2(p[0], p[2]), v: p[1] } }
  }
  if (q.type === 2) {
    const lo = mtv(q.R, sub(o, q.c)), ld = mtv(q.R, d)
    let tn = -Infinity, tf = Infinity, axis = 0, sign = 1
    for (let k = 0; k < 3; k++) {
      if (Math.abs(ld[k]) < 1e-9) { if (Math.abs(lo[k]) > q.r[k]) return null; continue }
      let t1 = (-q.r[k] - lo[k]) / ld[k], t2 = (q.r[k] - lo[k]) / ld[k], s = -1
      if (t1 > t2) { [t1, t2] = [t2, t1]; s = 1 }
      if (t1 > tn) { tn = t1; axis = k; sign = s }
      if (t2 < tf) tf = t2
      if (tn > tf) return null
    }
    const nl = [0, 0, 0]
    nl[axis] = sign
    const p = [(lo[0] + ld[0] * tn) / q.r[0], (lo[1] + ld[1] * tn) / q.r[1], (lo[2] + ld[2] * tn) / q.r[2]]
    return { z: Z0 - tn, n: norm(mv(q.R, nl)), c: { x: p[0], y: p[1], z: p[2], u: p[0] * Math.PI, v: p[1] } }
  }
  // capsule and cone: solve in camera space, then express the hit in the part's own frame for patterns
  let t = null, n = null
  const ba = sub(q.b, q.a), oa = sub(o, q.a)
  if (q.type === 1) {
    const baba = dot(ba, ba), bard = dot(ba, d), baoa = dot(ba, oa), rdoa = dot(d, oa), oaoa = dot(oa, oa)
    const A = baba - bard * bard, Bq = baba * rdoa - baoa * bard, C = baba * oaoa - baoa * baoa - q.ra * q.ra * baba
    const h = Bq * Bq - A * C
    if (h >= 0 && A > 1e-9) {
      const tt = (-Bq - Math.sqrt(h)) / A, yy = baoa + tt * bard
      if (yy > 0 && yy < baba) t = tt
    }
    if (t === null) {
      for (const e of [q.a, q.b]) {
        const oc = sub(o, e), b2 = dot(d, oc), c2 = dot(oc, oc) - q.ra * q.ra, h2 = b2 * b2 - c2
        if (h2 > 0) { const tt = -b2 - Math.sqrt(h2); if (t === null || tt < t) t = tt }
      }
      if (t === null) return null
    }
    const p = [o[0], o[1], o[2] - t]
    const k = clamp(dot(sub(p, q.a), ba) / baba, 0, 1)
    n = norm(sub(p, add(q.a, [ba[0] * k, ba[1] * k, ba[2] * k])))
  } else {
    // capped cone (Inigo Quilez)
    const ob = sub(o, q.b)
    const m0 = dot(ba, ba), m1 = dot(oa, ba), m2 = dot(d, ba), m3 = dot(d, oa), m5 = dot(oa, oa), m9 = dot(ob, ba)
    const dot2 = (v) => dot(v, v)
    if (m1 < 0) {
      if (dot2(sub([oa[0] * m2, oa[1] * m2, oa[2] * m2], [d[0] * m1, d[1] * m1, d[2] * m1])) < q.ra * q.ra * m2 * m2) { t = -m1 / m2; n = norm([-ba[0], -ba[1], -ba[2]]) }
    } else if (m9 > 0) {
      const tt = -m9 / m2
      if (dot2(add(ob, [d[0] * tt, d[1] * tt, d[2] * tt])) < q.rb * q.rb) { t = tt; n = norm(ba) }
    }
    if (t === null) {
      const rr = q.ra - q.rb, hy = m0 + rr * rr
      const k2 = m0 * m0 - m2 * m2 * hy
      const k1 = m0 * m0 * m3 - m1 * m2 * hy + m0 * q.ra * (rr * m2)
      const k0 = m0 * m0 * m5 - m1 * m1 * hy + m0 * q.ra * (rr * m1 * 2 - m0 * q.ra)
      const h = k1 * k1 - k2 * k0
      if (h < 0) return null
      const tt = (-k1 - Math.sqrt(h)) / k2, yy = m1 + tt * m2
      if (yy < 0 || yy > m0) return null
      t = tt
      const ot = add(oa, [d[0] * t, d[1] * t, d[2] * t])
      n = norm(sub([ot[0] * m0 * m0 + rr * ba[0] * q.ra * m0, ot[1] * m0 * m0 + rr * ba[1] * q.ra * m0, ot[2] * m0 * m0 + rr * ba[2] * q.ra * m0], [ba[0] * hy * yy, ba[1] * hy * yy, ba[2] * hy * yy]))
    }
  }
  const p = [o[0], o[1], o[2] - t]
  // local frame: the part's rotation (bone ∘ part rot); v along the axis, u around it
  const lp = mtv(q.R, sub(p, q.a)), la = mtv(q.R, ba)
  const L = len(la) || 1, ax = [la[0] / L, la[1] / L, la[2] / L]
  const v = clamp(dot(lp, ax) / L, 0, 1)
  const rad = sub(lp, [ax[0] * v * L, ax[1] * v * L, ax[2] * v * L])
  // a stable perpendicular basis
  const ref = Math.abs(ax[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
  const e1 = norm([ax[1] * ref[2] - ax[2] * ref[1], ax[2] * ref[0] - ax[0] * ref[2], ax[0] * ref[1] - ax[1] * ref[0]])
  const e2 = [ax[1] * e1[2] - ax[2] * e1[1], ax[2] * e1[0] - ax[0] * e1[2], ax[0] * e1[1] - ax[1] * e1[0]]
  const u = Math.atan2(dot(rad, e1), dot(rad, e2))
  return { z: p[2], n, c: { x: Math.sin(u), y: v * 2 - 1, z: Math.cos(u), u, v } }
}

// ---------- render ----------

const EMPTY = -1

/**
 * Render a model in high detail. Options as pixelforge.render plus:
 *   ss: supersampling (3 is the sweet spot; 4 for the cleanest curves), ao: crevice occlusion 0..0.6,
 *   rim: rim-light strength, lines: inner-line colour step (1 = soft, 0 = hard),
 *   lineArt: also draw a 1-px line wherever two materials meet (gold on cloth, skin on hair), on the darker /
 *   farther side, like hand-drawn pixel line art (default true; false for a softer, painted look),
 *   points: names of model.points to project → returned as pixel coords (for effects: sword tip, staff gem).
 * Materials (model({ materials })) take, beyond base: steps (default 7), hueShift, spec (0..1, metal ≈ 0.6),
 *   gloss (8–60), rim (multiplier), wrap (0–1: soft terminator for skin and cloth), blend (no line art against
 *   neighbours: blush, lips, tattoos, dirt), emissive (true: unlit, no outline: flames, halos, gems), pattern, outline (false).
 * Shapes: ellipsoid, capsule, box, cone, and blob: { shape: 'blob', k, items: [{ at, r, rot, k? }] }, ellipsoids
 *   melted together with blend radius k (an item's own k overrides it, small k keeps a feature crisp).
 * Parts take pattern / trim overrides: pattern: { type, scale, amount }, trim: { mat, width, at: 'end' | 'start' | 'both' | 'edge' },
 *   and paint(pointInBoneSpace, normal) → { mat?, light? } for painted detail (see figure.js facepainter).
 * Returns { canvas, points }.
 */
export function renderHD(m, { size = 128, scale = 1, dir = 'south', view = 'low top-down', pose = {}, ground, shadow = true, ss = 3, ao = 0.45, rim = 0.55, lines = 1, lineArt = true, light = [-0.55, 0.7, 0.45], points = [] } = {}) {
  const [W, H] = Array.isArray(size) ? size : [size, size]
  const yaw = ((typeof dir === 'number' ? dir : DIRS[dir]) * Math.PI) / 180
  const pitch = ((VIEWS[view] ?? view) * Math.PI) / 180
  const cam = mm(rotX(pitch), rotY(yaw))
  const gy = ground ?? Math.round(H * 0.92)
  const L = norm(light)
  const Hh = norm([L[0], L[1], L[2] + 1]) // Blinn half vector (viewer at +z)
  const B = solve(m.bones, pose)
  const matNames = Object.keys(m.mats)
  const mats = matNames.map((k) => {
    const s = m.mats[k]
    return { ...s, steps: s.steps || 7, ramp: s.ramp || ramp(s.base, s.steps || 7, { hueShift: s.hueShift ?? 24, spread: s.spread ?? 0.62, sat: s.sat ?? 0.1 }) }
  })
  const mi = (name) => {
    const i = matNames.indexOf(name)
    if (i < 0) throw new Error(`hd: unknown material ${name}`)
    return i
  }

  const prims = []
  for (const p of m.parts) {
    const b = B[p.bone]
    if (!b) continue
    const R = mm(cam, mm(b.R, euler(p.rot)))
    const toCam = (v) => mv(cam, add(b.P, mv(b.R, v)))
    const mat = mi(p.mat)
    const pat = p.pattern || mats[mat].pattern || null
    const base = { mat, R, pat: pat ? { f: PATTERNS[pat.type], s: pat.scale ?? 6, a: pat.amount ?? 1 } : null, trim: p.trim ? { ...p.trim, mat: mi(p.trim.mat) } : null,
      paint: p.paint || null, RB: mm(cam, b.R), O: mv(cam, b.P) }
    if (p.shape === 'blob') {
      // several ellipsoids melted into one smooth surface (smooth-min of their distance fields): heads,
      // hands, creature bodies, anything that must not show creases where its parts meet
      const items = p.items.map((it) => {
        const c = toCam(it.at), R2 = mm(cam, mm(b.R, euler(it.rot)))
        return { c, R: R2, r: it.r, k: it.k, ext: Math.max(it.r[0], it.r[1], it.r[2]) }
      })
      const k = p.k ?? 1
      const bound = [Infinity, -Infinity, Infinity, -Infinity]
      let zf = -Infinity, zb = Infinity
      for (const it of items) {
        bound[0] = Math.min(bound[0], it.c[0] - it.ext - k); bound[1] = Math.max(bound[1], it.c[0] + it.ext + k)
        bound[2] = Math.min(bound[2], it.c[1] - it.ext - k); bound[3] = Math.max(bound[3], it.c[1] + it.ext + k)
        zf = Math.max(zf, it.c[2] + it.ext + k); zb = Math.min(zb, it.c[2] - it.ext - k)
      }
      prims.push({ ...base, type: 4, items, k, zf, zb, a: items[0].c, R: items[0].R, r: items[0].r, bound })
      continue
    }
    if (p.shape === 'capsule' || p.shape === 'cone') {
      const a = toCam(p.at), c = toCam(p.to)
      const ra = p.shape === 'cone' ? p.r[0] : p.r, rb = p.shape === 'cone' ? p.r[1] : p.r
      const e = Math.max(ra, rb)
      prims.push({ ...base, type: p.shape === 'cone' ? 3 : 1, a, b: c, ra, rb, bound: [Math.min(a[0], c[0]) - e, Math.max(a[0], c[0]) + e, Math.min(a[1], c[1]) - e, Math.max(a[1], c[1]) + e] })
    } else {
      const c = toCam(p.at || [0, 0, 0])
      const r = p.shape === 'box' ? p.size : p.r
      const ext = p.shape === 'box' ? Math.hypot(r[0], r[1], r[2]) : Math.max(r[0], r[1], r[2])
      prims.push({ ...base, type: p.shape === 'box' ? 2 : 0, c, r, a: c, bound: [c[0] - ext, c[0] + ext, c[1] - ext, c[1] + ext] })
    }
  }

  // 1. shade at ss× resolution
  const SW = W * ss, SH = H * ss, SN = SW * SH
  const sDepth = new Float32Array(SN).fill(-Infinity)
  const sMat = new Int16Array(SN).fill(EMPTY)
  const sLight = new Float32Array(SN)
  const Z0 = 1e4
  const k = scale * ss
  for (let py = 0; py < SH; py++) {
    const y = (gy * ss - py - 0.5) / k
    for (let px = 0; px < SW; px++) {
      const x = (px + 0.5 - (W * ss) / 2) / k
      let best = null, bq = null
      for (const q of prims) {
        if (x < q.bound[0] || x > q.bound[1] || y < q.bound[2] || y > q.bound[3]) continue
        const hit = intersect(q, x, y, Z0)
        if (hit && (!best || hit.z > best.z)) { best = hit; bq = q }
      }
      if (!best) continue
      const i = py * SW + px
      let mat = bq.mat
      if (bq.trim) {
        const w = bq.trim.width ?? 0.12, v = bq.type === 1 || bq.type === 3 ? best.c.v : (best.c.v + 1) / 2
        const at = bq.trim.at || 'end'
        if (((at === 'end' || at === 'both') && v > 1 - w) || ((at === 'start' || at === 'both') && v < w) || (at === 'edge' && Math.abs(best.c.x) > 1 - w)) mat = bq.trim.mat
      }
      // paint: features painted in the bone's own space (faces, tattoos, emblems, scars), so they turn with
      // the part in every direction. paint([x, y, z] in bone units, normal) → { mat?, light? } | null
      let paintLight = 0
      if (bq.paint) {
        const pr = bq.paint(mtv(bq.RB, sub([x, y, best.z], bq.O)), best.n)
        if (pr) { if (pr.mat) mat = mi(pr.mat); paintLight = pr.light || 0 }
      }
      const M = mats[mat], n = best.n
      let s
      if (M.emissive) s = 0.75 + (bq.pat ? bq.pat.f(best.c, bq.pat.s) * bq.pat.a : 0)
      else {
        // wrap lighting: skin and cloth scatter light, so the terminator is soft instead of a hard split
        const wrap = M.wrap ?? 0
        const diff = Math.max(0, (dot(n, L) + wrap) / (1 + wrap))
        const fill = 0.5 + 0.5 * n[1] // sky fill from above
        const spec = (M.spec || 0) * Math.pow(Math.max(0, dot(n, Hh)), M.gloss || 24)
        const rimT = rim * (M.rim ?? 1) * Math.pow(1 - Math.max(0, n[2]), 3) * Math.max(0, 0.35 + n[0] * 0.65)
        s = 0.86 * diff + 0.12 * fill + spec + rimT
        if (bq.pat) s += bq.pat.f(best.c, bq.pat.s) * bq.pat.a * 0.6
        s += paintLight
      }
      sDepth[i] = best.z
      sMat[i] = mat
      sLight[i] = s
    }
  }
  // 2. crevice occlusion from the depth buffer (things right in front of a pixel darken it)
  if (ao > 0) {
    const R1 = Math.round(1.5 * ss), R2 = Math.round(3.5 * ss), thr = 1.2 / scale
    const offs = [[R1, 0], [-R1, 0], [0, R1], [0, -R1], [R2, R2], [-R2, R2], [R2, -R2], [-R2, -R2]]
    const occ = new Float32Array(SN)
    for (let py = 0; py < SH; py++) for (let px = 0; px < SW; px++) {
      const i = py * SW + px
      if (sMat[i] < 0 || mats[sMat[i]].emissive) continue
      let c = 0
      for (const [dx, dy] of offs) {
        const X = px + dx, Y = py + dy
        if (X < 0 || Y < 0 || X >= SW || Y >= SH) continue
        const j = Y * SW + X
        if (sMat[j] >= 0 && sDepth[j] - sDepth[i] > thr) c++
      }
      occ[i] = c / offs.length
    }
    for (let i = 0; i < SN; i++) sLight[i] -= ao * occ[i]
  }

  // 3. downsample: majority material per pixel, averaged light and depth, coverage
  const N = W * H
  const mat = new Int16Array(N).fill(EMPTY), lightP = new Float32Array(N), depth = new Float32Array(N).fill(-Infinity)
  const counts = new Map()
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    counts.clear()
    let covered = 0
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const j = (py * ss + sy) * SW + px * ss + sx
      if (sMat[j] < 0) continue
      covered++
      const e = counts.get(sMat[j]) || { n: 0, l: 0, d: 0 }
      e.n++; e.l += sLight[j]; e.d = Math.max(e.d === 0 ? -Infinity : e.d, sDepth[j])
      counts.set(sMat[j], e)
    }
    if (covered * 2 < ss * ss) continue
    // majority material wins, except small details (decals: eyes, studs, emblems) win with ≥ 2 subsamples,
    // so they survive the shrink instead of being averaged away
    let bm = -1, be = null
    for (const [mk, e] of counts) if (!be || e.n > be.n) { bm = mk; be = e }
    for (const [mk, e] of counts) if (mats[mk].decal && e.n >= 2) { bm = mk; be = e }
    const i = py * W + px
    mat[i] = bm
    lightP[i] = be.l / be.n
    depth[i] = be.d
  }

  // 4. quantise to ramps (step 0 is reserved for lines), clean orphans
  const idx = new Int8Array(N).fill(-1)
  for (let i = 0; i < N; i++) {
    if (mat[i] < 0) continue
    const st = mats[mat[i]].steps
    idx[i] = clamp(Math.round(clamp(lightP[i], 0, 1.1) / 1.1 * (st - 2)) + 1, 1, st - 1)
  }
  const nb = [-1, 1, -W, W]
  const inside = (i, d) => { const px = i % W, j = i + d; return j >= 0 && j < N && !(d === -1 && px === 0) && !(d === 1 && px === W - 1) }
  for (let i = 0; i < N; i++) {
    if (idx[i] < 0) continue
    let agree = -2, ok = true
    for (const d of nb) {
      if (!inside(i, d) || mat[i + d] !== mat[i]) { ok = false; break }
      if (agree === -2) agree = idx[i + d]
      else if (agree !== idx[i + d]) { ok = false; break }
    }
    if (ok && Math.abs(agree - idx[i]) > 0) idx[i] = agree
  }
  // inner lines where one part sits clearly in front of another
  const thr = 1.6 / scale
  const line = new Uint8Array(N)
  for (let i = 0; i < N; i++) {
    if (idx[i] < 0 || mats[mat[i]].emissive || mats[mat[i]].decal) continue
    for (const d of nb) {
      if (!inside(i, d) || idx[i + d] < 0) continue
      const j = i + d
      if (depth[j] - depth[i] > thr && mat[j] !== mat[i] && !mats[mat[j]].decal) { line[i] = 1; break }
      // line art: material boundaries get a line on one side only (the darker material, or below/right on a tie)
      if (lineArt && mat[j] !== mat[i] && !mats[mat[j]].decal && !mats[mat[j]].emissive && !mats[mat[j]].blend && !mats[mat[i]].blend) {
        const li = lightP[i], lj = lightP[j]
        const mine = Math.abs(depth[j] - depth[i]) <= thr ? (li < lj - 0.02 || (Math.abs(li - lj) <= 0.02 && (d === -1 || d === -W))) : depth[i] < depth[j]
        if (mine) { line[i] = 1; break }
      }
    }
  }

  // 5. write pixels, outline, shadow
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(W, H)
  const D = img.data
  const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
  const cache = new Map()
  const col = (mk, k2) => { const key = mk * 16 + k2; if (!cache.has(key)) cache.set(key, rgb(mats[mk].ramp[k2])); return cache.get(key) }
  const put = (i, c, a = 255) => { D[i * 4] = c[0]; D[i * 4 + 1] = c[1]; D[i * 4 + 2] = c[2]; D[i * 4 + 3] = a }
  if (shadow) {
    // sized once per model from the feet (bottom rows of the first frame rendered), then kept, so it doesn't
    // pulse as weapons and capes swing through those rows; centred under the root
    if (!m.__shadowRx) {
      let minX = W, maxX = 0
      for (let y = Math.max(0, gy - Math.round(H * 0.1)); y < Math.min(H, gy + 2); y++) for (let x = 0; x < W; x++) if (idx[y * W + x] >= 0) { minX = Math.min(minX, x); maxX = Math.max(maxX, x) }
      m.__shadowRx = maxX < minX ? 8 : Math.max(5, Math.round((maxX - minX) * 0.7))
    }
    const rx = typeof shadow === 'number' ? shadow : m.__shadowRx, ry = Math.max(2, Math.round(rx * 0.3))
    const minX = W / 2, maxX = W / 2
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
      const e = (x * x) / (rx * rx) + (y * y) / (ry * ry)
      if (e > 1) continue
      const px = Math.round((minX + maxX) / 2 + x), py = gy + y - 1
      if (px >= 0 && px < W && py >= 0 && py < H) put(py * W + px, [20, 14, 30], e < 0.45 ? 110 : 70)
    }
  }
  for (let i = 0; i < N; i++) if (idx[i] >= 0) put(i, line[i] ? col(mat[i], Math.min(lines, idx[i])) : col(mat[i], idx[i]))
  const out = []
  for (let i = 0; i < N; i++) {
    if (idx[i] >= 0) continue
    for (const d of nb) {
      if (!inside(i, d) || idx[i + d] < 0) continue
      const mk = mat[i + d]
      if (mats[mk].emissive || mats[mk].outline === false) continue
      // a decal at the silhouette (an eye white at the cheek edge) must not lend its colour to the outline
      if (mats[mk].decal) { out.push([i, rgb(m.outlineColor || '#16101e')]); break }
      // the lit (top / left) edge gets a lighter outline, the rest the darkest step: a "broken" outline
      out.push([i, col(mk, d === W || d === 1 ? 1 : 0)])
      break
    }
  }
  for (const [i, c] of out) put(i, c)
  ctx.putImageData(img, 0, 0)

  // project named points (model.points: { name: { bone, at } }) for effects
  const pts = {}
  for (const name of points) {
    const P = m.points?.[name]
    if (!P || !B[P.bone]) continue
    const w = mv(cam, add(B[P.bone].P, mv(B[P.bone].R, P.at)))
    pts[name] = [W / 2 + w[0] * scale, gy - w[1] * scale, w[2]] // x, y in pixels; z = depth (larger = nearer)
  }
  // depth per pixel lets effects hide behind the body (fx.flame's occlude option)
  return { canvas, points: pts, depth, scale }
}

/** Bake an HD sheet: rows = directions, columns = frames per animation (like pixelforge.sheet). */
export function sheetHD(m, { size = 128, scale = 1, view = 'low top-down', dirs, anims, templates, ss = 3, fx = null, ...opts } = {}) {
  const [W, H] = Array.isArray(size) ? size : [size, size]
  const layout = {}
  let col = 0
  for (const a of anims) { const t = templates[a]; layout[a] = { start: col, frames: t.frames, fps: t.fps, loop: t.loop }; col += t.frames }
  const canvas = document.createElement('canvas')
  canvas.width = W * col
  canvas.height = H * dirs.length
  const ctx = canvas.getContext('2d')
  dirs.forEach((d, row) => {
    for (const a of anims) {
      const t = templates[a], Lo = layout[a]
      for (let f = 0; f < t.frames; f++) {
        const phase = t.loop ? f / t.frames : f / Math.max(1, t.frames - 1)
        const r = renderHD(m, { size, scale, dir: d, view, pose: t.pose(phase), ss, ...opts })
        if (fx) fx(r, { dir: d, anim: a, frame: f, phase })
        ctx.drawImage(r.canvas, (Lo.start + f) * W, row * H)
      }
    }
  })
  return { canvas, cell: [W, H], dirs, anims: layout }
}
