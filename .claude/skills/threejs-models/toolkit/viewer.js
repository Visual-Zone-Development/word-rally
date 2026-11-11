// Asset viewer (toolkit from the threejs-models skill): renders one unit from several camera views, an
// animation as a strip of frames, or two assets side by side, so changes can be compared with a
// reference. Sets document.title = 'ready' when done, for scripts/shot.mjs.
import * as THREE from 'three'
import { createArmy } from './rig.js'
import { ASSETS, assetTeam } from './assets.js'

const P = new URLSearchParams(location.search)
const W = 1280
const H = 800
const hud = document.getElementById('hud')
hud.width = W
hud.height = H
const g = hud.getContext('2d')

if (P.has('list')) {
  g.fillStyle = '#e8e8e8'
  g.font = '16px monospace'
  Object.keys(ASSETS).forEach((id, i) => g.fillText(id, 24 + Math.floor(i / 34) * 300, 30 + (i % 34) * 22))
  document.title = 'ready'
} else {
  const ids = [P.get('unit') ?? Object.keys(ASSETS)[0], ...(P.get('compare') ? [P.get('compare')] : [])]
  for (const id of ids) if (!ASSETS[id]) throw new Error(`no asset ${id}; open viewer.html?list`)
  const anim = P.get('anim') ?? 'idle'
  const frames = +(P.get('frames') ?? 0)
  const views = (P.get('views') ?? (frames ? 'side' : 'front,34,side,game')).split(',')
  const zoom = +(P.get('zoom') ?? 1)

  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gl'), antialias: true })
  renderer.setPixelRatio(1)
  renderer.setSize(W, H, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.shadowMap.enabled = true
  renderer.setScissorTest(true)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#9ec8e8')
  scene.add(new THREE.HemisphereLight('#eef6ff', '#7a8a4a', 1.7))
  const sun = new THREE.DirectionalLight('#fff2d8', 3)
  sun.position.set(-6, 12, 8)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 })
  sun.shadow.intensity = 0.6
  scene.add(sun)
  const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: P.get('bg') ?? '#5e9a2e', roughness: 1 }))
  ground.receiveShadow = true
  scene.add(ground)

  const army = createArmy(scene)
  const spacing = Math.max(...ids.map((id) => (ASSETS[id].scale ?? 1) * 2.6))
  const units = ids.map((id, i) => {
    const u = army.add(ASSETS[id], { x: (i - (ids.length - 1) / 2) * spacing, z: 0, heading: 0, anim, team: P.get('team') ?? assetTeam(id), ring: false })
    u.seed = 0.5
    return u
  })
  // unit height, so cameras frame any size of unit
  const size = Math.max(...ids.map((id) => (ASSETS[id].scale ?? 1) * 2.2))

  /** Camera presets around the origin; 'game' matches the battle camera's angle at play zoom. */
  const camFor = (view, cx, aspect) => {
    const c = new THREE.PerspectiveCamera(view === 'game' ? 34 : 30, aspect, 0.1, 200)
    // back off far enough that the unit fits the cell's narrower side
    const r = (size * 2.3 * zoom * (ids.length > 1 ? 2.1 : 1)) / Math.min(1, aspect)
    const at = new THREE.Vector3(cx, size * 0.45, 0)
    const dir = {
      front: [0, 0.25, 1],
      '34': [0.7, 0.45, 0.75],
      side: [1, 0.2, 0],
      back: [0, 0.3, -1],
      top: [0.01, 1, 0.25],
      game: [0, 0.82, 0.62]
    }[view] ?? [0, 0.25, 1]
    const v = new THREE.Vector3(...dir).normalize().multiplyScalar(view === 'game' ? 48 * zoom : r)
    c.position.copy(at).add(v)
    c.lookAt(at)
    return c
  }

  // layout: one row per asset compared, one column per view or frame
  const cols = frames || views.length
  const rows = frames ? views.length : 1
  const cw = Math.floor(W / cols)
  const chh = Math.floor(H / rows)
  g.font = '600 15px system-ui, sans-serif'
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const view = frames ? views[r] : views[c]
      const f = frames ? c / frames : +(P.get('t') ?? 0.3)
      for (const u of units) {
        u.t = f * 4 + 1
        u.stride = f * Math.PI * 2
        u.attackT = f
        u.dieT = f * 2
      }
      army.update(0)
      const x = c * cw
      const y = H - (r + 1) * chh
      const cam = camFor(view, 0, cw / chh)
      renderer.setViewport(x, y, cw, chh)
      renderer.setScissor(x, y, cw, chh)
      renderer.render(scene, cam)
      g.fillStyle = 'rgba(0,0,0,0.55)'
      g.fillRect(c * cw, r * chh, cw, 22)
      g.fillStyle = '#fff'
      g.fillText(`${ids.join(' vs ')} · ${view} · ${anim}${frames ? ` ${c + 1}/${frames}` : ''}`, c * cw + 6, r * chh + 16)
      g.strokeStyle = '#000'
      g.strokeRect(c * cw + 0.5, r * chh + 0.5, cw - 1, chh - 1)
    }
  document.title = 'ready'
}
