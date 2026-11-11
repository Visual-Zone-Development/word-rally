// npm run art:shots [game-id]   (the id only in a repo with several games in games/)
// Renders a game's art pages to PNG so you (or the agent) can look at them: every .html and .svg in
// the game's art/ folder (cover, hero, gallery and any others) at its own size, plus a thumbnail of the
// cover at library-tile size. Needs no API key. Output: .github/pushplay/.work/out/<id>/__shots/
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { launchBrowser } from '../../.github/pushplay/pipeline.mjs'
import { serve } from '../../.github/pushplay/server.mjs'
import { ART, ART_FONTS } from '../../.github/pushplay/config.mjs'
import { findGame, layout, listGames, outDir } from '../../.github/pushplay/repo.mjs'

// A one-game repo needs no id: the game is the repo.
const id = process.argv[2] ?? (layout() === 'single' ? listGames()[0]?.id : undefined)
const game = id && findGame(id)
if (!game) {
  console.error(id ? `No game "${id}" here.` : 'Usage: npm run art:shots <game-id>   (repos with several games)')
  process.exit(1)
}
const artDir = join(game.dir, 'art')
const manifest = JSON.parse(readFileSync(game.manifestPath, 'utf8'))
// Cover and hero: only the files the manifest points at (an old cover.svg next to cover.html is skipped).
const inUse = new Set(Object.values(manifest.art ?? {}).map((p) => p.replace(/^art\//, '')))
const pages = readdirSync(artDir).filter((f) => /\.(html|svg)$/i.test(f) && (!/^(cover|hero)\./i.test(f) || inUse.has(f)))
const out = join(outDir(id), '__shots')
mkdirSync(out, { recursive: true })

const kitRequire = createRequire(join(import.meta.dirname, '../../.github/pushplay/pipeline.mjs'))
const fontsource = dirname(dirname(kitRequire.resolve('@fontsource/rubik/package.json')))
const server = await serve({ '/__src/': game.dir, '/__fonts/': fontsource })
const fontCss = Object.entries(ART_FONTS)
  .flatMap(([family, [pkg, weights]]) => weights.map((w) => `@font-face{font-family:'${family}';font-weight:${w};src:url(${server.url}/__fonts/${pkg}/files/${pkg}-latin-${w}-normal.woff2) format('woff2')}`))
  .join('\n')

// Size: cover/hero use the launcher's sizes; anything else uses its root element's size.
const sizeOf = (name) => ART[name.replace(/\.\w+$/, '')] ?? null
const browser = await launchBrowser()
const written = []
try {
  for (const file of pages) {
    const size = sizeOf(file) ?? { width: 1280, height: 800 }
    const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    await page.goto(`${server.url}/__src/art/${encodeURI(file)}`, { waitUntil: 'load' })
    await page.evaluate(async (css) => {
      const doc = document.documentElement
      const svg = doc.namespaceURI === 'http://www.w3.org/2000/svg'
      const style = svg ? document.createElementNS('http://www.w3.org/2000/svg', 'style') : document.createElement('style')
      style.textContent = css
      ;(document.head ?? doc).appendChild(style)
      await Promise.all([...document.fonts].map((f) => f.load().catch(() => {})))
      await document.fonts.ready
    }, fontCss)
    // Pages that aren't cover/hero may be bigger than the default viewport: grow to fit.
    if (!sizeOf(file)) {
      const box = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }))
      await page.setViewportSize(box)
    }
    await page.waitForTimeout(150)
    const target = join(out, file.replace(/\.\w+$/, '.png'))
    const png = await page.screenshot({ type: 'png' })
    writeFileSync(target, png)
    written.push(target)
    for (const e of errors) console.warn(`  ! ${file}: ${e}`)
    if (/^cover\./i.test(file)) {
      // The library shows covers at about 216×150: judge it at that size too.
      const small = await browser.newPage({ viewport: { width: 216, height: 150 } })
      await small.setContent(`<style>html,body{margin:0}</style><img src="data:image/png;base64,${png.toString('base64')}" style="width:216px;height:150px;display:block">`)
      await small.locator('img').evaluate((img) => img.decode())
      const thumb = join(out, 'cover-thumb.png')
      await small.screenshot({ path: thumb })
      await small.close()
      written.push(thumb)
    }
    await page.close()
  }
} finally {
  await browser.close()
  await server.close()
}
console.log(`Rendered ${written.length} image(s). Open them and look:`)
for (const f of written) console.log(`  ${relative(process.cwd(), f)}`)
