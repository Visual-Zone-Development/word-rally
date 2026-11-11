// Sculpting toolkit for models built in code (from the threejs-models skill): lofted bodies, extruded plates,
// horns, armour shells, fur rolls and hand-painted canvas textures. Unit files register their parts
// and materials by name (registerShapes / registerMaterials); rig.js instances them like primitives.
import * as THREE from 'three'
import { painted } from './rig.js'

/**
 * Loft elliptical cross-sections along y into a closed mesh. sections: [y, rx, rz, dz?, dx?].
 * u runs around (0 = back, 0.5 = front), v from the first section to the last, so textures can be
 * painted with the front in the middle.
 */
export function loft(sections, segments = 14) {
  const pos = []
  const uv = []
  const idx = []
  const y0 = sections[0][0]
  const y1 = sections.at(-1)[0]
  for (let i = 0; i < sections.length; i++) {
    const [y, rx, rz, dz = 0, dx = 0, flat = 0] = sections[i]
    for (let j = 0; j <= segments; j++) {
      const a = (j / segments) * Math.PI * 2
      let sx = Math.sin(a)
      let cz = -Math.cos(a)
      // flat > 0 squares the section off (boxier chests, jaws)
      if (flat) {
        const m = Math.max(Math.abs(sx), Math.abs(cz))
        sx = sx * (1 - flat) + (sx / m) * flat * 0.86
        cz = cz * (1 - flat) + (cz / m) * flat * 0.86
      }
      pos.push(dx + sx * rx, y, dz + cz * rz)
      uv.push(j / segments, (y - y0) / (y1 - y0 || 1))
    }
  }
  const row = segments + 1
  for (let i = 0; i < sections.length - 1; i++)
    for (let j = 0; j < segments; j++) {
      const a = i * row + j
      const b = a + row
      idx.push(a, b, a + 1, a + 1, b, b + 1)
    }
  // caps
  for (const [i, flip] of [[0, true], [sections.length - 1, false]]) {
    const [y, , , dz = 0, dx = 0] = sections[i]
    const c = pos.length / 3
    pos.push(dx, y, dz)
    uv.push(0.5, i === 0 ? 0 : 1)
    for (let j = 0; j < segments; j++) {
      const a = i * row + j
      flip ? idx.push(c, a + 1, a) : idx.push(c, a, a + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** Extrude a 2D outline (in x-y) into a bevelled plate of thickness t, centred on z = 0. */
export function plate(points, t, bevel = 0.012) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)))
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 6 })
  g.translate(0, 0, -t / 2)
  // planar UVs so painted textures map front-on
  g.computeBoundingBox()
  const bb = g.boundingBox
  const p = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y))
  g.computeVertexNormals()
  return g
}

/** A horn or tusk: a cone bent along an arc. */
export function hornGeo(len, r, bend, seg = 6) {
  const pts = []
  for (let i = 0; i <= 8; i++) {
    const t = i / 8
    pts.push(new THREE.Vector3(0, t * len, Math.sin(t * bend) * len * 0.35))
  }
  const curve = new THREE.CatmullRomCurve3(pts)
  const g = new THREE.TubeGeometry(curve, 8, r, seg, false)
  // taper to a point
  const p = g.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    const ring = Math.floor(i / (seg + 1))
    const t = ring / 8
    const c = curve.getPoint(t)
    v.fromBufferAttribute(p, i).sub(c).multiplyScalar(1 - t * 0.92).add(c)
    p.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  return g
}

/**
 * A rounded-rectangle armour shell (pauldrons, plates): a squarish dome W wide (x), D deep (z), H high,
 * open underneath (draw with a DoubleSide material). UVs span the footprint.
 */
export function shell(W, D, H, seg = 14) {
  const pos = []
  const uv = []
  const idx = []
  for (let j = 0; j <= seg; j++)
    for (let i = 0; i <= seg; i++) {
      let u = -1 + (2 * i) / seg
      let v = -1 + (2 * j) / seg
      const n = Math.pow(Math.pow(Math.abs(u), 4) + Math.pow(Math.abs(v), 4), 0.25)
      if (n > 1) {
        u /= n
        v /= n
      }
      const r = Math.min(1, Math.pow(Math.pow(Math.abs(u), 4) + Math.pow(Math.abs(v), 4), 0.25))
      pos.push((u * W) / 2, H * (1 - Math.pow(r, 2.6)), (v * D) / 2)
      uv.push((u + 1) / 2, (v + 1) / 2)
    }
  for (let j = 0; j < seg; j++)
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i
      idx.push(a, a + seg + 1, a + 1, a + 1, a + seg + 1, a + seg + 2)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** The rolled steel rim around a shell's edge. */
export function shellRim(W, D, r) {
  const pts = []
  for (let i = 0; i < 48; i++) {
    const t = (i / 48) * Math.PI * 2
    const c = Math.cos(t)
    const s = Math.sin(t)
    pts.push(new THREE.Vector3((Math.sign(c) * Math.sqrt(Math.abs(c)) * W) / 2, 0, (Math.sign(s) * Math.sqrt(Math.abs(s)) * D) / 2))
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 48, r, 6, true)
}

/** A clumpy fur roll (collars, knee wraps, cuffs): a torus pushed in and out by noise. Lies in x-z. */
export function furRoll(R, r) {
  const g = new THREE.TorusGeometry(R, r, 8, 22)
  g.rotateX(Math.PI / 2)
  const p = g.attributes.position
  const n = g.attributes.normal
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const a = Math.atan2(z, x)
    const k = 1 + 0.28 * Math.sin(a * 9 + y * 30) * Math.cos(a * 5 - y * 20)
    const ox = n.getX(i) * r * (k - 1)
    const oy = n.getY(i) * r * (k - 1)
    const oz = n.getZ(i) * r * (k - 1)
    p.setXYZ(i, x + ox, y + oy, z + oz)
  }
  g.computeVertexNormals()
  return g
}

// ---------- hand-painted textures ----------

export function canvas(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}
let seed = 101
/** Seeded random for painting, so textures look the same every load. */
export const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
export const grad = (g, x0, y0, x1, y1, stops) => {
  const gr = g.createLinearGradient(x0, y0, x1, y1)
  stops.forEach(([o, c]) => gr.addColorStop(o, c))
  return gr
}
export const blob = (g, x, y, rx, ry, color, a = 1) => {
  g.save()
  g.globalAlpha = a
  g.translate(x, y)
  g.scale(rx, ry)
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1)
  gr.addColorStop(0, color)
  gr.addColorStop(1, color.length === 7 ? color + '00' : 'rgba(0,0,0,0)')
  g.fillStyle = gr
  g.fillRect(-1, -1, 2, 2)
  g.restore()
}

/** Orc skin over the torso: u around (front at 0.5), v up. Painted pecs, abs, ribs and shading. */
export function pantsTexture(base = '#6a4426') {
  return canvas(128, 128, (g, W, H) => {
    g.fillStyle = grad(g, 0, 0, W, 0, [[0, '#4a2e18'], [0.5, base], [1, '#4a2e18']])
    g.fillRect(0, 0, W, H)
    g.strokeStyle = 'rgba(40,22,10,0.35)'
    g.lineWidth = 3
    for (let i = 0; i < 9; i++) {
      const y = rnd() * H
      g.beginPath()
      g.moveTo(W * 0.3 + rnd() * 20, y)
      g.quadraticCurveTo(W * 0.5, y + 10, W * 0.7 - rnd() * 20, y + 2)
      g.stroke()
    }
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '40,22,10' : '190,140,90'},${rnd() * 0.12})`
      g.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 4, 1)
    }
  })
}

export function leatherTexture(base = '#8a5a30') {
  return canvas(128, 128, (g, W, H) => {
    g.fillStyle = base
    g.fillRect(0, 0, W, H)
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '60,30,10' : '200,150,100'},${rnd() * 0.15})`
      g.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 6, 1 + rnd() * 2)
    }
    // wrapped bands with stitching
    g.strokeStyle = 'rgba(40,20,8,0.35)'
    g.lineWidth = 2
    for (let y = 8; y < H; y += 30) {
      g.beginPath()
      g.moveTo(0, y)
      g.lineTo(W, y + 6)
      g.stroke()
      g.fillStyle = 'rgba(230,200,150,0.7)'
      for (let x = 4; x < W; x += 10) g.fillRect(x, y + 4 + x * 0.05, 4, 1.5)
    }
  })
}

export function metalTexture(base = '#7c828c') {
  return canvas(128, 128, (g, W, H) => {
    // painted metal: bright top band, dark bottom, scratches and rivets
    g.fillStyle = grad(g, 0, 0, 0, H, [[0, '#d8dee6'], [0.35, base], [0.8, '#4a4e56'], [1, '#33363c']])
    g.fillRect(0, 0, W, H)
    g.strokeStyle = 'rgba(255,255,255,0.35)'
    g.lineWidth = 1
    for (let i = 0; i < 30; i++) {
      const x = rnd() * W
      const y = rnd() * H
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + (rnd() - 0.5) * 14, y + (rnd() - 0.5) * 6)
      g.stroke()
    }
    for (let x = 8; x < W; x += 16) {
      g.fillStyle = '#2a2c30'
      g.beginPath()
      g.arc(x, H * 0.82, 3.2, 0, 7)
      g.fill()
      g.fillStyle = '#e8eef4'
      g.beginPath()
      g.arc(x - 1, H * 0.82 - 1, 1.3, 0, 7)
      g.fill()
    }
  })
}

/** Armour plate face, painted in greys so the team colour tints it: highlight, edge shade, rivets. */
export function plateTexture() {
  return canvas(128, 128, (g, W, H) => {
    const gr = g.createRadialGradient(W * 0.45, H * 0.4, 4, W / 2, H / 2, W * 0.7)
    gr.addColorStop(0, '#ffffff')
    gr.addColorStop(0.55, '#d8d8d8')
    gr.addColorStop(1, '#7a7a7a')
    g.fillStyle = gr
    g.fillRect(0, 0, W, H)
    // rivets along the edge
    // a steel band just inside the rim, with a few rivets on it (painted near-white so the team tint stays light)
    g.strokeStyle = '#f4f4f4'
    g.lineWidth = 9
    g.beginPath()
    g.roundRect(9, 9, W - 18, H - 18, 26)
    g.stroke()
    for (const [x, y] of [[20, 20], [W - 20, 20], [20, H - 20], [W - 20, H - 20], [W / 2, 13], [W / 2, H - 13]]) {
      g.fillStyle = '#9a9a9a'
      g.beginPath()
      g.arc(x, y, 4, 0, 7)
      g.fill()
      g.fillStyle = '#ffffff'
      g.beginPath()
      g.arc(x - 1.2, y - 1.2, 1.6, 0, 7)
      g.fill()
    }
    // a few dents
    g.strokeStyle = 'rgba(60,60,60,0.35)'
    g.lineWidth = 2
    for (let i = 0; i < 6; i++) {
      const x = W * (0.3 + rnd() * 0.4)
      const y = H * (0.3 + rnd() * 0.4)
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + 8, y + 3)
      g.stroke()
    }
  })
}

export function furTexture() {
  return canvas(128, 64, (g, W, H) => {
    g.fillStyle = '#b8b2a8'
    g.fillRect(0, 0, W, H)
    for (let i = 0; i < 500; i++) {
      const x = rnd() * W
      const y = rnd() * H
      const v = rnd() < 0.5 ? '#ece6dc' : '#7a746a'
      g.strokeStyle = v
      g.globalAlpha = 0.6
      g.lineWidth = 1.5
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + (rnd() - 0.5) * 4, y + 4 + rnd() * 6)
      g.stroke()
    }
    g.globalAlpha = 1
  })
}

export function stripTexture() {
  return canvas(64, 128, (g, W, H) => {
    g.fillStyle = grad(g, 0, 0, 0, H, [[0, '#d8b070'], [0.7, '#b88a48'], [1, '#7a5428']])
    g.fillRect(0, 0, W, H)
    g.strokeStyle = 'rgba(90,60,24,0.5)'
    g.lineWidth = 2
    for (let x = 6; x < W; x += 14) {
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x + 2, H)
      g.stroke()
    }
    // furry hem
    for (let i = 0; i < 80; i++) {
      g.strokeStyle = rnd() < 0.5 ? '#e8d8b0' : '#6a4a22'
      const x = rnd() * W
      g.beginPath()
      g.moveTo(x, H - 30 + rnd() * 10)
      g.lineTo(x + (rnd() - 0.5) * 4, H)
      g.stroke()
    }
  })
}

export function hairTexture() {
  return canvas(64, 64, (g, W, H) => {
    g.fillStyle = '#1c1a1a'
    g.fillRect(0, 0, W, H)
    g.strokeStyle = 'rgba(120,110,110,0.5)'
    for (let i = 0; i < 40; i++) {
      const x = rnd() * W
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x + (rnd() - 0.5) * 8, H)
      g.stroke()
    }
  })
}

export function bladeTexture() {
  return canvas(128, 128, (g, W, H) => {
    g.fillStyle = grad(g, 0, 0, W, 0, [[0, '#5a6068'], [0.6, '#a8b0ba'], [0.86, '#eef4fa'], [1, '#ffffff']])
    g.fillRect(0, 0, W, H)
    g.strokeStyle = 'rgba(40,40,46,0.6)'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(W * 0.62, 6)
    g.quadraticCurveTo(W * 0.5, H / 2, W * 0.62, H - 6)
    g.stroke()
    for (let i = 0; i < 12; i++) {
      g.fillStyle = 'rgba(40,30,30,0.35)'
      g.fillRect(rnd() * W * 0.5, rnd() * H, 3, 2)
    }
  })
}

// ---------- registry: shapes and materials by name, built on first use ----------

const SHAPES = {}
const MATERIALS = {}
const builtShapes = {}
const builtMaterials = {}

/** Register named geometry factories, e.g. { 'orc.torso': () => loft([...]) }. Prefix names with the asset. */
export function registerShapes(map) {
  Object.assign(SHAPES, map)
}
/** Register named material factories, e.g. { 'orc.skin': () => texturedMaterial(skinTexture()) }. */
export function registerMaterials(map) {
  Object.assign(MATERIALS, map)
}
export const isSculpted = (name) => name in SHAPES
export function sculptGeometry(name) {
  if (!SHAPES[name]) throw new Error(`no sculpted shape ${name}`)
  return (builtShapes[name] ??= SHAPES[name]())
}
export function sculptMaterial(name) {
  if (!MATERIALS[name]) throw new Error(`no material ${name}`)
  return (builtMaterials[name] ??= MATERIALS[name]())
}

/** A painted-texture material with Warcraft-style top lighting. */
export function texturedMaterial(map, { rough = 0.75, metal = 0, side = THREE.FrontSide, color = '#ffffff', strength = 0.8 } = {}) {
  return painted(new THREE.MeshStandardMaterial({ map, color, roughness: rough, metalness: metal, side }), strength)
}

/** Shared materials every asset can use, so a game's metal, fur and leather look the same everywhere. */
registerMaterials({
  'common.leather': () => texturedMaterial(leatherTexture(), { rough: 0.85 }),
  'common.darkleather': () => texturedMaterial(leatherTexture('#5a3a22'), { rough: 0.85 }),
  'common.pants': () => texturedMaterial(pantsTexture(), { rough: 0.9 }),
  'common.metal': () => texturedMaterial(metalTexture(), { rough: 0.38, metal: 0.45 }),
  'common.steel': () => painted(new THREE.MeshStandardMaterial({ color: '#c8ced6', roughness: 0.3, metalness: 0.55 }), 0.8),
  'common.plate': () => texturedMaterial(plateTexture(), { rough: 0.55, metal: 0.15, side: THREE.DoubleSide }),
  'common.fur': () => texturedMaterial(furTexture(), { rough: 1 }),
  'common.strip': () => texturedMaterial(stripTexture(), { rough: 0.9 }),
  'common.hair': () => texturedMaterial(hairTexture(), { rough: 0.9 }),
  'common.blade': () => texturedMaterial(bladeTexture(), { rough: 0.25, metal: 0.6 })
})
