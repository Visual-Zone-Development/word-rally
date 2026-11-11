// pushplay runtime v10 — replaced by `npm run update-kit`; don't edit, extend from game.js.
//
// Button prompts drawn for whatever the player is using: controller buttons as coloured circles
// and pills, keyboard keys as keycaps, touch as tap chips. Never hard-code "Press A": the same
// call reads right on a Deck, a laptop and a phone.
//
//   drawPrompts(ctx, input, [['a', 'Jump'], ['menu', 'Pause']])                    // bottom centre
//   drawPrompts(ctx, input, [['b', 'Back']], { x: 1248, y: 760, align: 'right' })

import { input as defaultInput } from './input.js'

const PAD_COLORS = { a: '#3fbf5f', b: '#e3514f', x: '#3f8fe3', y: '#e8c13c' }
const ROUND = new Set(['a', 'b', 'x', 'y', 'ls', 'rs'])

/** Width of one chip in px for the current mode and font size. */
function chipWidth(ctx, input, button, size) {
  const text = input.label(button)
  if (input.mode === 'gamepad' && ROUND.has(button)) return size * 1.5
  return Math.max(size * 1.5, ctx.measureText(text).width + size * 0.9)
}

function drawChip(ctx, input, button, x, y, size, color) {
  const text = input.label(button)
  const h = size * 1.5
  const w = chipWidth(ctx, input, button, size)
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = Math.max(1.5, size * 0.08)
  if (input.mode === 'gamepad') {
    ctx.fillStyle = PAD_COLORS[button] ?? 'rgba(255,255,255,0.18)'
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.beginPath()
    if (ROUND.has(button)) ctx.arc(x + w / 2, y, h / 2, 0, Math.PI * 2)
    else ctx.roundRect(x, y - h / 2, w, h, h / 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = PAD_COLORS[button] ? '#10140f' : color
    ctx.font = `700 ${Math.round(size * 0.8)}px system-ui, sans-serif`
    ctx.fillText(text, x + w / 2, y + size * 0.04)
  } else if (input.mode === 'touch') {
    ctx.fillStyle = 'rgba(255,255,255,0.14)'
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'
    ctx.beginPath()
    ctx.roundRect(x, y - h / 2, w, h, h / 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = color
    ctx.font = `600 ${Math.round(size * 0.78)}px system-ui, sans-serif`
    ctx.fillText(text, x + w / 2, y + size * 0.04)
  } else {
    // Keycap: a rounded square with a lighter top edge.
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.beginPath()
    ctx.roundRect(x, y - h / 2, w, h, size * 0.25)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.fillRect(x + size * 0.3, y - h / 2 + 1, w - size * 0.6, 2)
    ctx.fillStyle = color
    ctx.font = `600 ${Math.round(size * 0.74)}px system-ui, sans-serif`
    ctx.fillText(text, x + w / 2, y + size * 0.04)
  }
  ctx.restore()
  return w
}

/**
 * Draw [button, action] pairs in a row. Options: x, y (centre line), align 'left' | 'center' |
 * 'right', size (chip height basis, px), gap between pairs, color, font for the action text.
 */
export function drawPrompts(ctx, input, pairs, { x = 640, y = 760, align = 'center', size = 26, gap = 34, color = '#eef0f5', font } = {}) {
  if (!pairs?.length) return
  if (Array.isArray(input)) {
    // drawPrompts(ctx, pairs) without an input object
    pairs = input
    input = defaultInput
  }
  ctx.save()
  const labelFont = font ?? `500 ${Math.round(size * 0.9)}px system-ui, sans-serif`
  ctx.font = labelFont
  const widths = pairs.map(([button, text]) => chipWidth(ctx, input, button, size) + size * 0.4 + ctx.measureText(text).width)
  const total = widths.reduce((a, b) => a + b, 0) + gap * (pairs.length - 1)
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x
  pairs.forEach(([button, text], i) => {
    const w = drawChip(ctx, input, button, cx, y, size, color)
    ctx.font = labelFont
    ctx.fillStyle = color
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, cx + w + size * 0.4, y + size * 0.04)
    cx += widths[i] + gap
  })
  ctx.restore()
}
