// Bake sprite sheets to PNG ahead of time (pixel-art skill). High-detail sheets take seconds to minutes to
// render, too slow for game start, so render them once here and ship the PNGs.
//
//   node .claude/skills/pixel-art/bake.mjs <root-dir> <page> [out-dir]
//   e.g. node .claude/skills/pixel-art/bake.mjs . tools/bake.html assets/sprites
//
// <root-dir> is served over HTTP; <page> (relative to it) renders the sheets and sets
//   window.__bake = [{ name, canvas, meta? }, …]   then   window.__bakeDone = true
// Each entry is written to <out-dir>/<name>.png (+ <name>.json when meta is given). Keep the page in the game's
// tools/ folder: the build skips it, and it can import the game's own models and the toolkit copies.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'

const [root, page, outArg] = process.argv.slice(2)
if (!root || !page) {
  console.error('usage: node bake.mjs <root-dir> <page> [out-dir]')
  process.exit(1)
}
const out = path.resolve(outArg || path.join(root, 'assets', 'sprites'))
fs.mkdirSync(out, { recursive: true })

async function loadPlaywright() {
  try { return await import('playwright') } catch {}
  for (const base of [path.resolve('.github/pushplay/package.json'), path.resolve('package.json')]) {
    try { return createRequire(base)('playwright') } catch {}
  }
  const g = execSync('npm root -g').toString().trim()
  return createRequire(path.join(g, 'noop.js'))('playwright')
}

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }
const server = http.createServer((req, res) => {
  const p = path.join(path.resolve(root), decodeURIComponent(new URL(req.url, 'http://x').pathname))
  if (!p.startsWith(path.resolve(root)) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end() }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' })
  fs.createReadStream(p).pipe(res)
})
await new Promise((r) => server.listen(0, r))
const port = server.address().port

const { chromium } = await loadPlaywright()
const browser = await chromium.launch()
const tab = await browser.newPage()
tab.on('pageerror', (e) => console.error('page error:', e.message))
tab.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()))
const t0 = Date.now()
await tab.goto(`http://localhost:${port}/${page}`)
await tab.waitForFunction(() => window.__bakeDone === true, null, { timeout: 30 * 60 * 1000, polling: 500 })
const items = await tab.evaluate(() => window.__bake.map((b) => ({ name: b.name, url: b.canvas.toDataURL('image/png'), meta: b.meta ?? null })))
for (const it of items) {
  fs.writeFileSync(path.join(out, `${it.name}.png`), Buffer.from(it.url.split(',')[1], 'base64'))
  if (it.meta) fs.writeFileSync(path.join(out, `${it.name}.json`), JSON.stringify(it.meta, null, 2))
  console.log(`wrote ${path.relative(process.cwd(), path.join(out, it.name))}.png`)
}
console.log(`baked ${items.length} sheet(s) in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
await browser.close()
server.close()
