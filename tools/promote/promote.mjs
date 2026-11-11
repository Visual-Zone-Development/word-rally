// npm run promote <game-id> [-- --repo owner/name] [--private] [--keep] [--template owner/repo[#ref]] [--out dir] [--no-create] [--skip-check] [--yes]
//
// Moves a finished game out of this workshop into its own repo, so it can be listed on PushPlay's
// Discover tab and get its own releases:
//   1. checks the game (npm run check <id>) unless --skip-check
//   2. builds the new repo from the one-game template (its build kit, agent prompts, skills and
//      docs), with the game's files at the root and `movedFrom` in pushplay.json, so the launcher
//      moves players' copies over with their saves and play time
//   3. creates the GitHub repo (public unless --private) and pushes it; the first push builds and
//      publishes the game (--no-create stops after writing the folder, for agents that create
//      repos another way)
//   4. removes games/<id> from this workshop and commits that (--keep leaves it); push to finish
//
// Needs git and Node. Creating the repo needs `gh` signed in (or GH_TOKEN with permission to
// create repos, as in the "Promote a game" workflow).
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { brand, MANIFEST_FILE } from '../../.github/pushplay/config.mjs'
import { findGame, listGames, readManifest, ROOT } from '../../.github/pushplay/repo.mjs'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const VALUED = ['--repo', '--template', '--out']
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const id = args.find((a, i) => !a.startsWith('--') && !VALUED.includes(args[i - 1]))
const say = (msg = '') => console.log(msg)
const fail = (msg) => {
  console.error(`✗ ${msg}`)
  process.exit(1)
}
const run = (cmd, argv, opts = {}) => execFileSync(cmd, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...opts }).trim()
const has = (cmd) => spawnSync(cmd, ['--version'], { stdio: 'ignore' }).status === 0

const game = id && findGame(id)
if (game && !game.rel) fail("This repo is already one game with its own repo: there's nothing to promote. Promote is for workshops (games in games/).")
if (!game) fail(`Usage: npm run promote <game-id>   (games here: ${listGames().map((g) => g.id).join(', ') || 'none'})`)
const manifest = readManifest(game)

// This workshop, as owner/repo: where the game is moving from.
const workshop = process.env.GITHUB_REPOSITORY ?? repoFromRemote()
if (!workshop) fail("Can't tell this repo's owner/name from its git remote. Set GITHUB_REPOSITORY=owner/repo.")
const [owner] = workshop.split('/')
const target = option('--repo') ?? `${owner}/${id}`
if (!/^[\w.-]+\/[\w.-]+$/.test(target)) fail(`--repo must be owner/name, not ${target}`)
const repoName = target.split('/')[1]
const templateArg = option('--template') ?? `${brand.launcherRepo.split('/')[0]}/${brand.slug}-games`
const [templateRepo, templateRef] = templateArg.split('#')
const create = !flag('--no-create')
const inActions = Boolean(process.env.GITHUB_ACTIONS)

// 1. Only promote games that pass.
if (!flag('--skip-check')) {
  say(`Checking ${id}…`)
  const check = spawnSync(process.execPath, [join(ROOT, '.github/pushplay/check.mjs'), id], { cwd: ROOT, stdio: 'inherit' })
  if (check.status !== 0) fail('npm run check failed. Fix the game first (or pass --skip-check when the headless browser is unavailable; the new repo checks it again on its first build).')
}
if (create && !inActions && !has('gh')) fail('Creating the repo needs the GitHub CLI (gh). Install it, or pass --no-create and create the repo another way.')

// 2. The new repo: the one-game template, then the game at its root.
const out = resolve(option('--out') ?? (inActions ? mkdtempSync(join(tmpdir(), 'promote-')) : join(ROOT, '..', repoName)))
if (existsSync(out) && readdirSync(out).length) fail(`${out} already exists and isn't empty. Pick another --out.`)
say(`Getting the one-game template (${templateArg})…`)
run('git', ['clone', '-q', '--depth', '1', ...(templateRef ? ['--branch', templateRef] : []), `https://github.com/${templateRepo}.git`, out])
rmSync(join(out, '.git'), { recursive: true, force: true })
if (existsSync(join(out, 'games'))) fail(`${templateArg} still holds games in games/: it isn't the one-game template. Pass --template with one that is.`)
if (existsSync(join(out, MANIFEST_FILE))) fail(`${templateArg} already has a game at its root. Pass --template with the empty one-game template.`)

say(`Copying ${game.rel} into ${out}`)
const skip = new Set(['node_modules', 'dist', '.git'])
for (const entry of readdirSync(game.dir)) {
  if (skip.has(entry)) continue
  if (entry === 'package.json' || entry === 'package-lock.json') continue // merged below
  cpSync(join(game.dir, entry), join(out, entry), { recursive: true })
}

const moved = { ...manifest, $schema: `./${'.github'}/${brand.slug}/manifest.schema.json`, movedFrom: workshop }
writeFileSync(join(out, MANIFEST_FILE), JSON.stringify(moved, null, 2) + '\n')

// A Vite game was an npm workspace here; in its own repo it's the root package.
const own = readJson(join(game.dir, 'package.json'))
const pkg = readJson(join(out, 'package.json')) ?? { private: true, type: 'module' }
pkg.name = repoName
pkg.description = manifest.description ?? pkg.description
if (own) {
  pkg.scripts = { ...pkg.scripts, ...(own.scripts?.build ? { build: own.scripts.build } : {}) }
  pkg.dependencies = { ...pkg.dependencies, ...own.dependencies }
  pkg.devDependencies = { ...pkg.devDependencies, ...own.devDependencies }
}
delete pkg.workspaces
writeFileSync(join(out, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')

writeFileSync(
  join(out, 'README.md'),
  `# ${manifest.name}

${manifest.description ?? ''}

## Play

- **PushPlay (Steam Deck, Legion Go, PC):** follow the account that owns this repo in PushPlay (Add game → Follow a GitHub account), or find it on the Discover tab once it's listed. Every push to \`main\` builds and publishes it.
- **Browser:** \`npm run setup\`, then \`npm run dev\` (http://localhost:5173).

Moved here from [${workshop}](https://github.com/${workshop}). Agents: the rules are in [\`AGENTS.md\`](AGENTS.md); the design brief is [\`DESIGN.md\`](DESIGN.md).
`
)

say('npm install (for package-lock.json)…')
const install = spawnSync('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts'], { cwd: out, stdio: 'inherit' })
if (install.status !== 0) say(`⚠ npm install failed in ${out}. Run it there before pushing and commit package-lock.json.`)
rmSync(join(out, 'node_modules'), { recursive: true, force: true })

const git = (...a) => run('git', a, { cwd: out })
git('init', '-q', '-b', 'main')
git('add', '-A')
git('-c', 'user.name=' + gitIdentity('name'), '-c', 'user.email=' + gitIdentity('email'), 'commit', '-q', '-m', `${manifest.name}: moved here from ${workshop}`)
say(`✓ ${out} is ready (one commit).`)

// 3. Create the repo and push.
if (create) {
  const visibility = flag('--private') ? '--private' : '--public'
  say(`Creating ${target} (${visibility.slice(2)})…`)
  const made = spawnSync('gh', ['repo', 'create', target, visibility, '--description', (manifest.description ?? manifest.name).slice(0, 350)], { stdio: 'inherit' })
  if (made.status !== 0) fail(`Couldn't create ${target}. Create it another way, then: git -C ${out} remote add origin https://github.com/${target}.git && git -C ${out} push -u origin main`)
  spawnSync('gh', ['repo', 'edit', target, '--add-topic', brand.topic], { stdio: 'ignore' })
  if (inActions && process.env.GH_TOKEN) {
    // The workflow's checkout credentials only reach the workshop; push with the promote token.
    git('-c', 'http.https://github.com/.extraheader=', 'push', '-q', `https://x-access-token:${process.env.GH_TOKEN}@github.com/${target}.git`, 'main')
  } else {
    spawnSync('gh', ['auth', 'setup-git'], { stdio: 'ignore' })
    git('remote', 'add', 'origin', `https://github.com/${target}.git`)
    git('push', '-q', '-u', 'origin', 'main')
  }
  say(`✓ Pushed https://github.com/${target}. Its first build runs now and publishes the game.`)
}

// 4. Out of the workshop.
if (!flag('--keep') && create) {
  rmSync(game.dir, { recursive: true, force: true })
  // A Vite game was an npm workspace: refresh the lockfile without it.
  if (own) spawnSync('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts'], { cwd: ROOT, stdio: 'inherit' })
  run('git', ['add', '-A', game.rel, ...(own ? ['package-lock.json'] : [])], { cwd: ROOT })
  run('git', ['-c', 'user.name=' + gitIdentity('name'), '-c', 'user.email=' + gitIdentity('email'), 'commit', '-q', '-m', `${manifest.name}: moved to ${target}`], { cwd: ROOT })
  say(`✓ Removed ${game.rel} and committed. Push this repo to finish.`)
}

say(`
Next:
${create ? '' : `  - Create ${target} on GitHub (empty, ${flag('--private') ? 'private' : 'public'}), then: git -C ${out} remote add origin https://github.com/${target}.git && git -C ${out} push -u origin main\n  - Once it's pushed, take it out of this workshop: git rm -r -q ${game.rel} && git commit -m "${manifest.name}: moved to ${target}"\n`}  - In PushPlay: follow ${owner} (Add game → Follow a GitHub account) and the game moves to the new repo on its own, saves and all.
  - To list it on Discover, connect ${target} in Studio.
  - Future work on the game happens in the new repo: open a session there.`)

// --- helpers ---

function repoFromRemote() {
  try {
    const url = run('git', ['remote', 'get-url', 'origin'], { cwd: ROOT })
    const m = /github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(url)
    return m ? `${m[1]}/${m[2]}` : null
  } catch {
    return null
  }
}

function gitIdentity(key) {
  try {
    return run('git', ['config', `user.${key}`], { cwd: ROOT }) || fallback()
  } catch {
    return fallback()
  }
  function fallback() {
    return key === 'name' ? 'github-actions[bot]' : '41898283+github-actions[bot]@users.noreply.github.com'
  }
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}
