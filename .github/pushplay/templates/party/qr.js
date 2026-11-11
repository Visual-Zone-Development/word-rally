// pushplay runtime v10 — replaced by npm run update-kit; don't edit
// QR codes for the party join link, drawn on the TV. Byte mode, error correction level M,
// versions 1–10 (up to 213 characters: a join URL is about 35). After Project Nayuki's
// QR Code generator (MIT).
//
//   const qr = makeQr('https://play.example/j/ABCD')   // { size, dark(x, y) }
//   drawQr(ctx, qr, x, y, px)                           // px = module size; includes the quiet zone

// Level M, by version (index 0 unused).
const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26]
const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5]
const FORMAT_M = 0

/** @param {string} text @param {number} [mask] 0–7, or pick the best */
export function makeQr(text, mask) {
  const bytes = [...new TextEncoder().encode(text)]
  let ver = 1
  for (; ver <= 10; ver++) if (4 + (ver < 10 ? 8 : 16) + bytes.length * 8 <= dataCodewords(ver) * 8) break
  if (ver > 10) throw new Error('Text too long for a QR code')

  // Data bits: mode, length, bytes, terminator, then pad bytes.
  const bits = []
  const put = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1)
  }
  put(4, 4)
  put(bytes.length, ver < 10 ? 8 : 16)
  for (const b of bytes) put(b, 8)
  const capacity = dataCodewords(ver) * 8
  put(0, Math.min(4, capacity - bits.length))
  put(0, (8 - (bits.length % 8)) % 8)
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8)
  const data = []
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0))

  const size = ver * 4 + 17
  const grid = Array.from({ length: size }, () => Array(size).fill(false))
  const fixed = Array.from({ length: size }, () => Array(size).fill(false))
  const set = (x, y, dark) => {
    grid[y][x] = dark
    fixed[y][x] = true
  }

  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0)
    set(i, 6, i % 2 === 0)
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]])
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy))
        const x = cx + dx
        const y = cy + dy
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4)
      }
  const align = alignment(ver, size)
  const last = align.length - 1
  for (let i = 0; i < align.length; i++)
    for (let j = 0; j < align.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
    }
  drawFormat(set, size, 0) // reserve the area; the real bits go in once the mask is known
  if (ver >= 7) {
    let rem = ver
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const v = (ver << 12) | rem
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      set(a, b, ((v >>> i) & 1) === 1)
      set(b, a, ((v >>> i) & 1) === 1)
    }
  }

  // Codewords, zig-zagging up and down two columns at a time.
  const all = interleave(data, ver)
  let i = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert++)
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert
        if (!fixed[y][x] && i < all.length * 8) {
          grid[y][x] = ((all[i >>> 3] >>> (7 - (i & 7))) & 1) === 1
          i++
        }
      }
  }

  const masked = (m) => {
    const g = grid.map((row) => row.slice())
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fixed[y][x] && MASKS[m](x, y)) g[y][x] = !g[y][x]
    drawFormat((x, y, dark) => (g[y][x] = dark), size, m)
    return g
  }
  let best
  if (mask !== undefined) best = masked(mask)
  else {
    let lowest = Infinity
    for (let m = 0; m < 8; m++) {
      const g = masked(m)
      const p = penalty(g)
      if (p < lowest) [lowest, best] = [p, g]
    }
  }
  return { size, version: ver, dark: (x, y) => best[y][x] }
}

/** Draws the code with a 4-module quiet zone, dark on light, at whole-pixel module size. */
export function drawQr(ctx, qr, x, y, px, { dark = '#000', light = '#fff' } = {}) {
  const full = (qr.size + 8) * px
  ctx.fillStyle = light
  ctx.fillRect(x, y, full, full)
  ctx.fillStyle = dark
  for (let r = 0; r < qr.size; r++) for (let c = 0; c < qr.size; c++) if (qr.dark(c, r)) ctx.fillRect(x + (c + 4) * px, y + (r + 4) * px, px, px)
  return full
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
]

function rawModules(ver) {
  let n = (16 * ver + 128) * ver + 64
  if (ver >= 2) {
    const align = Math.floor(ver / 7) + 2
    n -= (25 * align - 10) * align - 55
    if (ver >= 7) n -= 36
  }
  return n
}

function dataCodewords(ver) {
  return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * BLOCKS[ver]
}

function alignment(ver, size) {
  if (ver === 1) return []
  const n = Math.floor(ver / 7) + 2
  const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2
  const out = [6]
  for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos)
  return out
}

function drawFormat(set, size, mask) {
  const data = (FORMAT_M << 3) | mask
  let rem = data
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
  const bits = ((data << 10) | rem) ^ 0x5412
  const bit = (i) => ((bits >>> i) & 1) === 1
  for (let i = 0; i <= 5; i++) set(8, i, bit(i))
  set(8, 7, bit(6))
  set(8, 8, bit(7))
  set(7, 8, bit(8))
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i))
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i))
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i))
  set(8, size - 8, true)
}

function interleave(data, ver) {
  const blocks = BLOCKS[ver]
  const eccLen = ECC_PER_BLOCK[ver]
  const raw = Math.floor(rawModules(ver) / 8)
  const short = blocks - (raw % blocks)
  const shortLen = Math.floor(raw / blocks)
  const divisor = rsDivisor(eccLen)
  const out = []
  const all = []
  for (let i = 0, k = 0; i < blocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < short ? 0 : 1))
    k += dat.length
    const ecc = rsRemainder(dat, divisor)
    if (i < short) dat.push(0)
    all.push(dat.concat(ecc))
  }
  for (let i = 0; i < all[0].length; i++) for (let j = 0; j < all.length; j++) if (i !== shortLen - eccLen || j >= short) out.push(all[j][i])
  return out
}

function gfMul(x, y) {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z
}

function rsDivisor(degree) {
  const out = Array(degree - 1).fill(0)
  out.push(1)
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      out[j] = gfMul(out[j], root)
      if (j + 1 < degree) out[j] ^= out[j + 1]
    }
    root = gfMul(root, 2)
  }
  return out
}

function rsRemainder(data, divisor) {
  const out = divisor.map(() => 0)
  for (const b of data) {
    const factor = b ^ out.shift()
    out.push(0)
    divisor.forEach((d, i) => (out[i] ^= gfMul(d, factor)))
  }
  return out
}

/** The standard's penalty score, so the clearest mask wins. */
function penalty(g) {
  const n = g.length
  let score = 0
  const lines = []
  for (let i = 0; i < n; i++) {
    lines.push(g[i])
    lines.push(g.map((row) => row[i]))
  }
  for (const line of lines) {
    let run = 1
    for (let i = 1; i <= n; i++) {
      if (i < n && line[i] === line[i - 1]) run++
      else {
        if (run >= 5) score += run - 2
        run = 1
      }
    }
    // Finder-like 1:1:3:1:1 with four light modules on one side.
    const s = line.map((d) => (d ? 1 : 0)).join('')
    for (const pat of ['10111010000', '00001011101']) for (let i = s.indexOf(pat); i !== -1; i = s.indexOf(pat, i + 1)) score += 40
  }
  let dark = 0
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (g[y][x]) dark++
      if (x < n - 1 && y < n - 1 && g[y][x] === g[y][x + 1] && g[y][x] === g[y + 1][x] && g[y][x] === g[y + 1][x + 1]) score += 3
    }
  score += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10
  return score
}
