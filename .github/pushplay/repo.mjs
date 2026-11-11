import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import Ajv from 'ajv/dist/2020.js'
import { GAMES_DIR, IGNORE_FILE, KIT_DIR, MANIFEST_FILES, MIN_DESCRIPTION } from './config.mjs'

/** The game repo being built: where commands run from (CI and npm scripts both use the root). */
export const ROOT = resolve(process.env.KIT_REPO_ROOT ?? process.cwd())
/** Scratch output, inside the kit folder so it never mixes with the game's own files. */
export const WORK_DIR = join(ROOT, KIT_DIR, '.work')
export const outDir = (id) => join(WORK_DIR, 'out', id)
export const distDir = join(WORK_DIR, 'dist')

// Exported kits carry copies of the schemas; in the launcher monorepo they come from the shared package.
function loadSchema(name) {
  const file = [join(import.meta.dirname, name), join(import.meta.dirname, '../../shared/schema', name)].find((f) => existsSync(f))
  return new Ajv({ allErrors: true, strict: false }).compile(JSON.parse(readFileSync(file, 'utf8')))
}
const validateSchema = loadSchema('manifest.schema.json')
const validateIndexSchema = loadSchema('kit-index.schema.json')

/** Problems with a release index the kit is about to publish (empty when it's valid). */
export function validateIndex(index) {
  if (validateIndexSchema(index)) return []
  return (validateIndexSchema.errors ?? []).map((e) => `${e.instancePath || '(root)'} ${e.message}`)
}

export class GameError extends Error {
  constructor(id, message) {
    super(message)
    this.gameId = id
  }
}

const manifestIn = (dir) => MANIFEST_FILES.map((f) => join(dir, f)).find((f) => existsSync(f))

/**
 * 'single': the whole repo is one game (manifest at the root).
 * 'collection': one game per folder under games/ (the template layout).
 */
export function layout(root = ROOT) {
  return manifestIn(root) ? 'single' : 'collection'
}

/**
 * Every game in the repo: { id, dir, rel, manifestPath }. `rel` is the game's folder relative to
 * the repo root ('' for a single-game repo), used to tell which games a push changed.
 */
export function listGames(root = ROOT) {
  if (layout(root) === 'single') {
    const manifestPath = manifestIn(root)
    let id
    try {
      id = JSON.parse(readFileSync(manifestPath, 'utf8')).id
    } catch {
      id = undefined
    }
    return [{ id: typeof id === 'string' && id ? id : basename(root), dir: root, rel: '', manifestPath }]
  }
  const gamesRoot = join(root, GAMES_DIR)
  if (!existsSync(gamesRoot)) return []
  return readdirSync(gamesRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ id: d.name, dir: join(gamesRoot, d.name), rel: `${GAMES_DIR}/${d.name}`, manifestPath: manifestIn(join(gamesRoot, d.name)) }))
    .filter((g) => g.manifestPath)
    .sort((a, b) => a.id.localeCompare(b.id))
}

/** Never shipped from a game folder: tooling, notes and anything in the game's ignore file. */
const DEFAULT_IGNORES = ['tools', 'mockups', '*.py', '__pycache__', 'DESIGN.md', '*.psd', '*.ase', '*.aseprite', '*.blend', '*.kra']

/**
 * Also never shipped when the game is the repo root (a single-game repo): the repo's agent
 * prompts, glossary and docs sit next to the game there. Anchored, so only the root copies.
 */
const SINGLE_GAME_IGNORES = ['/AGENTS.md', '/CLAUDE.md', '/GLOSSARY.md', '/GLOSSARY-MAP.md', '/docs']

/**
 * Patterns for files to leave out of a game's build: the defaults plus one glob per line in
 * the game's ignore file (`#` comments; a trailing `/` matches a folder). Globs match a file or
 * folder name, or a path relative to the game folder when they contain a `/`; a leading `/` in
 * the defaults anchors a pattern to the game folder itself.
 */
export function ignorePatterns(game) {
  const patterns = [...DEFAULT_IGNORES, ...(game.rel === '' ? SINGLE_GAME_IGNORES : [])]
  const file = join(game.dir, IGNORE_FILE)
  if (existsSync(file)) {
    for (const raw of readFileSync(file, 'utf8').split('\n')) {
      const line = raw.trim()
      if (line && !line.startsWith('#')) patterns.push(line.replace(/^\.?\//, ''))
    }
  }
  return patterns
}

/** True when a file or folder (path relative to the game folder, forward slashes) matches a pattern. */
export function ignored(rel, patterns, isDir = false) {
  const name = rel.split('/').pop()
  return patterns.some((p) => {
    if (p.startsWith('/')) return rel === p.slice(1)
    const dirOnly = p.endsWith('/')
    const pattern = dirOnly ? p.slice(0, -1) : p
    if (dirOnly && !isDir) return false
    const re = new RegExp('^' + pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$')
    return re.test(pattern.includes('/') ? rel : name)
  })
}

export function findGame(id, root = ROOT) {
  return listGames(root).find((g) => g.id === id)
}

export function readManifest(game) {
  try {
    return JSON.parse(readFileSync(game.manifestPath, 'utf8'))
  } catch (err) {
    throw new GameError(game.id, `${display(game.manifestPath)} is not valid JSON: ${err.message}`)
  }
}

/** Path relative to the repo root, for messages. */
export const display = (path) => relative(ROOT, path) || '.'

/** Path inside root, or null if it escapes. */
export function inside(root, rel) {
  const target = resolve(root, rel)
  const fromRoot = relative(root, target)
  if (fromRoot.startsWith('..' + sep) || fromRoot === '..' || isAbsolute(fromRoot)) return null
  return target
}

function packageJson(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  } catch {
    return null
  }
}

/**
 * How to build the game: 'npm' runs its package.json "build" script and ships the output folder;
 * 'static' ships the folder as-is. The manifest's build.preset wins ("vite" means npm).
 */
export function buildMode(game, manifest) {
  const preset = manifest.build?.preset
  if (preset === 'static') return 'static'
  if (preset === 'vite') return 'npm'
  if (preset === 'godot') return 'godot'
  return packageJson(game.dir)?.scripts?.build ? 'npm' : 'static'
}

/**
 * Validate a game's manifest. Returns { errors, warnings } as readable sentences
 * aimed at whoever (or whatever AI) is fixing the game.
 */
export function validateManifest(game, manifest) {
  const errors = []
  const warnings = []
  const where = display(game.manifestPath)

  if (!validateSchema(manifest)) {
    for (const e of validateSchema.errors ?? []) {
      const path = e.instancePath ? e.instancePath.slice(1).replaceAll('/', '.') : '(root)'
      const extra = e.params?.additionalProperty ? ` "${e.params.additionalProperty}"` : ''
      errors.push(`${where}: ${path} ${e.message}${extra}`)
    }
  }
  if (game.rel && manifest.id !== game.id) errors.push(`${where}: "id" must match the folder name ("${game.id}")`)
  if (!manifest.description || manifest.description.trim().length < MIN_DESCRIPTION) {
    errors.push(`${where}: add a "description" of 1–3 sentences (at least ${MIN_DESCRIPTION} characters)`)
  }

  const mode = buildMode(game, manifest)
  if (mode === 'godot') errors.push(`${where}: Godot builds aren't automated yet. Export for Linux and attach the zip to a release instead`)
  if (mode === 'static') {
    const entry = manifest.entry?.web
    if (!entry) errors.push(`${where}: games without a build step need "entry": { "web": "index.html" }`)
    else if (!inside(game.dir, entry) || !existsSync(join(game.dir, entry))) errors.push(`${where}: entry.web "${entry}" doesn't exist`)
  }
  if (mode === 'npm' && !packageJson(game.dir)?.scripts?.build) {
    errors.push(`${where}: build preset "vite" needs a package.json with a "build" script`)
  }

  for (const kind of ['cover', 'hero']) {
    const rel = manifest.art?.[kind]
    if (!rel) {
      warnings.push(`no art.${kind}: one will be generated from a screenshot, but custom art looks much better`)
      continue
    }
    if (!/\.(svg|html|png|jpe?g|webp)$/i.test(rel)) errors.push(`${where}: art.${kind} must be .svg, .html, .png, .jpg or .webp`)
    const file = inside(game.dir, rel)
    if (!file || !existsSync(file) || !statSync(file).isFile()) errors.push(`${where}: art.${kind} "${rel}" doesn't exist`)
    else if (/\.(svg|html)$/i.test(rel) && readFileSync(file, 'utf8').includes('PLACEHOLDER ART')) {
      errors.push(`${display(file)} is still the placeholder. Design real ${kind} art for this game`)
    }
  }
  if (!manifest.controls) warnings.push(`set "controls": "gamepad" once the game works with a controller`)
  if (!manifest.tags?.length) errors.push(`${where}: add "tags" (1–8 lowercase genre and style words, e.g. ["arcade", "space"]) so players can filter the library`)
  if (!manifest.inputs?.length) errors.push(`${where}: add "inputs": ["gamepad", "keyboard", "mouse", "touch"] (drop the ones gameplay can't support; menus must work with all four)`)
  if (manifest.phone && manifest.inputs?.length && !manifest.inputs.includes('touch')) {
    errors.push(`${where}: a phone game ("phone": { "orientation": "${manifest.phone.orientation}" }) is played with touch alone, so "inputs" must include "touch" (the phone pass plays it that way)`)
  }

  return { errors, warnings }
}

/**
 * Options for spawning npm/npx. On Windows they're .cmd scripts, which Node only runs through a
 * shell; `quote` the arguments then (paths there often have spaces, and can't contain quotes).
 */
export const npmSpawn = process.platform === 'win32' ? { shell: true } : {}
export const quote = (args) => (process.platform === 'win32' ? args.map((a) => (/\s/.test(a) ? `"${a}"` : a)) : args)

export function log(message = '') {
  process.stdout.write(message + '\n')
}

export { KIT_DIR }
