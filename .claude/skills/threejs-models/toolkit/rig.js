// Procedural models (toolkit from the threejs-models skill): every character, beast and
// engine is a set of parts on a small skeleton, posed in code each frame. Animations blend smoothly
// (idle ↔ walk/run, attack, cast, hit, die) and follow the principles in the animate-asset skill:
// anticipation, follow-through, overlapping action, weight, and per-unit variation.
// All parts of all units are drawn through a handful of InstancedMeshes (one per shape × material),
// so hundreds of units cost ~15–30 draw calls.
import * as THREE from 'three'
import { sculptGeometry, sculptMaterial, isSculpted } from './sculpt.js'

/**
 * Warcraft-style "hand-painted" shading: tops are lit and warm, undersides fall off into shade,
 * as if light were painted into the texture. Applied on top of normal lighting.
 */
export function painted(material, strength = 1) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      float up = dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
      diffuseColor.rgb *= mix(1.0, 0.78 + 0.34 * up, ${strength.toFixed(2)});`
    )
  }
  return material
}

/** Unit-sized geometries. Parts scale them with their size [x, y, z]. */
function makeShapes() {
  const taper = new THREE.CylinderGeometry(0.36, 0.5, 1, 4, 1)
  taper.rotateY(Math.PI / 4)
  const wedge = new THREE.CylinderGeometry(0.5, 0.5, 1, 3, 1)
  wedge.rotateZ(Math.PI / 2)
  // a leaf-shaped blade: long in y, wide in x, thin in z
  const blade = new THREE.CylinderGeometry(0.5, 0.5, 1, 4, 1)
  blade.rotateY(Math.PI / 4)
  blade.scale(1, 1, 0.25)
  blade.translate(0, 0, 0)
  const cap = new THREE.CapsuleGeometry(0.5, 0.7, 3, 10)
  cap.scale(1, 1 / 1.7, 1)
  const shapes = {
    cap,
    egg: new THREE.SphereGeometry(0.5, 12, 9),
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1),
    taper,
    ball: new THREE.SphereGeometry(0.5, 12, 9),
    rock: new THREE.IcosahedronGeometry(0.5, 0),
    cone: new THREE.ConeGeometry(0.5, 1, 6, 1),
    wedge,
    blade,
    ring: new THREE.RingGeometry(0.4, 0.5, 20).rotateX(-Math.PI / 2),
    // a triangular plate in x-y (apex toward −x), thin along z: axe heads, wings, spikes
    tri: new THREE.CylinderGeometry(0.5, 0.5, 1, 3, 1).rotateX(Math.PI / 2).rotateZ(Math.PI / 2)
  }
  return shapes
}

const MAX_PER_BATCH = 2000
const tmpM = new THREE.Matrix4()
const tmpQ = new THREE.Quaternion()
const tmpE = new THREE.Euler()
const tmpV = new THREE.Vector3()
const tmpS = new THREE.Vector3()
const tmpC = new THREE.Color()

/**
 * The renderer for all procedural units in a scene.
 * army.add(def, opts) → a unit handle { x, z, heading, anim, ... } that you move and animate;
 * army.update(dt) poses every unit and refills the instance buffers.
 */
export function createArmy(scene) {
  const shapes = makeShapes()
  const materials = {
    cloth: painted(new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 })),
    metal: painted(new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.55 })),
    skin: painted(new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0 })),
    glow: new THREE.MeshBasicMaterial({ toneMapped: false }),
    ring: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false })
  }
  const batches = new Map()
  const batch = (shape, mat) => {
    const key = `${shape}:${mat}`
    let b = batches.get(key)
    if (!b) {
      if (!shapes[shape] && isSculpted(shape)) shapes[shape] = sculptGeometry(shape)
      if (!materials[mat]) materials[mat] = sculptMaterial(mat)
      const mesh = new THREE.InstancedMesh(shapes[shape], materials[mat], MAX_PER_BATCH)
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.setColorAt(0, tmpC.set('#fff'))
      mesh.castShadow = mat !== 'glow' && mat !== 'ring'
      mesh.receiveShadow = false
      mesh.frustumCulled = false
      mesh.count = 0
      scene.add(mesh)
      b = { mesh, n: 0 }
      batches.set(key, b)
    }
    return b
  }

  // Precompute each part's local matrix once per definition.
  const compiled = new WeakMap()
  const compile = (def) => {
    let c = compiled.get(def)
    if (c) return c
    c = def.parts.map((p) => {
      const m = new THREE.Matrix4()
      tmpE.set(...(p.rot ?? [0, 0, 0]))
      tmpQ.setFromEuler(tmpE)
      m.compose(tmpV.set(...(p.pos ?? [0, 0, 0])), tmpQ, tmpS.set(...p.size))
      batch(p.shape, p.mat ?? 'cloth')
      return { bone: p.bone, key: `${p.shape}:${p.mat ?? 'cloth'}`, local: m, color: new THREE.Color(p.color === 'team' ? '#fff' : p.color), team: p.color === 'team', flicker: p.flicker }
    })
    compiled.set(def, c)
    return c
  }

  const units = new Set()
  const bones = {}
  for (const name of BONES) bones[name] = new THREE.Matrix4()

  const army = {
    units,
    materials,
    /** Spawn a unit. def comes from units.js; opts: { x, z, heading, scale, tint } */
    add(def, { x = 0, z = 0, y = 0, heading = 0, scale = 1, anim = 'idle', phase = Math.random(), team = 'red', ring = true } = {}) {
      batch('ring', 'ring')
      const u = {
        def,
        parts: compile(def),
        x,
        y,
        z,
        heading,
        scale,
        anim,
        t: phase * 10,
        attackT: 0,
        dieT: 0,
        speed: 1,
        alive: true,
        flash: 0,
        hitT: 1,
        // animation state: blended weights, stride phase and a per-unit personality so crowds don't move in sync
        w: { move: anim === 'walk' || anim === 'run' ? 1 : 0, run: anim === 'run' ? 1 : 0, attack: anim === 'attack' ? 1 : 0, cast: anim === 'cast' ? 1 : 0 },
        stride: phase * 6.283,
        seed: Math.random(),
        team: ring ? new THREE.Color(TEAM[team]) : null,
        teamColor: new THREE.Color(TEAM_CLOTH[team])
      }
      units.add(u)
      return u
    },
    remove(u) {
      units.delete(u)
    },
    /** A hit reaction: white flash and a recoil away from the blow. */
    hit(u) {
      u.flash = 1
      u.hitT = 0
    },
    update(dt) {
      for (const b of batches.values()) b.n = 0
      for (const u of units) {
        advance(u, dt)
        pose(u, bones)
        if (u.team && u.anim !== 'die') {
          // a team-coloured ring on the ground, sized to the unit's footprint
          const b = batches.get('ring:ring')
          const r = (u.def.footprint ?? (u.def.rig === 'biped' ? 0.9 : 1.7)) * u.scale * (u.def.scale ?? 1)
          tmpM.makeScale(r, 1, r).setPosition(u.x, u.y + 0.06, u.z)
          b.mesh.setMatrixAt(b.n, tmpM)
          b.mesh.setColorAt(b.n, u.team)
          b.n++
        }
        for (const p of u.parts) {
          const b = batches.get(p.key)
          if (b.n >= MAX_PER_BATCH) continue
          tmpM.multiplyMatrices(bones[p.bone], p.local)
          b.mesh.setMatrixAt(b.n, tmpM)
          tmpC.copy(p.team ? u.teamColor : p.color)
          if (p.flicker) tmpC.multiplyScalar(0.8 + Math.sin(u.t * 17 + u.x) * 0.2)
          if (u.flash > 0) tmpC.lerp(WHITE, u.flash)
          if (u.dieT > 1) tmpC.multiplyScalar(Math.max(0.3, 2 - u.dieT))
          b.mesh.setColorAt(b.n, tmpC)
          b.n++
        }
      }
      for (const b of batches.values()) {
        b.mesh.count = b.n
        b.mesh.instanceMatrix.needsUpdate = true
        if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true
      }
    },
    get drawCalls() {
      return [...batches.values()].filter((b) => b.n > 0).length
    }
  }
  return army
}
const WHITE = new THREE.Color('#ffffff')
export const TEAM = { red: '#ff3b2a', blue: '#3a8aff', gold: '#f0c040' }
/** Team colour as it's painted on tabards, capes and banners. */
export const TEAM_CLOTH = { red: '#c4201a', blue: '#1f4fd0', gold: '#e0a820' }

/**
 * Skeleton: root (feet on the ground, facing +z) → body → chest → head; arms (arm → fore → hand)
 * hang from the chest; legs (leg → shin) from the body. Cloth bones for secondary motion: skirtF and
 * skirtB on the body, cape at the top of the chest. Quadrupeds use body/head/legs FL FR BL BR, tail,
 * and a rider on 'saddle' (rChest, rHead, rArmL/R, rHandR, rLegL/R). Engines use body and arm.
 */
const BONES = ['root', 'body', 'chest', 'head', 'armL', 'armR', 'foreL', 'foreR', 'handL', 'handR', 'legL', 'legR', 'shinL', 'shinR', 'skirtF', 'skirtB', 'cape', 'legFL', 'legFR', 'legBL', 'legBR', 'tail', 'saddle', 'rChest', 'rHead', 'rArmL', 'rArmR', 'rHandR', 'rLegL', 'rLegR', 'wheel', 'arm']

const m4 = () => new THREE.Matrix4()
const scratch = { a: m4(), b: m4() }
const euler = new THREE.Euler()
const quat = new THREE.Quaternion()
const one = new THREE.Vector3(1, 1, 1)
const pos = new THREE.Vector3()
/** out = parent × translate(x,y,z) × rotate(rx,ry,rz) */
function child(out, parent, x, y, z, rx = 0, ry = 0, rz = 0) {
  euler.set(rx, ry, rz)
  quat.setFromEuler(euler)
  scratch.a.compose(pos.set(x, y, z), quat, one)
  out.multiplyMatrices(parent, scratch.a)
}

// ---------- animation ----------
// Timing comes from the unit definition so a game can keep it consistent (see STYLE.md):
//   stride (cycles/s scale), attackTime (s per swing), heavy (0..1: slower, bigger bob and sway).

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smooth = (t) => t * t * (3 - 2 * t)
const EASE = {
  linear: (t) => t,
  inOut: smooth,
  out: (t) => 1 - (1 - t) ** 3,
  in: (t) => t * t * t,
  back: (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2 // overshoot then settle
}
/** Sample keyframes [[t, value, ease?], ...] at a (0..1); each segment eases with its end key's curve. */
function keys(a, k) {
  for (let i = 1; i < k.length; i++) {
    if (a <= k[i][0]) {
      const [t0, v0] = k[i - 1]
      const [t1, v1, e = 'inOut'] = k[i]
      return v0 + (v1 - v0) * EASE[e](clamp01((a - t0) / (t1 - t0 || 1)))
    }
  }
  return k.at(-1)[1]
}
/** Cheap smooth noise in -1..1 for idle glances and sway. */
const wobble = (t, s) => Math.sin(t * 1.3 + s * 40) * 0.6 + Math.sin(t * 0.47 + s * 17) * 0.4

// Melee swing: anticipation (slow wind-up), a fast strike, follow-through past the target, recovery.
const SWING_ARM = [[0, 0], [0.42, -2.55, 'inOut'], [0.54, 0.35, 'out'], [0.66, 0.15, 'inOut'], [1, 0, 'inOut']]
const SWING_LEAN = [[0, 0], [0.42, -0.14, 'inOut'], [0.54, 0.22, 'out'], [0.7, 0.12, 'inOut'], [1, 0, 'inOut']]
const SWING_TWIST = [[0, 0], [0.42, 0.32, 'inOut'], [0.54, -0.28, 'out'], [0.72, -0.12, 'inOut'], [1, 0, 'inOut']]
const SWING_STEP = [[0, 0], [0.42, -0.04, 'inOut'], [0.54, 0.1, 'out'], [0.8, 0.06, 'inOut'], [1, 0, 'inOut']]
// Ranged/cast: raise, hold steady (the release), lower.
const AIM = [[0, 0], [0.3, 1, 'out'], [0.75, 1], [1, 0, 'inOut']]
const RECOIL = [[0, 0], [0.55, 0], [0.62, 1, 'out'], [1, 0, 'inOut']]
// Death: recoil, knees buckle, topple with gravity, a small bounce, settle.
const DIE_FALL = [[0, 0], [0.12, -0.12, 'out'], [0.3, 0.1, 'inOut'], [0.62, 1.5, 'in'], [0.72, 1.38, 'out'], [0.82, 1.47, 'inOut'], [1, 1.45]]
const DIE_SINK = [[0, 0], [0.25, 0.18, 'inOut'], [0.62, 0.28, 'in'], [1, 0.3]]

/** Advance timers and blend animation weights toward the current animation. */
function advance(u, dt) {
  const d = u.def
  u.t += dt * u.speed
  const moving = u.anim === 'walk' || u.anim === 'run'
  const k = 1 - Math.exp(-dt * 9)
  u.w.move += ((moving ? 1 : 0) - u.w.move) * k
  u.w.run += ((u.anim === 'run' ? 1 : 0) - u.w.run) * k
  u.w.attack += ((u.anim === 'attack' ? 1 : 0) - u.w.attack) * k
  u.w.cast += ((u.anim === 'cast' ? 1 : 0) - u.w.cast) * k
  // stride advances with how much the unit is moving, so legs ease into and out of the cycle
  const heavy = d.heavy ?? clamp01(((d.scale ?? 1) - 1.2) * 1.5)
  const rate = (d.stride ?? 8) * (1 - heavy * 0.35) * (1 + u.w.run * 0.45) * (0.94 + u.seed * 0.12)
  u.stride += dt * rate * u.speed * Math.max(0.15, u.w.move)
  if (u.anim === 'attack' || u.anim === 'cast') u.attackT = (u.attackT + dt / ((d.attackTime ?? 0.9) * (0.95 + u.seed * 0.1))) % 1
  else u.attackT = Math.max(0, u.attackT - dt * 2) % 1
  if (u.anim === 'die') u.dieT = Math.min(2, u.dieT + dt)
  else u.dieT = 0
  u.hitT = Math.min(1, u.hitT + dt * 3.5)
  u.flash = Math.max(0, u.flash - dt * 5)
}

/** Pose every bone of unit u. */
function pose(u, bones) {
  const d = u.def
  const k = d.rig ?? 'biped'
  const t = u.t
  const W = u.w
  const mv = W.move
  const heavy = d.heavy ?? clamp01(((d.scale ?? 1) - 1.2) * 1.5)
  const ph = u.stride
  const swing = Math.sin(ph) * mv
  const a = u.attackT
  const melee = W.attack * (d.aim ? 0 : 1)
  const aim = (W.attack * (d.aim ? 1 : 0)) * keys(a, AIM)
  const cast = W.cast * keys(a, AIM)
  const strike = melee * keys(a, SWING_ARM)
  const hit = u.hitT < 1 ? Math.sin(u.hitT * Math.PI) * (1 - u.hitT) : 0
  const dieA = u.anim === 'die' ? clamp01(u.dieT / 1.1) : 0
  const breathe = Math.sin(t * (1.9 - heavy * 0.6) + u.seed * 9)

  // root: position, heading, scale; death topples it, a weighted fall with a bounce
  euler.set(0, u.heading, 0)
  quat.setFromEuler(euler)
  const s = u.scale * (d.scale ?? 1)
  const hover = d.hover ? d.hover + Math.sin(t * 2.5 + u.seed * 6) * 0.08 : 0
  const sink = dieA ? keys(dieA, DIE_SINK) * 0.4 + Math.max(0, u.dieT - 1.4) * 0.5 : 0
  scratch.b.compose(pos.set(u.x, u.y + hover - sink, u.z), quat, tmpS.set(s, s, s))
  bones.root.copy(scratch.b)
  if (dieA) child(bones.root, scratch.b, 0, 0, 0, -keys(dieA, DIE_FALL) * (d.fallBack ? -1 : 1), 0, (u.seed - 0.5) * 0.6 * dieA)

  if (k === 'biped') {
    const hip = d.hip ?? 0.55
    // contact dips twice per stride; heavy units bob deeper and sway wider
    const bob = mv * (0.035 + heavy * 0.03) * (1 + W.run * 0.6) * Math.cos(2 * ph) + breathe * 0.008 * (1 - mv)
    const sway = Math.sin(ph) * mv * (0.04 + heavy * 0.04)
    const weightShift = (1 - mv) * wobble(t * 0.25, u.seed) * 0.025
    const lean = (d.lean ?? 0) + mv * (0.06 + W.run * 0.16) + melee * keys(a, SWING_LEAN) - hit * 0.25
    const twist = melee * keys(a, SWING_TWIST)
    const step = melee * keys(a, SWING_STEP)
    child(bones.body, bones.root, sway * 0.5 + weightShift, hip + bob - dieA * 0.15, step, lean, Math.sin(ph) * mv * 0.1 + twist * 0.4, sway)
    // shoulders counter-rotate the hips; the chest lifts with each breath
    child(bones.chest, bones.body, 0, d.waist ?? 0.1, 0, breathe * 0.025 * (1 - mv), -Math.sin(ph) * mv * 0.16 + twist * 0.6, -sway * 1.4)
    const ch = d.chest ?? 0.45
    // the head stays level and looks ahead while walking; idle units glance around
    const glance = (1 - mv) * (1 - W.attack) * wobble(t * 0.35, u.seed + 0.3) * 0.45
    child(bones.head, bones.chest, 0, ch * 0.92, d.neckZ ?? 0.03, -lean * 0.7 + Math.sin(2 * ph) * mv * 0.04 + hit * 0.3, -twist * 0.8 + Math.sin(ph) * mv * 0.06 + glance, sway * 1.2)
    const sw = d.shoulder ?? 0.26
    const up = (d.arm ?? 0.42) * 0.5
    const splay = (d.splay ?? 0.16) + breathe * 0.02 * (1 - mv)
    // arms swing opposite the legs and lag a little behind them (overlapping action)
    const armSwing = Math.sin(ph - 0.35) * mv * (0.5 + W.run * 0.3)
    child(bones.armL, bones.chest, sw, ch * 0.8, 0, -armSwing + (d.shieldUp ? -0.7 : 0) - cast * 1.5 - aim * 1.35 + hit * 0.3, 0, splay)
    child(bones.armR, bones.chest, -sw, ch * 0.8, 0, armSwing + strike - cast * 2.1 - aim * 1.4 + hit * 0.3, 0, -splay)
    // elbows bend more on the back swing and through the strike
    const elbowL = -0.3 - Math.max(0, armSwing) * 0.5 - (d.shieldUp ? 0.9 : 0) + aim * 0.15
    const elbowR = -0.35 - Math.max(0, -armSwing) * 0.5 + melee * keys(a, [[0, 0], [0.42, -0.5], [0.54, 0.25, 'out'], [1, 0]]) + aim * 0.25
    child(bones.foreL, bones.armL, 0, -up, 0, elbowL, 0, 0)
    child(bones.foreR, bones.armR, 0, -up, 0, elbowR, 0, 0)
    child(bones.handL, bones.foreL, 0, -up, 0, 0, 0, 0)
    child(bones.handR, bones.foreR, 0, -up, 0, aim * 1.5 + 0.3, 0, 0)
    // legs: the knee folds on the forward swing (foot clears the ground), straight on contact
    const st = 0.12 * (d.stance ?? 1)
    const legSplay = d.legSplay ?? 0.03
    const kneel = dieA * 0.6
    child(bones.legL, bones.body, st, 0, 0, swing * 0.55 - kneel, 0, legSplay - sway)
    child(bones.legR, bones.body, -st, 0, 0, -swing * 0.55 - kneel, 0, -legSplay - sway)
    const thigh = hip * 0.5
    const knee = (p) => 0.06 + mv * Math.max(0, Math.cos(p)) * (0.7 + W.run * 0.4) + kneel * 1.2
    child(bones.shinL, bones.legL, 0, -thigh, 0, knee(ph), 0, 0)
    child(bones.shinR, bones.legR, 0, -thigh, 0, knee(ph + Math.PI), 0, 0)
    // cloth: skirts and capes trail the motion and flutter (secondary motion)
    const drag = mv * (0.18 + W.run * 0.25) + melee * keys(a, SWING_STEP) * 1.5
    child(bones.skirtF, bones.body, 0, 0, 0, Math.max(0, -swing) * 0.35 + drag * 0.3 + Math.sin(t * 7 + u.seed * 5) * 0.03 * mv, 0, 0)
    child(bones.skirtB, bones.body, 0, 0, 0, -Math.max(0, swing) * 0.35 - drag + Math.sin(t * 6 + u.seed * 3) * 0.04 * mv, 0, 0)
    child(bones.cape, bones.chest, 0, ch, 0, -drag * 1.2 - Math.sin(t * 5 + u.seed * 7) * 0.05 * (0.3 + mv), 0, 0)
  } else if (k === 'quad') {
    const hip = d.hip ?? 0.5
    // a four-beat walk that becomes a gallop: legs are phase-offset, the spine flexes, the head counters
    const gal = W.run
    const p = ph * 0.9
    const leg = (o) => Math.sin(p + o) * mv * (0.6 + gal * 0.35)
    const rise = mv * Math.abs(Math.sin(p)) * (0.05 + gal * 0.06)
    const L = d.bodyLen ?? 0.5
    const pitch = Math.sin(p * 2) * mv * (0.03 + gal * 0.06) + melee * keys(a, SWING_LEAN) * 0.4 - hit * 0.2
    child(bones.body, bones.root, 0, hip + rise + breathe * 0.01 * (1 - mv) - dieA * 0.2, melee * keys(a, SWING_STEP), pitch, 0, Math.sin(p) * mv * 0.03)
    child(bones.head, bones.body, 0, d.neckY ?? 0.18, L + 0.05, -pitch * 1.4 + melee * keys(a, [[0, 0], [0.42, -0.35], [0.54, 0.3, 'out'], [1, 0]]) + (1 - mv) * wobble(t * 0.4, u.seed) * 0.12, (1 - mv) * wobble(t * 0.3, u.seed + 1) * 0.35, 0)
    const off = gal > 0.5 ? [0, 0.5, Math.PI, Math.PI + 0.5] : [0, Math.PI, Math.PI * 1.5, Math.PI * 0.5]
    child(bones.legFL, bones.body, 0.16, -0.02, L * 0.75, leg(off[0]), 0, 0)
    child(bones.legFR, bones.body, -0.16, -0.02, L * 0.75, leg(off[1]), 0, 0)
    child(bones.legBL, bones.body, 0.16, -0.02, -L * 0.75, leg(off[2]), 0, 0)
    child(bones.legBR, bones.body, -0.16, -0.02, -L * 0.75, leg(off[3]), 0, 0)
    // the tail lags the body (follow-through) and wags when idle
    child(bones.tail, bones.body, 0, 0.08, -L - 0.05, 0.6 - pitch * 2 + mv * 0.4, Math.sin(t * (mv ? 9 : 3) + u.seed * 4) * (0.15 + (1 - mv) * 0.2), 0)
    child(bones.saddle, bones.body, 0, 0.16, -0.05, -pitch * 0.8, 0, 0)
    // rider: absorbs the bounce with the hips, leans into the gallop
    const rStrike = melee * keys(a, SWING_ARM)
    child(bones.rChest, bones.saddle, 0, 0.12 - rise * 0.5, 0, 0.1 + gal * 0.15 - pitch * 0.5 + melee * keys(a, SWING_LEAN) * 0.5, melee * keys(a, SWING_TWIST) * 0.5, 0)
    child(bones.rHead, bones.rChest, 0, 0.42, 0, -0.1 - gal * 0.1 + pitch * 0.6, 0, 0)
    child(bones.rArmL, bones.rChest, 0.24, 0.38, 0, -0.6, 0, 0.15)
    child(bones.rArmR, bones.rChest, -0.24, 0.38, 0, rStrike - 0.3 - aim * 1.2, 0, -0.15)
    child(bones.rHandR, bones.rArmR, 0, -0.38, 0, 0, 0, 0)
    child(bones.rLegL, bones.saddle, 0.24, 0.05, 0, -1.2, 0, 0.5)
    child(bones.rLegR, bones.saddle, -0.24, 0.05, 0, -1.2, 0, -0.5)
    child(bones.cape, bones.rChest, 0, 0.42, 0, -mv * (0.3 + gal * 0.5) - Math.sin(t * 6 + u.seed) * 0.06, 0, 0)
  } else if (k === 'engine') {
    // siege engines rock on their wheels while rolling; the arm winds up slowly and releases fast
    child(bones.body, bones.root, 0, Math.abs(Math.sin(ph * 0.5)) * 0.03 * mv, 0, Math.sin(ph) * 0.02 * mv, 0, Math.sin(ph * 0.5) * 0.02 * mv)
    const throwA = W.attack * keys(a, [[0, 0], [0.65, 1.1, 'inOut'], [0.72, -1.3, 'out'], [0.8, -1.1, 'inOut'], [1, 0, 'inOut']])
    const thrust = W.attack * keys(a, [[0, 0], [0.55, -0.5, 'inOut'], [0.66, 0.9, 'out'], [0.75, 0.75], [1, 0, 'inOut']])
    if (d.ram) child(bones.arm, bones.body, 0, d.armY, (d.armZ ?? 0) + thrust, 0, 0, 0)
    else child(bones.arm, bones.body, 0, d.armY ?? 0.9, d.armZ ?? -0.2, -0.4 + throwA, 0, 0)
  }
}
