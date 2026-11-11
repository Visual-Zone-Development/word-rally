// Post-processing for generated art, done in headless Chromium's canvas (the kit already ships it),
// so there are no image libraries to install: chroma-key a flat #ff00ff background to alpha, trim
// to the drawn area with a margin, scale the longest side to `out` px, and make a contact sheet.
import { launchBrowser } from '../../.github/pushplay/pipeline.mjs'

const b64 = (buf) => buf.toString('base64')

/** items: [{ png: Buffer, key: boolean, out?: number }] → Buffers, same order. */
export async function processImages(items) {
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    const results = []
    for (const item of items) {
      const data = await page.evaluate(
        async ({ src, key, out }) => {
          const img = new Image()
          img.src = src
          await img.decode()
          let c = document.createElement('canvas')
          c.width = img.width
          c.height = img.height
          let g = c.getContext('2d', { willReadFrequently: true })
          g.drawImage(img, 0, 0)
          if (key) {
            const d = g.getImageData(0, 0, c.width, c.height)
            const p = d.data
            for (let i = 0; i < p.length; i += 4) {
              const r = p[i], gr = p[i + 1], b = p[i + 2]
              // distance from pure magenta; soft edge between 60 and 150
              const dist = Math.hypot(255 - r, gr, 255 - b)
              const a = Math.max(0, Math.min(1, (dist - 60) / 90))
              p[i + 3] = Math.round(p[i + 3] * a)
              // despill: pull magenta fringes toward neutral
              if (a < 1 && r > gr && b > gr) {
                const m = Math.min(r, b) - gr
                p[i] -= m * (1 - a)
                p[i + 2] -= m * (1 - a)
              }
            }
            g.putImageData(d, 0, 0)
          }
          // trim to the opaque area, keeping a 4% margin
          const d = g.getImageData(0, 0, c.width, c.height).data
          let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1
          for (let y = 0; y < c.height; y++)
            for (let x = 0; x < c.width; x++)
              if (d[(y * c.width + x) * 4 + 3] > 8) {
                if (x < x0) x0 = x
                if (x > x1) x1 = x
                if (y < y0) y0 = y
                if (y > y1) y1 = y
              }
          if (x1 >= x0 && (key || x0 > 0 || y0 > 0 || x1 < c.width - 1 || y1 < c.height - 1)) {
            const m = Math.round(Math.max(x1 - x0, y1 - y0) * 0.04)
            x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m)
            x1 = Math.min(c.width - 1, x1 + m); y1 = Math.min(c.height - 1, y1 + m)
            const t = document.createElement('canvas')
            t.width = x1 - x0 + 1
            t.height = y1 - y0 + 1
            t.getContext('2d').drawImage(c, x0, y0, t.width, t.height, 0, 0, t.width, t.height)
            c = t
          }
          if (out && Math.max(c.width, c.height) > out) {
            const k = out / Math.max(c.width, c.height)
            const t = document.createElement('canvas')
            t.width = Math.round(c.width * k)
            t.height = Math.round(c.height * k)
            const tg = t.getContext('2d')
            tg.imageSmoothingQuality = 'high'
            tg.drawImage(c, 0, 0, t.width, t.height)
            c = t
          }
          return c.toDataURL('image/png').split(',')[1]
        },
        { src: `data:image/png;base64,${b64(item.png)}`, key: !!item.key, out: item.out ?? 0 }
      )
      results.push(Buffer.from(data, 'base64'))
    }
    return results
  } finally {
    await browser.close()
  }
}

/** A labelled grid of images on a checkerboard (so transparency shows), as a PNG Buffer. */
export async function contactSheet(entries) {
  const browser = await launchBrowser()
  try {
    const cell = 240
    const cols = Math.min(4, entries.length)
    const rows = Math.ceil(entries.length / cols)
    const page = await browser.newPage({ viewport: { width: cols * cell, height: rows * (cell + 28) } })
    const html = entries
      .map((e) => `<figure><img src="data:image/png;base64,${b64(e.png)}"><figcaption>${e.name}</figcaption></figure>`)
      .join('')
    await page.setContent(`<style>
      body{margin:0;display:grid;grid-template-columns:repeat(${cols},${cell}px);background:#20263f;font:600 14px system-ui;color:#dde}
      figure{margin:0;width:${cell}px;height:${cell + 28}px}
      img{width:${cell}px;height:${cell}px;object-fit:contain;background:repeating-conic-gradient(#3a4060 0 25%,#2c3150 0 50%) 0 0/24px 24px}
      figcaption{height:28px;line-height:28px;text-align:center}
    </style>${html}`)
    await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())))
    return await page.screenshot({ type: 'png', fullPage: true })
  } finally {
    await browser.close()
  }
}
