// Anime / storybook toon look for three.js characters loaded from files (character-models skill): stepped
// shading with a coloured shadow tone, a soft rim light, an outline that follows skinning, and helpers to
// restyle a whole GLB and to recolour / swap parts for a character creator. Works with MeshStandardMaterial
// GLBs from Blender, VRoid (via GLB export) and asset packs. For .vrm files use @pixiv/three-vrm's MToon
// instead (it already does all of this); outline() still works on them.
import * as THREE from 'three'

/**
 * A gradient map for MeshToonMaterial: `steps` flat bands. Light bands near 1 keep the lit side clean;
 * the dark band is the shadow tone (the material's shade colour is applied on top, see toon()).
 */
export function ramp(steps = [0.55, 1]) {
  const data = new Uint8Array(steps.length * 4)
  steps.forEach((v, i) => data.set([v * 255, v * 255, v * 255, 255], i * 4))
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat)
  tex.minFilter = tex.magFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

const RAMP = ramp()

/**
 * A toon material. shade tints the shadow band (warm or cool shadows instead of grey: the biggest single
 * step toward a painted look); rim adds a soft back-light edge. Pass map for painted textures.
 */
export function toon({ color = '#ffffff', map = null, shade = '#6a5a7a', shadeAmount = 0.55, rim = '#ffffff', rimAmount = 0.35, rimPower = 3, gradientMap = RAMP, ...rest } = {}) {
  const m = new THREE.MeshToonMaterial({ color, map, gradientMap, ...rest })
  const u = {
    uShade: { value: new THREE.Color(shade) },
    uShadeAmount: { value: shadeAmount },
    uRim: { value: new THREE.Color(rim) },
    uRimAmount: { value: rimAmount },
    uRimPower: { value: rimPower }
  }
  m.userData.toon = u
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uShade; uniform float uShadeAmount; uniform vec3 uRim; uniform float uRimAmount; uniform float uRimPower;`)
      .replace('#include <opaque_fragment>', `
{
  // how much of the surface is in the shadow band: compare lit result against the unlit albedo
  float lit = clamp(dot(outgoingLight, vec3(0.333)) / max(dot(diffuseColor.rgb, vec3(0.333)), 1e-3), 0.0, 1.0);
  float inShadow = 1.0 - smoothstep(0.6, 0.9, lit);
  outgoingLight = mix(outgoingLight, outgoingLight * mix(vec3(1.0), uShade * 1.6, uShadeAmount), inShadow);
  float fres = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), uRimPower);
  outgoingLight += uRim * fres * uRimAmount * (0.4 + 0.6 * lit);
}
#include <opaque_fragment>`)
  }
  m.customProgramCacheKey = () => 'toon-rim'
  return m
}

/**
 * Add an inverted-hull outline to every mesh under root. The hull is pushed out along normals in the vertex
 * shader *before* skinning, so it follows animated (skinned) characters; width is in model units.
 * Returns the outline meshes (toggle .visible for a Settings option).
 */
export function outline(root, { width = 0.012, color = '#1b1520' } = {}) {
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWidth = { value: width }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWidth;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * uWidth;')
  }
  mat.customProgramCacheKey = () => 'toon-outline'
  const made = []
  const meshes = []
  root.traverse((o) => { if (o.isMesh && !o.userData.isOutline) meshes.push(o) })
  for (const o of meshes) {
    let hull
    if (o.isSkinnedMesh) {
      hull = new THREE.SkinnedMesh(o.geometry, mat)
      hull.bind(o.skeleton, o.bindMatrix)
      hull.bindMode = o.bindMode
    } else {
      hull = new THREE.Mesh(o.geometry, mat)
    }
    hull.userData.isOutline = true
    hull.castShadow = false
    hull.morphTargetInfluences = o.morphTargetInfluences
    hull.morphTargetDictionary = o.morphTargetDictionary
    o.add(hull)
    made.push(hull)
  }
  return made
}

/**
 * Replace every material under root with toon(), keeping colour, texture, skinning and transparency.
 * opts per material name: { Hair: { shade: '#5a6a9a' }, Skin: { shade: '#c0646a', rimAmount: 0.2 } }.
 */
export function toonify(root, { defaults = {}, byName = {} } = {}) {
  const cache = new Map()
  root.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline) return
    const conv = (src) => {
      if (cache.has(src)) return cache.get(src)
      const m = toon({
        color: src.color ? '#' + src.color.getHexString() : '#ffffff',
        map: src.map || null,
        transparent: src.transparent,
        alphaTest: src.alphaTest,
        side: src.side,
        ...defaults,
        ...(byName[src.name] || {})
      })
      m.name = src.name
      cache.set(src, m)
      return m
    }
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material)
  })
  return [...cache.values()]
}

/** Recolour materials by name for a character creator: recolor(model, { Hair: '#e8e6ea', Cape: '#b8262b' }). */
export function recolor(root, colors) {
  root.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline) return
    for (const m of [].concat(o.material)) if (colors[m.name]) m.color.set(colors[m.name])
  })
}

/**
 * Show one variant of a swappable part: meshes named `<slot>_<variant>` (e.g. Hair_Windswept, Hair_Short).
 * Author every variant in the same file on the same skeleton; this toggles visibility, so swaps are instant.
 */
export function showVariant(root, slot, variant) {
  root.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline) return
    const [s, v] = o.name.split('_')
    if (s === slot) o.visible = v === variant
  })
}

/** Light rig for the look: warm key, cool fill from the sky, back light for the rim. Returns the lights. */
export function lights(scene, { key = '#fff1dc', sky = '#9fd0e0', ground = '#3a4a3a', back = '#ffffff' } = {}) {
  const hemi = new THREE.HemisphereLight(sky, ground, 1.1)
  const k = new THREE.DirectionalLight(key, 2.2)
  k.position.set(2, 3, 2.5)
  const b = new THREE.DirectionalLight(back, 1.2)
  b.position.set(-2, 2, -3)
  scene.add(hemi, k, b)
  return { hemi, key: k, back: b }
}
