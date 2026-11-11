// Pixel UI (pixel-art skill): panels, buttons, bars, slots and frames drawn at native pixel resolution with
// the same ramps and light as the sprites (light from the top-left: a light bevel top/left, dark bottom/right,
// a 1-px dark outline, cut corners). Draw onto the game's low-res canvas, or bake once and blit at a
// whole-number scale. Text goes on top with a pixel font at a whole multiple of its design size.
import { ramp } from './pixelforge.js'

const px = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h) }

/** Material presets for UI chrome. Each is a ramp (darkest first) plus an outline colour. */
export const CHROME = {
  stone: () => ({ r: ramp('#7d8597', 5, { hueShift: 24 }), line: '#16101e' }),
  wood: () => ({ r: ramp('#9a6338', 5, { hueShift: 18 }), line: '#1c120c' }),
  gold: () => ({ r: ramp('#d9a536', 5, { hueShift: 20 }), line: '#2a1a0c' }),
  parchment: () => ({ r: ramp('#e6cf9c', 5, { hueShift: 12, spread: 0.36 }), line: '#3a2616' }),
  night: () => ({ r: ramp('#3b3f6e', 5, { hueShift: 22 }), line: '#0c0a18' })
}

/**
 * A bevelled panel: 1-px outline with cut corners, 1-px light bevel top/left, 1-px dark bevel bottom/right,
 * flat fill with a faint 1-px inner shadow under the top bevel. inset: true makes a sunken well (slots, inputs).
 */
export function panel(g, x, y, w, h, chrome = CHROME.stone(), { inset = false, fill = 2 } = {}) {
  const { r, line } = chrome
  const hi = inset ? r[0] : r[4], lo = inset ? r[4] : r[0]
  px(g, x + 1, y, w - 2, 1, line); px(g, x + 1, y + h - 1, w - 2, 1, line)
  px(g, x, y + 1, 1, h - 2, line); px(g, x + w - 1, y + 1, 1, h - 2, line)
  px(g, x + 1, y + 1, w - 2, h - 2, r[fill])
  px(g, x + 1, y + 1, w - 2, 1, hi); px(g, x + 1, y + 1, 1, h - 2, hi)
  px(g, x + 1, y + h - 2, w - 2, 1, lo); px(g, x + w - 2, y + 1, 1, h - 2, lo)
  if (!inset) px(g, x + 2, y + 2, w - 4, 1, r[fill - 1 >= 0 ? fill + 1 : fill]) // soft second highlight line
  // re-cut the inner corners so the bevel corners read as rounded
  px(g, x + 1, y + 1, 1, 1, line); px(g, x + w - 2, y + 1, 1, 1, line); px(g, x + 1, y + h - 2, 1, 1, line); px(g, x + w - 2, y + h - 2, 1, 1, line)
}

/**
 * A button in three states: 'idle', 'focus' (selected by stick / keys / hover: brighter and a marker),
 * 'pressed' (sunk by 1 px, bevels swapped). Returns the label's centre so you can draw text there.
 */
export function button(g, x, y, w, h, state = 'idle', chrome = CHROME.wood(), focusChrome = CHROME.gold()) {
  const c = state === 'focus' ? focusChrome : chrome
  const dy = state === 'pressed' ? 1 : 0
  if (state !== 'pressed') px(g, x + 1, y + h, w - 2, 1, 'rgba(12,8,20,0.55)') // drop shadow
  panel(g, x, y + dy, w, h, c, { inset: state === 'pressed', fill: 2 })
  if (state === 'focus') {
    // a small arrow marker on the left, in the outline colour
    for (let i = 0; i < 4; i++) px(g, x - 6 + i, y + Math.floor(h / 2) - 3 + i, 1, 7 - i * 2, c.line)
  }
  return [x + w / 2, y + h / 2 + dy]
}

/**
 * A resource bar (health, mana, stamina): framed well, fill in a ramp with a 1-px highlight line on top and a
 * dark line at the bottom, a lighter "recently lost" segment (pass lag ≥ value), and optional tick marks.
 */
export function bar(g, x, y, w, h, value, { color = '#d9453b', lag = value, ticks = 0, chrome = CHROME.night() } = {}) {
  panel(g, x, y, w, h, chrome, { inset: true, fill: 1 })
  const r = ramp(color, 5)
  const iw = w - 4, ih = h - 4, fx = x + 2, fy = y + 2
  const fv = Math.round(iw * Math.max(0, Math.min(1, value))), fl = Math.round(iw * Math.max(0, Math.min(1, lag)))
  if (fl > fv) px(g, fx + fv, fy, fl - fv, ih, r[4])
  if (fv > 0) {
    px(g, fx, fy, fv, ih, r[2])
    px(g, fx, fy, fv, 1, r[4])
    if (ih > 3) px(g, fx, fy + 1, fv, 1, r[3])
    px(g, fx, fy + ih - 1, fv, 1, r[1])
  }
  for (let i = 1; i < ticks; i++) px(g, fx + Math.round((iw * i) / ticks), fy, 1, ih, 'rgba(12,8,20,0.45)')
}

/** An inventory / ability slot: sunken well, optional item canvas centred inside, a gold frame when selected. */
export function slot(g, x, y, s, { item = null, selected = false, count = null, chrome = CHROME.stone() } = {}) {
  panel(g, x, y, s, s, chrome, { inset: true, fill: 1 })
  if (item) g.drawImage(item, Math.round(x + (s - item.width) / 2), Math.round(y + (s - item.height) / 2))
  if (selected) {
    const gold = CHROME.gold()
    // corner brackets rather than a full box: reads as "selected" without hiding the item
    for (const [cx, cy, sx, sy] of [[x - 1, y - 1, 1, 1], [x + s, y - 1, -1, 1], [x - 1, y + s, 1, -1], [x + s, y + s, -1, -1]]) {
      px(g, Math.min(cx, cx + sx * 4), cy, 5, 1, gold.r[4]); px(g, cx, Math.min(cy, cy + sy * 4), 1, 5, gold.r[4])
    }
  }
  return count
}

/** Pixel speech / dialogue box: a parchment panel with a tail pointing at (tx, ty) below it. */
export function speech(g, x, y, w, h, tx, chrome = CHROME.parchment()) {
  panel(g, x, y, w, h, chrome, { fill: 3 })
  const bx = Math.max(x + 4, Math.min(x + w - 8, tx))
  for (let i = 0; i < 4; i++) {
    px(g, bx + i, y + h - 1 + i, 4 - i, 1, chrome.r[3])
    px(g, bx + i - 1, y + h - 1 + i, 1, 1, chrome.line)
    px(g, bx + 4, y + h - 1 + i, 1, 1, chrome.line)
  }
}

/**
 * Draw text crisply with a pixel font: size must be a whole multiple of the font's design size (Pixelify Sans
 * reads well at 8, 16, 24…; Press Start 2P at 8, 16, 24). shadow draws a 1-px dark copy offset down-right.
 */
export function text(g, str, x, y, { font = 'Pixelify Sans', size = 8, color = '#f4ead2', shadow = '#16101e', align = 'left', weight = 400 } = {}) {
  g.font = `${weight} ${size}px "${font}"`
  g.textAlign = align
  g.textBaseline = 'top'
  if (shadow) { g.fillStyle = shadow; g.fillText(str, Math.round(x) + 1, Math.round(y) + 1) }
  g.fillStyle = color
  g.fillText(str, Math.round(x), Math.round(y))
}
