// npm run new-game <game-id> [--workshop] [--vite] [--phone [portrait|landscape]] [--online | --party [--controller pad|custom|motion]] [--players 2-4] [--name "Display Name"]
// Creates a game from the starter template: title, pause and settings screens that work with a
// controller, a keyboard, a mouse and touch, a manifest, and placeholder art.
//   Where: a repo with a games/ folder is a workshop (a collection of games), so the game goes in
//   games/<game-id>/. Otherwise the repo becomes this one game, at the root, unless --workshop
//   asks for a workshop (it creates games/). A repo that already has a game at the root can't
//   take another: finished workshop games move into repos like that with npm run promote.
//   default:   plain HTML + ES modules, no build step (best for most 2D games)
//   --vite:    a Vite project, for games that need npm packages (three.js, etc.)
//   --online:  online multiplayer through the shared relay: net.js, a controller lobby, and a
//              starter where the host runs the game. --players sets how many (default 2).
//   --party:   a party game: it runs on the TV and players join from their phones (QR code or
//              room code) or with local controllers. --controller pad (default) gives phones a
//              stick and A/B; --controller custom starts a phone screen of the game's own;
//              --controller motion makes the phone a motion controller (tilt, steering wheel,
//              swings) and adds motion.js, which reads it on the TV.
//              --players sets how many (default 2-8, up to 16).
//   --phone:   a phone game: the 720×1280 portrait or 1280×720 landscape space, the
//              "phone" manifest field, on-screen touch controls (touch.js), a layout inside the
//              safe area and text at the phone minimum. Works with --online; not with --party
//              (the TV runs a party game). The check adds the touch-only phone pass.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { brand, GAMES_DIR, KIT_DIR, MANIFEST_FILE, PARTY_RUNTIME_FILES, RUNTIME_FILES } from './config.mjs'
import { layout, log, npmSpawn, ROOT } from './repo.mjs'

const gamesRoot = join(ROOT, GAMES_DIR)

const args = process.argv.slice(2)
const vite = args.includes('--vite')
const workshop = args.includes('--workshop')
const online = args.includes('--online')
const party = args.includes('--party')
const valueOf = (flag) => (args.indexOf(flag) >= 0 ? args[args.indexOf(flag) + 1] : undefined)
const name = valueOf('--name')
const controller = valueOf('--controller') ?? 'pad'
const players = valueOf('--players') ?? (party ? '2-8' : online ? '2' : '1')
const ORIENTATIONS = ['portrait', 'landscape']
const phoneValue = valueOf('--phone')
const phone = args.includes('--phone') && ORIENTATIONS.includes(phoneValue) ? phoneValue : null
const id = args.find((a, i) => !a.startsWith('--') && !['--name', '--players', '--controller'].includes(args[i - 1]) && !(args[i - 1] === '--phone' && ORIENTATIONS.includes(a)))
const [minPlayers, maxPlayers = minPlayers] = players.split('-').map(Number)

if (!id || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) {
  log('Usage: npm run new-game <game-id> [--workshop] [--vite] [--phone portrait|landscape] [--online | --party [--controller pad|custom|motion]] [--players 2-4] [--name "Display Name"]')
  log('  game-id: lowercase letters, digits and dashes, e.g. tower-panic')
  process.exit(1)
}
if (!/^\d+(-\d+)?$/.test(players) || !(minPlayers >= 1 && maxPlayers >= minPlayers && maxPlayers <= (party ? 16 : 8)) || (online && minPlayers < 2)) {
  log('--players is a count or range like 2 or 2-4 (online games: 2 to 8; party games: up to 16)')
  process.exit(1)
}
if (online && party) {
  log('Pick one: --online (every player runs the game) or --party (the TV runs it, phones join)')
  process.exit(1)
}
if (args.includes('--phone') && !phone) {
  log('--phone needs how the phone is held: --phone portrait (720×1280) or --phone landscape (1280×720)')
  process.exit(1)
}
if (phone && party) {
  log("A party game runs on the TV, so it isn't a phone game: drop --phone (phones join it as controllers)")
  process.exit(1)
}
if (!['pad', 'custom', 'motion'].includes(controller)) {
  log('--controller is pad (a stick and A/B on the phone), custom (the game draws its own phone screen) or motion (the phone is a motion controller)')
  process.exit(1)
}
if (layout() === 'single') {
  log(`This repo is already a game (${MANIFEST_FILE} at the root): one game per repo. Start the next one in a new repo from the games template (or a workshop: new-game --workshop there).`)
  process.exit(1)
}
// --workshop on a fresh repo: make it a workshop (games/), so this and later games live side by side.
if (workshop) mkdirSync(gamesRoot, { recursive: true })
// No games/ folder: this repo becomes the game itself.
const single = !existsSync(gamesRoot)
const dir = single ? ROOT : join(gamesRoot, id)
/** Where the game's files are, for messages: '' at the root, 'games/<id>/' in a collection. */
const at = single ? '' : `${GAMES_DIR}/${id}/`
if (!single && existsSync(dir)) {
  log(`games/${id} already exists.`)
  process.exit(1)
}
if (single) {
  const taken = ['index.html', 'game.js', 'src', 'art', 'vite.config.js'].filter((f) => existsSync(join(ROOT, f)))
  if (taken.length) {
    log(`This repo already has ${taken.join(', ')} at the root. Move them aside (or start from a fresh copy of the games template) before making a game here.`)
    process.exit(1)
  }
}

const title = name ?? id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
const templates = join(import.meta.dirname, 'templates')
/** The drawing space: the Deck's 1280×800, or the phone space for the chosen orientation. */
const space = phone === 'portrait' ? { w: 720, h: 1280 } : phone === 'landscape' ? { w: 1280, h: 720 } : { w: 1280, h: 800 }
const fill = (text) =>
  text
    .replaceAll('{{NAME}}', title)
    .replaceAll('{{ID}}', id)
    .replaceAll('{{W}}', String(space.w))
    .replaceAll('{{H}}', String(space.h))
    .replaceAll('{{PHONE}}', String(Boolean(phone)))
    .replaceAll('{{ORIENTATION}}', phone ? `, orientation: '${phone}'` : '')
    .replaceAll('{{SLUG}}', brand.slug)
    .replaceAll('{{BRAND}}', brand.name)
    .replaceAll('{{MIN_PLAYERS}}', String(minPlayers))
    .replaceAll('{{MAX_PLAYERS}}', String(maxPlayers))

/** Copy a template folder, filling placeholders in text files. */
function copyTemplate(from, to) {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from)) {
    const src = join(from, entry)
    const dest = join(to, entry)
    if (statSync(src).isDirectory()) copyTemplate(src, dest)
    else writeFileSync(dest, fill(readFileSync(src, 'utf8')))
  }
}

const codeDir = vite ? join(dir, 'src') : dir
copyTemplate(join(templates, 'static'), codeDir)
if (online) copyTemplate(join(templates, 'online'), codeDir) // its game.js replaces the offline one
if (party) {
  // party.js uses net.js's change tracking; the rest of net.js goes unused.
  writeFileSync(join(codeDir, 'net.js'), fill(readFileSync(join(templates, 'online/net.js'), 'utf8')))
  for (const file of [...PARTY_RUNTIME_FILES, 'game.js']) writeFileSync(join(codeDir, file), fill(readFileSync(join(templates, 'party', file), 'utf8')))
  // The phone screen sits next to index.html (in public/ for Vite, so it's copied as is).
  const page = fill(readFileSync(join(templates, 'party-controllers', `${controller}.html`), 'utf8'))
  mkdirSync(vite ? join(dir, 'public') : dir, { recursive: true })
  writeFileSync(join(vite ? join(dir, 'public') : dir, 'controller.html'), page)
  // Motion: the TV side that reads it (the game's own code, not a runtime file).
  if (controller === 'motion') writeFileSync(join(codeDir, 'motion.js'), fill(readFileSync(join(templates, 'party-motion/motion.js'), 'utf8')))
}
// The runtime modules; `npm run update-kit` replaces them later, so extend them from game.js.
for (const file of RUNTIME_FILES) writeFileSync(join(codeDir, file), fill(readFileSync(join(templates, 'shared', file), 'utf8')))
copyTemplate(join(templates, 'shared/art'), join(dir, 'art'))

const manifest = {
  $schema: `${single ? './' : '../../'}${KIT_DIR}/manifest.schema.json`,
  id,
  name: title,
  description: '',
  version: '0.1.0',
  entry: { web: 'index.html' },
  art: { cover: 'art/cover.svg', hero: 'art/hero.svg' },
  controls: 'gamepad',
  inputs: ['gamepad', 'keyboard', 'mouse', 'touch'],
  players,
  tags: [],
  ...(online ? { tags: ['online multiplayer'], online: true } : {}),
  ...(party ? { tags: ['party', 'local multiplayer'], party: true } : {}),
  ...(phone ? { phone: { orientation: phone } } : {})
}

if (vite) {
  // index.html lives at the project root for Vite; the game code lives in src/.
  const html = readFileSync(join(codeDir, 'index.html'), 'utf8').replace('./game.js', './src/game.js')
  writeFileSync(join(dir, 'index.html'), html)
  rmSync(join(codeDir, 'index.html'))
  if (single) {
    // The repo's own package.json holds the kit's scripts (dev, check…); add the build next to them.
    const file = join(ROOT, 'package.json')
    const pkg = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { private: true, type: 'module' }
    pkg.name = id
    pkg.scripts = { ...pkg.scripts, build: 'vite build' }
    pkg.devDependencies = { vite: pkg.devDependencies?.vite ?? '^7.3.7', ...pkg.devDependencies }
    writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
  } else {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: id, private: true, type: 'module', scripts: { dev: 'vite', build: 'vite build' } }, null, 2) + '\n'
    )
  }
  // Relative base so the build works from any folder.
  writeFileSync(join(dir, 'vite.config.js'), `import { defineConfig } from 'vite'\n\nexport default defineConfig({ base: './' })\n`)
  manifest.build = { preset: 'vite', output: 'dist' }
}

writeFileSync(join(dir, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + '\n')

// Refresh package-lock.json so CI's install matches (a Vite game is the root package or an npm
// workspace). Commit it.
if (vite) spawnSync('npm', ['install', '--no-audit', '--no-fund'], { ...npmSpawn, cwd: ROOT, stdio: 'inherit' })

const kind = `${vite ? 'Vite' : 'plain HTML'}${phone ? `, ${phone} phone game (${space.w}×${space.h})` : ''}${online ? ', online' : ''}${party ? `, party with a ${controller} phone controller` : ''}`
log(single ? `Created ${title} at the root of this repo (${kind}). This repo is now that one game.` : `Created games/${id}/ (${kind}).${workshop ? ' This repo is a workshop: make more games with new-game, and move finished ones into their own repos with npm run promote.' : ''}`)
log('Next:')
log(`  1. Write the game in ${at}${vite ? 'src/' : ''}game.js. Keep its title, pause and settings screens:`)
log(`     input.js, menu.js, fit.js, audio.js, save.js, settings.js and prompts.js make them work with every input.`)
if (online) log(`     Online: the host runs the rules in hostUpdate() and writes net.state; everyone draws net.view. Don't edit net.js or lobby.js.`)
if (phone) log(`     Phone: lay everything out in ${space.w}×${space.h}, inside fit.safe (notch and home bar); text ≥ 32px; touch.js gives the stick and buttons. Read docs/game-design/phone.md.`)
if (party) {
  log(`     Party: the TV runs everything. party.public goes to every phone, party.view(id) to one phone only.`)
  log(`     The phone screen is ${at}${vite ? 'public/' : ''}controller.html. Don't edit party.js, party-lobby.js, qr.js, controller.js or net.js.`)
  if (controller === 'motion') log(`     Motion: const motion = createMotion(party) from motion.js; motion.update(dt) each frame, then motion.of(id).tilt / .wheel / .swings. Read docs/game-design/motion.md.`)
}
const target = single ? '' : ` ${id}`
log(`  2. Fill in "description" and "tags" in ${at}${MANIFEST_FILE} (drop inputs gameplay can't support).`)
log(`  3. Replace ${at}art/cover.svg and hero.svg with real art.`)
log(`  4. npm run dev${target}   → play it in a browser (add ?debug to the URL for the state overlay)`)
log(`  5. npm run check${target} → must pass before pushing`)
if (vite) log(`  npm packages: npm install <pkg>${single ? '' : ` --workspace games/${id}`}`)
