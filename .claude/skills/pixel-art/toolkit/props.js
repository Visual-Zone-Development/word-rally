// Example props, creatures and item icons for pixelforge.js (pixel-art skill). Each is a model built from a
// few primitives; render() turns it into pixel art in the same view, light and outline as the characters, so
// a whole scene matches. Copy the ones you need and change shapes and colours; add new ones the same way.
import { model, key } from './pixelforge.js'

const one = { root: { at: [0, 0, 0] } }

export function tree({ leaves = '#4f9a3c', trunk = '#7a4f2e', size = 1, seed = 1 } = {}) {
  const s = size
  const blobs = [[0, 26, 0, 11], [-7, 21, 2, 8], [7, 21, 1, 8], [0, 18, 6, 8], [-3, 31, -2, 7], [4, 30, 3, 6]]
  return model({
    bones: one,
    parts: [
      { bone: 'root', shape: 'capsule', at: [0, 0, 0], to: [0, 16 * s, 0], r: 2.6 * s, mat: 'trunk' },
      { bone: 'root', shape: 'capsule', at: [0, 2, 0], to: [4 * s, 0, 2 * s], r: 1.4 * s, mat: 'trunk' },
      ...blobs.map(([x, y, z, r], i) => ({ bone: 'root', shape: 'ellipsoid', at: [x * s, y * s, z * s], r: [r * s, r * 0.85 * s, r * s], rot: [0, (seed + i) * 0.7, 0], mat: 'leaves' }))
    ],
    materials: { leaves: { base: leaves, hueShift: 30 }, trunk },
    shading: 'medium'
  })
}

export function rock({ color = '#8a8fa0', size = 1 } = {}) {
  const s = size
  return model({
    bones: one,
    parts: [
      { bone: 'root', shape: 'ellipsoid', at: [0, 3 * s, 0], r: [7 * s, 4.5 * s, 6 * s], rot: [0, 0.4, 0.1], mat: 'stone' },
      { bone: 'root', shape: 'ellipsoid', at: [4 * s, 2 * s, 3 * s], r: [3.5 * s, 2.6 * s, 3 * s], rot: [0, 0.9, 0], mat: 'stone' },
      { bone: 'root', shape: 'ellipsoid', at: [-1 * s, 5.5 * s, -1 * s], r: [3 * s, 1.4 * s, 3 * s], mat: 'moss' }
    ],
    materials: { stone: { base: color, hueShift: 26 }, moss: '#5f8f3a' }
  })
}

export function bush({ color = '#3f8a3a', berries = '#d9453b' } = {}) {
  return model({
    bones: one,
    parts: [
      { bone: 'root', shape: 'ellipsoid', at: [0, 4, 0], r: [7, 5, 6], mat: 'leaves' },
      { bone: 'root', shape: 'ellipsoid', at: [-4, 3, 2], r: [4, 3.5, 4], mat: 'leaves' },
      { bone: 'root', shape: 'ellipsoid', at: [4, 3.5, 1], r: [4, 3.5, 4], mat: 'leaves' },
      ...[[2, 7, 4], [-3, 6, 4.5], [5, 4, 4]].map(([x, y, z]) => ({ bone: 'root', shape: 'ellipsoid', at: [x, y, z], r: [1, 1, 1], mat: 'berries' }))
    ],
    materials: { leaves: { base: color, hueShift: 30 }, berries }
  })
}

export function chest({ wood = '#9a6338', metal = '#d9a536', open = 0 } = {}) {
  return model({
    bones: { root: { at: [0, 0, 0] }, lid: { parent: 'root', at: [0, 8, -5] } },
    parts: [
      { bone: 'root', shape: 'box', at: [0, 4, 0], size: [8, 4, 5], mat: 'wood' },
      { bone: 'lid', shape: 'box', at: [0, 1.5, 5], size: [8.2, 1.8, 5.2], mat: 'wood' },
      { bone: 'root', shape: 'box', at: [0, 4, 0], size: [8.3, 0.7, 5.3], mat: 'metal' },
      { bone: 'root', shape: 'box', at: [0, 6.5, 5.3], size: [1.2, 1.4, 0.4], mat: 'metal' }
    ],
    materials: { wood, metal },
    // pose: { lid: [-open * 1.6, 0, 0] } when rendering, for an opening animation
  })
}

/** A slime: body, eyes and a highlight; ANIMS-style template SLIME_HOP for its hop. */
export function slime({ color = '#5fbf4a' } = {}) {
  return model({
    bones: { root: { at: [0, 0, 0] }, body: { parent: 'root', at: [0, 0, 0] } },
    parts: [
      { bone: 'body', shape: 'ellipsoid', at: [0, 6, 0], r: [9, 6.5, 8], mat: 'goo' },
      { bone: 'body', shape: 'ellipsoid', at: [3, 7.5, 7], r: [1.1, 1.7, 0.8], mat: 'eyes' },
      { bone: 'body', shape: 'ellipsoid', at: [-3, 7.5, 7], r: [1.1, 1.7, 0.8], mat: 'eyes' },
      { bone: 'body', shape: 'ellipsoid', at: [-4, 10.5, 3], r: [1.6, 1, 1.4], mat: 'shine' }
    ],
    materials: { goo: { base: color, hueShift: 30 }, eyes: { base: '#1e1a2e', ramp: Array(5).fill('#1e1a2e'), decal: true }, shine: { base: '#ffffff', ramp: Array(5).fill('#f4fff0'), decal: true } }
  })
}

export const SLIME_HOP = {
  frames: 6, fps: 10, loop: true,
  pose: (p) => ({ $offset: [0, key([[0, 0], [0.2, 0], [0.5, 5], [0.8, 0], [1, 0]], p), 0], body: [key([[0, 0], [0.2, 0.15], [0.5, -0.1], [0.8, 0.12], [1, 0]], p), 0, 0] })
}

// ---------- item icons (render with view: 'side' or 'low top-down', size 16–24, shadow: false) ----------

export function potion({ liquid = '#d9453b', glass = '#cfe8f0' } = {}) {
  return model({
    bones: one,
    parts: [
      { bone: 'root', shape: 'ellipsoid', at: [0, 5, 0], r: [4.6, 4.6, 4.6], mat: 'liquid' },
      { bone: 'root', shape: 'capsule', at: [0, 8, 0], to: [0, 11, 0], r: 1.6, mat: 'glass' },
      { bone: 'root', shape: 'box', at: [0, 12.2, 0], size: [1.7, 1.2, 1.7], mat: 'cork' },
      { bone: 'root', shape: 'ellipsoid', at: [-1.8, 6.8, 3.2], r: [0.9, 1.4, 0.6], mat: 'glass' }
    ],
    materials: { liquid, glass, cork: '#9a6338' }
  })
}

export function coin({ color = '#e3b23c' } = {}) {
  return model({
    bones: one,
    parts: [
      { bone: 'root', shape: 'ellipsoid', at: [0, 5, 0], r: [4.5, 4.5, 1.2], mat: 'gold' },
      { bone: 'root', shape: 'box', at: [0, 5, 1.1], size: [0.8, 2.4, 0.3], mat: 'mark' }
    ],
    materials: { gold: { base: color, hueShift: 20 }, mark: { base: '#9a6a1c', decal: true } }
  })
}

export function swordIcon({ blade = '#c8d2dc', hilt = '#d9a536' } = {}) {
  return model({
    bones: one,
    parts: [
      { bone: 'root', shape: 'box', at: [0, 9, 0], size: [1.1, 6.5, 0.45], mat: 'blade' },
      { bone: 'root', shape: 'box', at: [0, 2.3, 0], size: [3.2, 0.7, 0.8], mat: 'hilt' },
      { bone: 'root', shape: 'box', at: [0, 0.4, 0], size: [0.7, 1.4, 0.7], mat: 'grip' }
    ],
    materials: { blade: { base: blade, hueShift: 30 }, hilt, grip: '#6b3e26' }
  })
}
