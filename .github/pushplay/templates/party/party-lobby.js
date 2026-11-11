// pushplay runtime v10 — replaced by npm run update-kit; don't edit
// The party lobby on the TV: the game's name, the room code and QR code to join, everyone who's
// in, and Start. Phones join by scanning or typing the code; controllers on this machine press A.
// Start: A on a joined controller, Space/Enter/click, or the first phone's Start button.
// Style it with the options, not by editing.
//
//   const lobby = createPartyLobby(party, input, { title: 'Fib Finder' })
//   lobby.open()                                 // from the title screen
//   in the lobby screen:  const result = lobby.update()   // 'start' | 'back' | null
//                         lobby.draw(ctx, W, H)
//   during play:          drawJoinBadge(ctx, party, x, y)  // so latecomers can still join
//
// Options: title, tagline (defaults to the player count), logo (a loaded image drawn in place of
// the title), accent, ink, quiet, panel (the backdrop; '' to draw over your own), font.
import { drawQr, makeQr } from './qr.js'
import { drawPrompts } from './prompts.js'

/** The launcher's name, filled in when the kit is exported. */
const BRAND = 'PushPlay'.startsWith('{{') ? '' : 'PushPlay'
const SURFACE = 'rgba(22,26,34,0.92)'
const RAISED = 'rgba(255,255,255,0.06)'
const LINE = 'rgba(255,255,255,0.09)'

export function createPartyLobby(party, input, { title = '', tagline = '', logo = null, accent = '#ffb547', ink = '#eef0f5', quiet = '#9aa3b5', panel = '#0d0f14', font = 'system-ui, sans-serif' } = {}) {
  let startRequested = false
  let qr = null
  /** When each player arrived, for a little pop as they land in their seat. */
  const arrived = new Map()
  // The build check runs the TV with nobody at the controls.
  const auto = typeof window !== 'undefined' && Boolean(window.__kitPartyTest)

  party.on('msg', ({ from, data }) => {
    if (data?.$start && from === vip()) startRequested = true
  })

  /** The first phone still connected: it gets the Start button. */
  const vip = () => party.players.find((p) => p.kind === 'phone' && p.connected)?.id ?? null
  const canStart = () => party.players.length >= party.minPlayers

  const lobby = {
    open() {
      startRequested = false
      party.open()
    },

    update() {
      const ready = canStart()
      party.public.lobby = { vip: vip(), canStart: ready, need: Math.max(0, party.minPlayers - party.players.length) }

      if (party.status === 'error') {
        if (input.pressed('a')) party.open()
        else if (input.pressed('b')) return back()
        return null
      }

      let start = startRequested || (auto && ready)
      let padUsed = false
      for (const pad of input.pads) {
        if (!pad.connected) continue
        const id = `local${pad.index}`
        if (pad.pressed('a')) {
          padUsed = true
          if (!party.player(id) && party.localPlayers) party.addLocal(pad.index)
          else start = true
        }
        if (pad.pressed('b') && party.player(id)) {
          padUsed = true
          party.kick(id)
        }
      }
      if (!padUsed && input.pressed('a')) start = true
      if (!padUsed && input.pressed('b')) return back()

      startRequested = false
      if (!start || !ready) return null
      delete party.public.lobby
      return 'start'
    },

    draw(ctx, W, H) {
      const t = now()
      ctx.save()
      ctx.textBaseline = 'alphabetic'
      ctx.textAlign = 'left'
      if (panel) backdrop(ctx, W, H, panel, accent)

      // Header: the game, and whose lobby this is.
      const M = 64
      let titleBottom = 136
      if (logo && (logo.naturalWidth || logo.width)) {
        const lw = logo.naturalWidth || logo.width
        const lh = logo.naturalHeight || logo.height
        const h = Math.min(84, (lh * 640) / lw)
        ctx.drawImage(logo, M, 132 - h, (lw * h) / lh, h)
      } else {
        ctx.fillStyle = ink
        ctx.font = `800 56px ${font}`
        ctx.fillText(fit(ctx, title, W - M * 2 - 260), M, 116)
        titleBottom = 150
      }
      ctx.fillStyle = quiet
      ctx.font = `600 22px ${font}`
      const players = party.minPlayers === party.maxPlayers ? `${party.maxPlayers} players` : `${party.minPlayers}–${party.maxPlayers} players`
      ctx.fillText(tagline || `Party game · ${players}`, M, titleBottom)
      if (BRAND) brandLockup(ctx, W - M, 86, { accent, ink: quiet, font })

      const top = 188
      const cardH = H - top - 104

      if (party.status === 'error' || !party.code) {
        card(ctx, M, top, W - M * 2, cardH)
        ctx.textAlign = 'center'
        if (party.status === 'error') {
          ctx.fillStyle = '#ff7a7a'
          ctx.font = `700 30px ${font}`
          ctx.fillText(fit(ctx, party.error, W - M * 4), W / 2, top + cardH / 2 - 10)
          drawPrompts(ctx, input, [['a', 'Try again'], ['b', 'Back']], { x: W / 2, y: top + cardH / 2 + 50, color: ink })
        } else {
          spinner(ctx, W / 2, top + cardH / 2 - 40, accent, t)
          ctx.fillStyle = ink
          ctx.font = `700 30px ${font}`
          ctx.fillText(party.status === 'reconnecting' ? 'Reconnecting…' : 'Opening the party…', W / 2, top + cardH / 2 + 30)
        }
        ctx.restore()
        return
      }

      // Left: how to join.
      const joinW = 600
      card(ctx, M, top, joinW, cardH)
      const ix = M + 32
      ctx.fillStyle = quiet
      ctx.font = `700 18px ${font}`
      spaced(ctx, 'ROOM CODE', ix, top + 46, 3)
      const tileW = (joinW - 64 - 3 * 16) / 4
      for (let i = 0; i < 4; i++) {
        const x = ix + i * (tileW + 16)
        const y = top + 64
        ctx.fillStyle = RAISED
        roundRect(ctx, x, y, tileW, 132, 18)
        ctx.fill()
        ctx.fillStyle = accent
        roundRect(ctx, x, y + 126, tileW, 6, 3)
        ctx.fill()
        ctx.fillStyle = accent
        ctx.textAlign = 'center'
        ctx.font = `900 92px ${font}`
        ctx.fillText(party.code[i] ?? '', x + tileW / 2, y + 100)
        ctx.textAlign = 'left'
      }

      const qy = top + 232
      ctx.fillStyle = LINE
      ctx.fillRect(ix, qy - 20, joinW - 64, 2)
      const qs = cardH - (qy - top) - 28
      if (party.joinUrl) {
        if (qr?.url !== party.joinUrl) qr = { url: party.joinUrl, code: makeQr(party.joinUrl) }
        const px = Math.max(1, Math.floor((qs - 20) / (qr.code.size + 8)))
        const full = (qr.code.size + 8) * px
        ctx.fillStyle = '#ffffff'
        roundRect(ctx, ix, qy, qs, qs, 16)
        ctx.fill()
        ctx.save()
        roundRect(ctx, ix, qy, qs, qs, 16)
        ctx.clip()
        drawQr(ctx, qr.code, ix + Math.floor((qs - full) / 2), qy + Math.floor((qs - full) / 2), px)
        ctx.restore()
      }
      const tx = ix + qs + 28
      const tw = M + joinW - 32 - tx
      const link = party.joinUrl.replace(/^https?:\/\//, '').replace(/\/j\/[A-Z]{4}$/, '')
      ctx.fillStyle = ink
      ctx.font = `800 28px ${font}`
      ctx.fillText('Scan to join', tx, qy + 40)
      ctx.fillStyle = quiet
      ctx.font = `500 21px ${font}`
      ctx.fillText('or go to', tx, qy + 84)
      ctx.fillStyle = ink
      // A short address on one line; a long one (a host's generated domain) breaks at a dot.
      const lines = fitFont(ctx, link, tw, 30, 22, `800 {px}px ${font}`) ? [link] : splitAtDot(link)
      if (lines.length > 1) fitFont(ctx, lines.reduce((a, b) => (a.length > b.length ? a : b)), tw, 26, 14, `800 {px}px ${font}`)
      lines.forEach((line, i) => ctx.fillText(line, tx, qy + 122 + i * 32))
      ctx.fillStyle = quiet
      ctx.font = `500 21px ${font}`
      ctx.fillText('and enter the code', tx, qy + 160 + (lines.length - 1) * 32)

      // Right: who's in.
      const rx = M + joinW + 24
      const rw = W - M - rx
      card(ctx, rx, top, rw, cardH)
      ctx.fillStyle = quiet
      ctx.font = `700 18px ${font}`
      spaced(ctx, 'PLAYERS', rx + 32, top + 46, 3)
      ctx.textAlign = 'right'
      ctx.fillStyle = party.players.length ? ink : quiet
      ctx.font = `800 22px ${font}`
      ctx.fillText(`${party.players.length} / ${party.maxPlayers}`, rx + rw - 32, top + 46)
      ctx.textAlign = 'left'

      const cols = party.maxPlayers <= 5 ? 1 : party.maxPlayers <= 10 ? 2 : 3
      const rows = Math.ceil(party.maxPlayers / cols)
      const gap = 12
      const gx = rx + 24
      const gy = top + 72
      const sw = (rw - 48 - gap * (cols - 1)) / cols
      const sh = Math.min(76, (cardH - 96 - gap * (rows - 1)) / rows)
      const big = sh >= 64
      const seen = new Set()
      const padsCanJoin = party.localPlayers && input.pads.some((p) => p.connected && !party.player(`local${p.index}`))
      for (let i = 0; i < party.maxPlayers; i++) {
        const x = gx + (i % cols) * (sw + gap)
        const y = gy + Math.floor(i / cols) * (sh + gap)
        const p = party.players[i]
        if (!p) {
          ctx.strokeStyle = LINE
          ctx.lineWidth = 2
          ctx.setLineDash([8, 8])
          roundRect(ctx, x + 1, y + 1, sw - 2, sh - 2, 14)
          ctx.stroke()
          ctx.setLineDash([])
          if (i === party.players.length) {
            const dots = '.'.repeat(1 + (Math.floor(t / 450) % 3))
            ctx.fillStyle = quiet
            ctx.font = `600 ${big ? 22 : 18}px ${font}`
            const room = sw - 40 - (padsCanJoin && sw >= 380 ? 90 : 0)
            const label = ctx.measureText('Waiting for players...').width <= room ? 'Waiting for players' : 'Waiting'
            ctx.fillText(`${label}${dots}`, x + 22, y + sh / 2 + 8)
            // Controllers on this machine join with A; say so where the next player will appear.
            if (padsCanJoin && sw >= 380) drawPrompts(ctx, input, [['a', 'Join']], { x: x + sw - 20, y: y + sh / 2, align: 'right', size: 18, color: ink, font: `600 18px ${font}` })
          }
          continue
        }
        seen.add(p.id)
        if (!arrived.has(p.id)) arrived.set(p.id, t)
        const pop = Math.max(0, 1 - (t - arrived.get(p.id)) / 300)
        ctx.save()
        ctx.globalAlpha = p.connected ? 1 : 0.45
        ctx.translate(x + sw / 2, y + sh / 2)
        ctx.scale(1 + pop * 0.04, 1 + pop * 0.04)
        ctx.translate(-(x + sw / 2), -(y + sh / 2))
        ctx.fillStyle = RAISED
        roundRect(ctx, x, y, sw, sh, 14)
        ctx.fill()
        ctx.fillStyle = p.color
        roundRect(ctx, x, y, 6, sh, 3)
        ctx.fill()
        const r = big ? 20 : 15
        ctx.beginPath()
        ctx.arc(x + 22 + r, y + sh / 2, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#0d0f14'
        ctx.textAlign = 'center'
        ctx.font = `800 ${big ? 20 : 16}px ${font}`
        ctx.fillText(String(i + 1), x + 22 + r, y + sh / 2 + (big ? 7 : 6))
        ctx.textAlign = 'left'
        const chip = sw >= 220 ? (p.kind === 'local' ? 'controller' : p.connected ? 'phone' : 'away') : ''
        ctx.font = `600 16px ${font}`
        const chipW = chip ? ctx.measureText(chip).width + 22 : 0
        ctx.fillStyle = ink
        ctx.font = `700 ${big ? 26 : 21}px ${font}`
        const nx = x + 22 + r * 2 + 16
        ctx.fillText(fit(ctx, p.name, x + sw - nx - chipW - 20), nx, y + sh / 2 + (big ? 9 : 7))
        if (chip) {
          ctx.fillStyle = LINE
          roundRect(ctx, x + sw - 16 - chipW, y + sh / 2 - 14, chipW, 28, 14)
          ctx.fill()
          ctx.fillStyle = quiet
          ctx.font = `600 16px ${font}`
          ctx.fillText(chip, x + sw - 16 - chipW + 11, y + sh / 2 + 6)
        }
        ctx.restore()
      }
      for (const id of arrived.keys()) if (!seen.has(id)) arrived.delete(id)

      // Bottom: where things stand, and what to press.
      const by = H - 52
      const need = party.minPlayers - party.players.length
      ctx.font = `700 24px ${font}`
      ctx.fillStyle = need > 0 ? quiet : accent
      ctx.fillText(need > 0 ? `Need ${need} more player${need === 1 ? '' : 's'} to start` : 'Ready when you are', M, by + 8)
      const prompts = need > 0 ? [['b', 'Back']] : [['a', 'Start'], ['b', 'Back']]
      drawPrompts(ctx, input, prompts, { x: W - M, y: by, align: 'right', size: 22, color: ink })
      ctx.restore()
    }
  }

  function back() {
    party.close()
    return 'back'
  }

  return lobby
}

/** The room code in a corner during play, so latecomers can still join. */
export function drawJoinBadge(ctx, party, x, y, { ink = '#eef0f5', quiet = '#9aa3b5', accent = '#ffb547', font = 'system-ui, sans-serif' } = {}) {
  if (!party.code || party.locked) return
  ctx.save()
  ctx.fillStyle = 'rgba(13,15,20,0.78)'
  roundRect(ctx, x, y, 210, 58, 12)
  ctx.fill()
  ctx.strokeStyle = LINE
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = quiet
  ctx.font = `600 15px ${font}`
  ctx.textAlign = 'left'
  ctx.fillText('Join with code', x + 14, y + 22)
  ctx.fillStyle = accent
  ctx.font = `900 24px ${font}`
  spaced(ctx, party.code, x + 14, y + 48, 4)
  ctx.restore()
}

/** The launcher's mark (a play button with a signal in its corner) and name, right-aligned at x. */
function brandLockup(ctx, x, y, { accent, ink, font }) {
  ctx.save()
  ctx.font = `600 16px ${font}`
  const label = 'Party by'
  ctx.fillStyle = ink
  ctx.textAlign = 'right'
  ctx.font = `800 22px ${font}`
  const nameW = ctx.measureText(BRAND).width
  ctx.fillText(BRAND, x, y + 8)
  ctx.font = `600 16px ${font}`
  ctx.globalAlpha = 0.8
  ctx.fillText(label, x - nameW - 46, y + 6)
  ctx.globalAlpha = 1
  drawMark(ctx, x - nameW - 38, y - 15, 30, accent)
  ctx.restore()
}

/** The brand mark at (x, y), size s. Same drawing as the join page's favicon. */
function drawMark(ctx, x, y, s, accent) {
  const ground = '#0d0f14'
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s / 100, s / 100)
  // Outer ring with a notch cut out top-right, where the signal sits.
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, 100, 100)
  ctx.arc(81.5, 18.5, 16, 0, Math.PI * 2, true)
  ctx.clip('evenodd')
  ctx.beginPath()
  ctx.arc(50, 50, 48, 0, Math.PI * 2)
  ctx.arc(50, 50, 40, 0, Math.PI * 2, true)
  ctx.fillStyle = accent
  ctx.fill('evenodd')
  ctx.restore()
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.arc(50, 50, 28, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = ground
  ctx.strokeStyle = ground
  ctx.lineWidth = 5
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(43, 38)
  ctx.lineTo(62, 50)
  ctx.lineTo(43, 62)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  // The signal: a dot and two arcs.
  ctx.translate(81.5, 18.5)
  ctx.scale(0.74, 0.74)
  ctx.translate(-73, -30)
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.arc(65, 38, 3.8, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = accent
  ctx.lineWidth = 5.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(65, 38, 10, -Math.PI / 2, 0)
  ctx.moveTo(65, 19)
  ctx.arc(65, 38, 19, -Math.PI / 2, 0)
  ctx.stroke()
  ctx.restore()
}

function backdrop(ctx, W, H, panel, accent) {
  ctx.fillStyle = panel
  ctx.fillRect(0, 0, W, H)
  // A soft glow of the accent from the top left, so the screen isn't a flat slab.
  const glow = ctx.createRadialGradient(W * 0.18, -H * 0.1, 0, W * 0.18, -H * 0.1, W * 0.75)
  glow.addColorStop(0, withAlpha(accent, 0.16))
  glow.addColorStop(1, withAlpha(accent, 0))
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)
}

function card(ctx, x, y, w, h) {
  ctx.fillStyle = SURFACE
  roundRect(ctx, x, y, w, h, 24)
  ctx.fill()
  ctx.strokeStyle = LINE
  ctx.lineWidth = 1.5
  ctx.stroke()
}

function spinner(ctx, x, y, color, t) {
  ctx.save()
  ctx.lineWidth = 5
  ctx.strokeStyle = LINE
  ctx.beginPath()
  ctx.arc(x, y, 22, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  const a = (t / 1000) * Math.PI * 2
  ctx.beginPath()
  ctx.arc(x, y, 22, a, a + Math.PI / 2)
  ctx.stroke()
  ctx.restore()
}

/** Text with letter spacing, left-aligned at x. */
function spaced(ctx, text, x, y, spacing) {
  for (const ch of text) {
    ctx.fillText(ch, x, y)
    x += ctx.measureText(ch).width + spacing
  }
}

/** Set the largest font (from max down to min px) that fits text in width; false if even min doesn't. */
function fitFont(ctx, text, width, max, min, pattern) {
  let px = max
  ctx.font = pattern.replace('{px}', px)
  while (px > min && ctx.measureText(text).width > width) ctx.font = pattern.replace('{px}', --px)
  return ctx.measureText(text).width <= width
}

/** "relay-production-7034.up.railway.app" → ["relay-production-7034.", "up.railway.app"]. */
function splitAtDot(text) {
  const dots = [...text.matchAll(/\./g)].map((m) => m.index + 1)
  if (!dots.length) return [text]
  const cut = dots.reduce((a, b) => (Math.abs(b - text.length / 2) < Math.abs(a - text.length / 2) ? b : a))
  return [text.slice(0, cut), text.slice(cut)]
}

function withAlpha(hex, a) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return `rgba(255,181,71,${a})`
  const n = parseInt(m[1], 16)
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function fit(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text
  while (text.length > 1 && ctx.measureText(`${text}…`).width > width) text = text.slice(0, -1)
  return `${text}…`
}
