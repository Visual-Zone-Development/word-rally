// npm run update-kit [path-to-kit-dir | path-to-template-repo | kit.zip | --latest]
// Brings a game repo up to the newest build kit:
//   1. replaces .github/<slug>/ (keeping .work/ and node_modules/) and the workflow
//   2. copies the AI prompts the kit bundles: AGENTS.md, CLAUDE.md, .claude/skills/, docs/game-design/
//   3. in every game, replaces the runtime modules (input.js, menu.js, fit.js, ...) that carry the
//      runtime header, adds the ones that are missing, and warns about files it had to overwrite
// --latest downloads kit.zip from the newest launcher release (brand.json releasesRepo).
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { brand, KIT_DIR, KIT_VERSION, ONLINE_RUNTIME_FILES, PARTY_RUNTIME_FILES, RUNTIME_FILES, RUNTIME_HEADER_RE, WORKFLOW_FILE } from './config.mjs'
import { listGames, log, npmSpawn, ROOT } from './repo.mjs'

const KIT_ZIP = 'kit.zip'
const PROMPT_FILES = ['AGENTS.md', 'CLAUDE.md']
const PROMPT_DIRS = ['.claude/skills', 'docs/game-design']
/** Runtime files that older kits shipped without a header; games forked them, so they're replaced anyway. */
const LEGACY_RUNTIME = new Set(['input.js', 'menu.js', 'net.js', 'lobby.js'])

const noInstall = process.argv.includes('--no-install')
// With no source, fetch the newest release.
const arg = process.argv.slice(2).find((a) => a === '--latest' || !a.startsWith('--')) ?? '--latest'
if (process.argv.includes('--help')) {
  log('Usage: npm run update-kit [path-to-kit-dir | path-to-template-repo | kit.zip | --latest] [--no-install]')
  log(`  default (--latest) downloads ${KIT_ZIP} from the newest release of ${brand.releasesRepo}`)
  process.exit(0)
}

const scratch = mkdtempSync(join(tmpdir(), 'kit-update-'))
try {
  const source = await locate(arg)
  const kitSrc = source.kit
  const incoming = JSON.parse(readFileSync(join(kitSrc, 'package.json'), 'utf8'))
  log(`Updating to ${incoming.description ?? 'build kit'} (from ${source.label})`)

  // 1. The kit folder and workflow
  const kitDir = join(ROOT, KIT_DIR)
  if (existsSync(kitDir)) {
    for (const name of readdirSync(kitDir)) if (name !== 'node_modules' && name !== '.work') rmSync(join(kitDir, name), { recursive: true, force: true })
  }
  cpSync(kitSrc, kitDir, { recursive: true, filter: (src) => !/[\\/](node_modules|\.work)([\\/]|$)/.test(src) })
  log(`  ✓ ${KIT_DIR}/`)
  if (source.workflow) {
    mkdirSync(dirname(join(ROOT, WORKFLOW_FILE)), { recursive: true })
    cpSync(source.workflow, join(ROOT, WORKFLOW_FILE))
    log(`  ✓ ${WORKFLOW_FILE}`)
  }

  // 2. Prompts
  if (source.prompts) {
    for (const file of PROMPT_FILES) {
      if (!existsSync(join(source.prompts, file))) continue
      cpSync(join(source.prompts, file), join(ROOT, file))
      log(`  ✓ ${file}`)
    }
    // Entry by entry, so a repo's own skills and docs next to the kit's survive.
    for (const dir of PROMPT_DIRS) {
      if (!existsSync(join(source.prompts, dir))) continue
      mkdirSync(join(ROOT, dir), { recursive: true })
      for (const name of readdirSync(join(source.prompts, dir))) {
        rmSync(join(ROOT, dir, name), { recursive: true, force: true })
        cpSync(join(source.prompts, dir, name), join(ROOT, dir, name), { recursive: true })
      }
      log(`  ✓ ${dir}/`)
    }
  } else log('  – no prompts bundled with this kit (AGENTS.md, skills and docs left as they are)')

  // 3. Runtime modules in every game
  const templates = join(kitDir, 'templates')
  const replaced = []
  const added = []
  const forked = []
  const kept = []
  for (const game of listGames()) {
    const codeDir = existsSync(join(game.dir, 'src/game.js')) ? join(game.dir, 'src') : game.dir
    const present = RUNTIME_FILES.filter((f) => existsSync(join(codeDir, f)))
    if (!present.length) continue // not a kit game (no runtime files): leave it alone
    // Party games (they have party.js) get the party modules too; online games (net.js) the online ones
    // (a party game's net.js as well: party.js builds on it; its lobby is party-lobby.js).
    const party = existsSync(join(codeDir, 'party.js')) && existsSync(join(templates, 'party'))
    const online = existsSync(join(codeDir, 'net.js')) && existsSync(join(templates, 'online'))
    const onlineFiles = online ? ONLINE_RUNTIME_FILES.filter((f) => f === 'net.js' || existsSync(join(codeDir, f))) : []
    const files = [...RUNTIME_FILES.map((f) => ['shared', f]), ...(party ? PARTY_RUNTIME_FILES.map((f) => ['party', f]) : []), ...onlineFiles.map((f) => ['online', f])]
    for (const [group, file] of files) {
      const dest = join(codeDir, file)
      const fresh = readFileSync(join(templates, group, file), 'utf8')
      const rel = `${game.rel ? game.rel + '/' : ''}${codeDir === game.dir ? '' : 'src/'}${file}`
      if (!existsSync(dest)) {
        writeFileSync(dest, fresh)
        added.push(rel)
        continue
      }
      const current = readFileSync(dest, 'utf8')
      if (current === fresh) continue
      if (RUNTIME_HEADER_RE.test(current)) {
        writeFileSync(dest, fresh)
        replaced.push(rel)
      } else if (LEGACY_RUNTIME.has(file)) {
        writeFileSync(dest, fresh)
        forked.push(rel)
      } else kept.push(rel)
    }
  }
  if (replaced.length) log(`  ✓ runtime replaced: ${replaced.join(', ')}`)
  if (added.length) log(`  ✓ runtime added: ${added.join(', ')}`)
  if (forked.length) {
    log(`  ⚠ replaced without a runtime header (an older kit's copy, or hand-edited): ${forked.join(', ')}`)
    log(`    game-specific key aliases go through input.extendKeys({ KeyR: 'y' }) in game.js; re-add any other local changes there`)
  }
  if (kept.length) log(`  ⚠ kept (the game's own file shares a runtime name): ${kept.join(', ')}`)

  // 4. The kit's dependencies, so the next check uses the right versions
  if (!noInstall) {
    const install = spawnSync('npm', ['ci', '--prefix', kitDir, '--no-audit', '--no-fund'], { ...npmSpawn, cwd: ROOT, stdio: 'inherit' })
    if (install.status !== 0) log('  ⚠ npm ci in the kit folder failed; run `npm run setup`')
  }

  log(`\nKit v${KIT_VERSION} installed. Run \`npm run check\` for every game, then commit.`)
} catch (err) {
  log(`update-kit failed: ${err.message}`)
  process.exit(1)
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

/** Where the kit, workflow and prompts come from: { kit, workflow?, prompts?, label }. */
async function locate(arg) {
  if (arg === '--latest') return extract(await download(), 'the latest release')
  const path = resolve(arg)
  if (!existsSync(path)) throw new Error(`${arg} doesn't exist`)
  if (statSync(path).isFile()) {
    if (!path.endsWith('.zip')) throw new Error(`${arg} isn't a kit folder, a template repo or a kit.zip`)
    return extract(path, basename(path))
  }
  // A template repo (exported kit inside), or a bare kit folder.
  if (existsSync(join(path, KIT_DIR, 'config.mjs'))) {
    const workflow = join(path, WORKFLOW_FILE)
    return { kit: join(path, KIT_DIR), workflow: existsSync(workflow) ? workflow : null, prompts: existsSync(join(path, 'AGENTS.md')) ? path : null, label: arg }
  }
  if (existsSync(join(path, 'config.mjs'))) {
    const repoRoot = resolve(path, '../..')
    const workflow = join(repoRoot, WORKFLOW_FILE)
    return { kit: path, workflow: existsSync(workflow) ? workflow : null, prompts: existsSync(join(repoRoot, 'AGENTS.md')) ? repoRoot : null, label: arg }
  }
  throw new Error(`${arg} isn't a kit folder, a template repo or a kit.zip`)
}

/** kit.zip layout (see zip.mjs): kit/, workflow/<slug>.yml, prompts/. */
function extract(zip, label) {
  const dir = join(scratch, 'zip')
  mkdirSync(dir, { recursive: true })
  const tar = spawnSync('tar', ['-xf', zip, '-C', dir], { encoding: 'utf8' })
  if (tar.status !== 0) {
    const unzip = spawnSync('unzip', ['-q', zip, '-d', dir], { encoding: 'utf8' })
    if (unzip.status !== 0) throw new Error(`couldn't extract ${zip}: ${(tar.stderr || unzip.stderr || '').trim()}`)
  }
  if (!existsSync(join(dir, 'kit/config.mjs'))) throw new Error(`${label} doesn't contain a build kit (no kit/config.mjs)`)
  const workflow = join(dir, 'workflow', basename(WORKFLOW_FILE))
  return { kit: join(dir, 'kit'), workflow: existsSync(workflow) ? workflow : null, prompts: existsSync(join(dir, 'prompts')) ? join(dir, 'prompts') : null, label }
}

/** kit.zip from the newest launcher release, without a token (the releases repo is public). */
async function download() {
  const api = `https://api.github.com/repos/${brand.releasesRepo}/releases/latest`
  let release
  try {
    const res = await fetch(api, { headers: { accept: 'application/vnd.github+json', 'user-agent': `${brand.slug}-update-kit` } })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    release = await res.json()
  } catch (err) {
    throw new Error(`couldn't read the latest release of ${brand.releasesRepo} (${err.message}). Check your connection, or download ${KIT_ZIP} from https://github.com/${brand.releasesRepo}/releases/latest and run: npm run update-kit ${KIT_ZIP}`)
  }
  const asset = release.assets?.find((a) => a.name === KIT_ZIP)
  if (!asset) throw new Error(`release ${release.tag_name} of ${brand.releasesRepo} has no ${KIT_ZIP}; pass a path to a kit folder or template repo instead`)
  const res = await fetch(asset.browser_download_url, { headers: { 'user-agent': `${brand.slug}-update-kit` } })
  if (!res.ok) throw new Error(`downloading ${KIT_ZIP} failed: ${res.status} ${res.statusText}`)
  const file = join(scratch, KIT_ZIP)
  writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  log(`Downloaded ${KIT_ZIP} from ${release.tag_name}`)
  return file
}
