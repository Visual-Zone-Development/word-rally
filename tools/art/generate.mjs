// npm run art -- [game-id] [asset ...] [--force] [--dry] [--list] [--max N] [--quality low|medium|high] [--provider name] [--approve <$>]
//
// It never spends money before the person paying knows. In a terminal it shows the cost and asks first.
// Anywhere else (an agent, CI) it stops at the estimate unless --approve <$> covers it, and an agent
// passes --approve only after the person has agreed to that amount.
//
// Optional: generates sprites, textures or key art for a game with YOUR image API key, from the
// game's art/prompts.json (a style contract plus a list of assets; see
// docs/game-design/generated-art.md). Runs only on your machine or in your agent's session, never
// in the shipped game: the images are saved into the game folder and bundled like any other asset.
//
// Keys come from the environment (a cloud agent's environment settings) or from a .env file at the
// repo root: OPENAI_API_KEY, GEMINI_API_KEY or REPLICATE_API_TOKEN. With none set, this explains
// how to add one and exits without doing anything. Games never need it: art drawn in code is the default.
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { layout, listGames } from '../../.github/pushplay/repo.mjs'
import { createInterface } from 'node:readline/promises'

const ROOT = join(import.meta.dirname, '../..')
const ENV_FILE = join(ROOT, '.env')
// Keys already in the environment win; .env only fills in what's missing.
if (existsSync(ENV_FILE)) {
  try {
    process.loadEnvFile(ENV_FILE)
  } catch (err) {
    console.warn(`! couldn't read .env: ${err.message}`)
  }
}

const { default: PROVIDERS } = await import('./providers/index.mjs')

/**
 * Rough US$ per image, from public price lists in October 2026. Only used for the estimate printed
 * before anything is generated; check your provider's pricing page for real numbers.
 */
const PRICES = {
  openai: { low: 0.01, medium: 0.05, high: 0.21 },
  gemini: { low: 0.04, medium: 0.04, high: 0.04 },
  replicate: { low: 0.04, medium: 0.04, high: 0.04 }
}
const KEY_COLOR = '#ff00ff'
const CONCURRENCY = 4

// ---- arguments -------------------------------------------------------------------------------

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}
const optionValues = new Set(['max', 'quality', 'provider', 'approve'].map((n) => option(n, null)).filter(Boolean))
const positional = args.filter((a) => !a.startsWith('--') && !optionValues.has(a))
// A one-game repo needs no id: the game is the repo, and every name is an asset.
const single = layout() === 'single'
const [id, ...names] = single ? [listGames()[0]?.id, ...positional] : positional

if (!id) {
  console.log('Usage: npm run art -- [game-id] [asset ...] [--dry] [--list] [--force] [--max N] [--quality low|medium|high] [--provider openai|gemini|replicate] [--approve <$>]')
  process.exit(1)
}
const gameDir = single ? ROOT : join(ROOT, 'games', id)
if (!existsSync(gameDir)) {
  console.error(`No game "${id}" in games/.`)
  process.exit(1)
}

// ---- the catalog -----------------------------------------------------------------------------

const catalogPath = join(gameDir, 'art', 'prompts.json')
if (!existsSync(catalogPath)) {
  console.log(`${rel(catalogPath)} doesn't exist yet. Create it to describe the art to generate, e.g.:

{
  "style": "Top-down 2D game art for a cozy farming game. Soft hand-painted look, light from the upper left, warm palette (#f6e7d0 paper, #7fb069 leaf, #e6aa68 honey), bold readable silhouettes at 64 px. No text or logos.",
  "clauses": { "isolated": "A single object centred with generous empty margin, no ground, no shadow, no frame." },
  "quality": "medium",
  "assets": [
    { "id": "pumpkin", "prompt": "A giant prize pumpkin with a curly stem.", "use": ["isolated"], "transparent": true, "out": 256 }
  ]
}

See docs/game-design/generated-art.md.`)
  process.exit(0)
}
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
const quality = option('quality', catalog.quality ?? 'medium')
const rawDir = join(gameDir, 'art', 'raw')
const outDir = join(gameDir, 'assets', 'art')

const promptFor = (asset, keyed) =>
  [
    asset.prompt,
    ...(asset.use ?? []).map((c) => catalog.clauses?.[c] ?? ''),
    catalog.style ?? '',
    keyed ? `The background is one perfectly flat, uniform ${KEY_COLOR} magenta colour filling the whole image edge to edge (no gradient, no texture, no shadow on it), and the subject contains no magenta or pink.` : ''
  ]
    .filter(Boolean)
    .join(' ')

const matches = (asset) => !names.length || names.some((n) => new RegExp('^' + n.split('*').map(escapeRe).join('.*') + '$').test(asset.id))
function escapeRe(s) {
  return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
}

if (flag('list')) {
  for (const a of catalog.assets ?? []) console.log(`${existsSync(join(outDir, `${a.id}.png`)) ? '✓' : ' '} ${a.id}`)
  process.exit(0)
}

// ---- provider --------------------------------------------------------------------------------

const wanted = option('provider', process.env.ART_PROVIDER)
const provider = wanted ? PROVIDERS.find((p) => p.name === wanted) : PROVIDERS.find((p) => process.env[p.keyVar])
if (wanted && !provider) {
  console.error(`Unknown provider "${wanted}". Use one of: ${PROVIDERS.map((p) => p.name).join(', ')}.`)
  process.exit(1)
}
const hasKey = provider && process.env[provider.keyVar]

const todo = (catalog.assets ?? []).filter(matches).filter((a) => flag('force') || !existsSync(join(outDir, `${a.id}.png`)))
if (!todo.length) {
  console.log(names.length ? `No matching assets need generating (add --force to redo them).` : 'Every asset in prompts.json already exists (add names and --force to redo some).')
  process.exit(0)
}
const keyedFor = (a) => !!a.transparent && !provider?.nativeAlpha
const price = PRICES[provider?.name ?? 'openai']?.[quality] ?? 0.05
const estimate = (todo.length * price).toFixed(2)
console.log(`${todo.length} asset(s) to generate${provider ? ` with ${provider.name} (${provider.model}, ${quality})` : ''}: about $${estimate} at ~$${price}/image.`)

if (flag('dry')) {
  for (const a of todo) console.log(`\n• ${a.id} (${a.size ?? '1024x1024'}${a.transparent ? ', transparent' : ''})\n  ${promptFor(a, keyedFor(a))}`)
  console.log(`\nNothing was generated or charged. Generating these costs about $${estimate} on your ${provider?.name ?? 'image provider'} account.`)
  process.exit(0)
}
if (!hasKey) {
  console.log(`
No image API key is set, so nothing was generated. That's fine: every game can draw its art in code
(the art-direction, pixel-art and threejs-models skills). To generate art with your own key, set ONE of these:

  OPENAI_API_KEY        OpenAI image models (native transparency)
  GEMINI_API_KEY        Google Gemini image models
  REPLICATE_API_TOKEN   Replicate (FLUX and others; REPLICATE_IMAGE_MODEL picks one)

On your computer: copy .env.example to .env at the repo root and fill one in (.env is gitignored).
In a cloud agent (Claude Code on the web, Codex): add it to the environment's variables.
Then run: npm run art -- ${single ? "" : id + " "}--dry   (see the prompts and cost), and without --dry to generate.`)
  process.exit(0)
}
const max = Number(option('max', 12))
if (todo.length > max) {
  console.error(`That's more than --max ${max} images in one run. Generate a few first and look at them, or pass --max ${todo.length}.`)
  process.exit(1)
}
if (!(await approved())) process.exit(2)

// ---- generate --------------------------------------------------------------------------------

mkdirSync(rawDir, { recursive: true })
mkdirSync(outDir, { recursive: true })
ensureIgnored()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function one(asset) {
  const keyed = keyedFor(asset)
  const req = { prompt: promptFor(asset, keyed), size: asset.size ?? '1024x1024', transparent: !!asset.transparent, quality }
  for (let attempt = 1; ; attempt++) {
    try {
      const png = await provider.generate(req)
      writeFileSync(join(rawDir, `${asset.id}.png`), png)
      return { asset, png, keyed }
    } catch (err) {
      const transient = !err.status || err.status === 429 || err.status >= 500
      if (!transient || attempt >= 4) throw err
      const wait = 2000 * 2 ** attempt + Math.random() * 1000
      console.log(`  retry ${asset.id} in ${Math.round(wait / 1000)}s: ${err.message}`)
      await sleep(wait)
    }
  }
}

const done = []
const failed = []
const queue = [...todo]
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (let a; (a = queue.shift()); ) {
      const t = Date.now()
      try {
        done.push(await one(a))
        console.log(`  ✓ ${a.id} in ${Math.round((Date.now() - t) / 1000)}s`)
      } catch (err) {
        failed.push(a.id)
        console.log(`  ✗ ${a.id}: ${err.message}`)
      }
    }
  })
)

if (done.length) {
  const { processImages, contactSheet } = await import('./process.mjs') // needs the kit's browser: npm run setup
  const processed = await processImages(done.map((d) => ({ png: d.png, key: d.keyed, out: d.asset.out })))
  done.forEach((d, i) => writeFileSync(join(outDir, `${d.asset.id}.png`), processed[i]))
  const sheetDir = join(ROOT, '.github/pushplay/.work/out', id, '__shots')
  mkdirSync(sheetDir, { recursive: true })
  const sheet = join(sheetDir, 'generated.png')
  writeFileSync(sheet, await contactSheet(done.map((d, i) => ({ name: d.asset.id, png: processed[i] }))))
  credit(done.map((d) => d.asset.id))
  console.log(`\nSaved ${done.length} image(s) to ${rel(outDir)}/ (raws in ${rel(rawDir)}/, not shipped).`)
  console.log(`Look at the contact sheet before using them: ${rel(sheet)}`)
}
if (failed.length) {
  console.log(`Failed: ${failed.join(' ')}`)
  process.exit(1)
}

// ---- bookkeeping -----------------------------------------------------------------------------

/**
 * The person paying must know the cost before anything is charged. --approve <$> means they agreed to
 * at most that amount. Without it a terminal asks, and anything else (an agent, CI) stops here.
 */
async function approved() {
  const given = option('approve', null)
  if (given !== null) {
    const limit = Number(String(given).replace(/^\$/, ''))
    if (Number.isFinite(limit) && limit >= Number(estimate)) return true
    console.error(`\nNot generating: this run costs about $${estimate}, more than the $${given} approved. Nothing was charged.`)
    return false
  }
  if (process.stdin.isTTY && process.stdout.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = await rl.question(`This charges about $${estimate} to your ${provider.name} account. Generate ${todo.length} image(s)? [y/N] `)
    rl.close()
    if (/^y(es)?$/i.test(answer.trim())) return true
    console.log('Cancelled. Nothing was charged.')
    return false
  }
  console.error(`
Not generating yet: this would charge about $${estimate} to the ${provider.name} account for ${todo.length} image(s):
  ${todo.map((a) => a.id).join(', ')}
Nothing was charged. Ask the person who pays whether to spend about $${estimate}. Only once they agree, run:
  npm run art -- ${args.join(' ')} --approve ${estimate}`)
  return false
}

function rel(p) {
  return relative(process.cwd(), p) || '.'
}

/** Raws stay in the repo for reprocessing but out of the build. */
function ensureIgnored() {
  const file = join(gameDir, '.pushplayignore')
  const text = existsSync(file) ? readFileSync(file, 'utf8') : ''
  if (!text.split('\n').some((l) => l.trim() === 'art/raw/')) appendFileSync(file, `${text && !text.endsWith('\n') ? '\n' : ''}art/raw/\n`)
}

/** Keep a generated-art section in assets/CREDITS.md up to date; the rest of the file is left alone. */
function credit(ids) {
  const file = join(gameDir, 'assets', 'CREDITS.md')
  const begin = '<!-- generated-art:begin -->'
  const end = '<!-- generated-art:end -->'
  let text = existsSync(file) ? readFileSync(file, 'utf8') : '# Credits\n'
  const rows = new Map()
  const old = text.includes(begin) ? text.slice(text.indexOf(begin), text.indexOf(end) + end.length) : ''
  for (const m of old.matchAll(/^\| `([^`]+)` \| (.+) \|$/gm)) rows.set(m[1], m[2])
  const date = new Date().toISOString().slice(0, 10)
  for (const a of ids) rows.set(`art/${a}.png`, `${provider.name} ${provider.model}, ${date} | Generated from art/prompts.json; see the provider's terms`)
  const section = [begin, '## Generated art', '', '| File | Made with | Notes |', '|---|---|---|', ...[...rows].map(([f, v]) => `| \`${f}\` | ${v} |`), end].join('\n')
  text = old ? text.replace(old, section) : `${text.trimEnd()}\n\n${section}\n`
  writeFileSync(file, text)
}
