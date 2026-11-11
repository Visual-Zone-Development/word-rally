// pushplay runtime v10 — replaced by `npm run update-kit`; don't edit, extend from game.js.
//
// Saved progress and settings in localStorage, keyed by the game's id so games on the same
// device never collide. Writes are guarded (private mode, full storage) so a failed save never
// crashes the game. Saves also happen on their own when the game is paused or hidden.
//
//   const save = createSave('my-game', 1, { best: 0, unlocked: ['easy'] })
//   save.data.best = 12; save.save()
//   // Bump the version when the shape changes; migrate turns the old data into the new shape:
//   const save = createSave('my-game', 2, { best: 0, runs: 0 }, (old, oldVersion) => ({ best: old.best }))
//
//   const settings = createSettings('my-game')   // master/music/sfx/reducedShake/textScale

import { input } from './input.js'

export const SETTINGS_DEFAULTS = { master: 1, music: 0.8, sfx: 1, reducedShake: false, textScale: 1 }

const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)))

function read(key) {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return undefined
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : undefined
  } catch {
    return undefined
  }
}

function store(id, kind, version, defaults, migrate) {
  const key = `${id}-${kind}-v${version}`
  const api = {
    key,
    data: clone(defaults),
    /** True after load() found an older version and migrated it. */
    migrated: false,
    load() {
      let data = read(key)
      if (data === undefined) {
        for (let v = version - 1; v >= 1 && data === undefined; v--) {
          const old = read(`${id}-${kind}-v${v}`)
          if (old === undefined) continue
          data = migrate ? migrate(old, v) : old
          api.migrated = true
        }
      }
      api.data = { ...clone(defaults), ...(data ?? {}) }
      return api.data
    },
    /** Returns false when storage is unavailable or full. */
    save() {
      try {
        localStorage.setItem(key, JSON.stringify(api.data))
        return true
      } catch {
        return false
      }
    },
    reset() {
      api.data = clone(defaults)
      try {
        localStorage.removeItem(key)
      } catch {
        /* unavailable */
      }
      return api.data
    }
  }
  api.load()
  addEventListener('pagehide', () => api.save())
  document.addEventListener('visibilitychange', () => document.hidden && api.save())
  input.onPause(() => api.save())
  return api
}

/** Progress: key `<id>-save-v<version>`. */
export function createSave(id, version = 1, defaults = {}, migrate) {
  return store(id, 'save', version, defaults, migrate)
}

/** Player settings: key `<id>-settings-v1`, with the standard defaults plus the game's own. */
export function createSettings(id, defaults = {}) {
  return store(id, 'settings', 1, { ...SETTINGS_DEFAULTS, ...defaults })
}
