// Word Rally: the look. Colours, fonts and the few shapes every screen is built from
// (letter tiles, panels, buttons, text that never drops below the phone minimum).

export const C = {
  bg: '#171A33',
  panel: '#222650',
  panelHi: '#2D3268',
  line: '#3A4080',
  tile: '#FFF6E0',
  tileEdge: '#C9B98F',
  ink: '#171A33',
  text: '#F4F1FF',
  muted: '#B9BDE6',
  sun: '#FFC53D',
  sunEdge: '#B98300',
  // Lockword feedback: blue and orange differ in lightness as well as hue (colourblind-safe).
  right: '#2F6FE4',
  wrong: '#F59E0B',
  absent: '#3A3F6B',
  empty: '#1D2145',
  bad: '#FF6B6B'
}
export const GAME_LOOK = {
  tangle: { color: '#2ED3B7', edge: '#138A76', pitch: 'Trace words through the grid', rule: ['Trace through touching letters.', 'Longer words score far more.'] },
  lockword: { color: '#FFC53D', edge: '#B98300', pitch: 'Crack hidden words, fast', rule: ['Crack as many hidden words as you can.', 'A word you miss or skip costs 10 points.'] },
  petal: { color: '#FF8A6B', edge: '#B4492E', pitch: 'Seven letters, one is a must', rule: ['Every word needs the middle letter.', 'Use all seven for a big bonus.'] },
  rally: { color: '#B79CFF', edge: '#6F55B8', pitch: 'All three, back to back', rule: [] }
}
export const PLAYER_COLORS = ['#2ED3B7', '#FF8A6B', '#FFC53D', '#B79CFF', '#6CC8FF', '#FF9BCB', '#9BE564', '#F4F1FF']
export const NAMES = ['Ace', 'Bee', 'Cat', 'Dot', 'Elk', 'Fox', 'Gem', 'Hex', 'Ivy', 'Jay', 'Kit', 'Leo', 'Max', 'Neo', 'Owl', 'Pip', 'Quill', 'Rex', 'Sky', 'Taz', 'Uno', 'Vee', 'Wiz', 'Yak', 'Zed', 'Bolt', 'Comet', 'Dash', 'Echo', 'Fizz', 'Gizmo', 'Mango']

export const FONT = 'Rubik, system-ui, sans-serif'
export const DISPLAY = "'Lilita One', Rubik, system-ui, sans-serif"
/** No text is ever drawn smaller than this (game units; a phone screen is 720 across). */
export const MIN_TEXT = 32

export function makeUi(ctx, textScale) {
  const px = (size, scale = true) => Math.max(MIN_TEXT, Math.round(size * (scale ? 1 + (textScale() - 1) * 0.4 : 1)))

  const ui = {
    px,
    font(size, weight = 700, family = FONT, scale = true) {
      ctx.font = `${weight} ${px(size, scale)}px ${family}`
    },
    /** Text that fits `max` wide: shrinks toward the minimum size first, then ends in an ellipsis. */
    text(str, x, y, size, color, { weight = 700, align = 'left', family = FONT, max = 0, base = 'middle', scale = true } = {}) {
      let s = String(str)
      let p = px(size, scale)
      ctx.textAlign = align
      ctx.textBaseline = base
      ctx.fillStyle = color
      ctx.font = `${weight} ${p}px ${family}`
      if (max > 0) {
        let w = ctx.measureText(s).width
        if (w > max && p > MIN_TEXT) {
          p = Math.max(MIN_TEXT, Math.floor((p * max) / w))
          ctx.font = `${weight} ${p}px ${family}`
          w = ctx.measureText(s).width
        }
        while (w > max && s.length > 2) {
          s = s.slice(0, -2).trimEnd() + '…'
          w = ctx.measureText(s).width
        }
      }
      ctx.fillText(s, x, y)
      return ctx.measureText(s).width
    },
    /** Text wrapped onto up to `lines` lines of `max` width; returns how many it used. */
    wrap(str, x, y, size, color, { weight = 400, max = 400, lines = 2, lineHeight = 1.25, align = 'left' } = {}) {
      const p = px(size)
      ctx.font = `${weight} ${p}px ${FONT}`
      const rows = []
      let row = ''
      for (const word of String(str).split(' ')) {
        const next = row ? `${row} ${word}` : word
        if (row && ctx.measureText(next).width > max) {
          rows.push(row)
          row = word
        } else row = next
      }
      if (row) rows.push(row)
      if (rows.length > lines) rows[lines - 1] = rows.slice(lines - 1).join(' ')
      rows.slice(0, lines).forEach((r, i) => ui.text(r, x, y + i * p * lineHeight, size, color, { weight, max, align }))
      return Math.min(rows.length, lines)
    },
    width(str, size, weight = 700, family = FONT) {
      ctx.font = `${weight} ${px(size)}px ${family}`
      return ctx.measureText(String(str)).width
    },
    rect(x, y, w, h, r, fill, stroke, lineWidth = 3) {
      ctx.beginPath()
      ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2))
      if (fill) {
        ctx.fillStyle = fill
        ctx.fill()
      }
      if (stroke) {
        ctx.strokeStyle = stroke
        ctx.lineWidth = lineWidth
        ctx.stroke()
      }
    },
    /** A chunky letter tile with a hard drop edge. `press` (0..1) pushes it down onto its edge. */
    tile(x, y, w, h, letter, { bg = C.tile, edge = C.tileEdge, fg = C.ink, ring = null, round = 0.16, size = 0.56, press = 0, circle = false } = {}) {
      const drop = Math.round(Math.min(w, h) * 0.07)
      const dy = drop * press
      const r = circle ? w / 2 : Math.min(w, h) * round
      ui.rect(x, y + drop, w, h, r, edge)
      ui.rect(x, y + dy, w, h, r, bg)
      if (ring) ui.rect(x - 5, y + dy - 5, w + 10, h + drop - dy + 10, r + 5, null, ring, 5)
      if (letter) {
        ctx.fillStyle = fg
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.font = `900 ${Math.max(MIN_TEXT, Math.round(Math.min(w, h) * size))}px ${FONT}`
        ctx.fillText(letter.toUpperCase(), x + w / 2, y + dy + h / 2 + Math.min(w, h) * 0.03)
      }
    },
    /** A button with a label; `kind` is 'primary' (yellow), 'plain' or 'ghost'. */
    button(r, label, { kind = 'plain', focus = false, disabled = false, size = 34 } = {}) {
      ctx.globalAlpha = disabled ? 0.45 : 1
      if (kind === 'primary') {
        ui.rect(r.x, r.y + 6, r.w, r.h - 6, 18, C.sunEdge)
        ui.rect(r.x, r.y, r.w, r.h - 6, 18, C.sun)
        ui.text(label, r.x + r.w / 2, r.y + (r.h - 6) / 2 + 2, size, C.ink, { align: 'center', max: r.w - 24 })
      } else {
        ui.rect(r.x, r.y, r.w, r.h, 18, C.panelHi, C.line)
        ui.text(label, r.x + r.w / 2, r.y + r.h / 2 + 2, size, C.text, { align: 'center', weight: 500, max: r.w - 24 })
      }
      if (focus) ui.rect(r.x - 5, r.y - 5, r.w + 10, r.h + 10, 22, null, C.tile, 4)
      ctx.globalAlpha = 1
    },
    /** A small round badge (a player's colour dot or rank). */
    dot(x, y, radius, color, label = '') {
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
      if (label) ui.text(label, x, y + 2, radius * 1.1, C.ink, { align: 'center', weight: 900, scale: false })
    },
    pauseIcon(r) {
      ui.rect(r.x, r.y, r.w, r.h, 16, C.panel, C.line)
      ctx.fillStyle = C.text
      const bw = Math.round(r.w * 0.12)
      const bh = Math.round(r.h * 0.4)
      ctx.fillRect(r.x + r.w / 2 - bw * 1.6, r.y + (r.h - bh) / 2, bw, bh)
      ctx.fillRect(r.x + r.w / 2 + bw * 0.6, r.y + (r.h - bh) / 2, bw, bh)
    }
  }
  return ui
}

export const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
export const clock = (seconds) => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`
