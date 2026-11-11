// pushplay runtime v11 — replaced by `npm run update-kit`; don't edit, extend from game.js.
//
// On-screen controls for touch-only play (phones, tablets without a controller): a floating
// stick under the left thumb and up to four round buttons under the right thumb. They feed
// input.js, so gameplay code reads input.x / input.y and input.held('a') exactly as it does for
// a controller or a keyboard, and the controls show only while the player is using touch.
//
//   import { createTouchControls } from './touch.js'
//   const touch = createTouchControls(input, { stick: true, buttons: ['a', 'b'], labels: { a: 'Jump' } })
//   each frame:   input.update(dt)
//                 touch.update()          // the stick becomes input.x/y, the buttons input.held/pressed/released
//   draw last:    touch.draw(ctx)         // draws nothing unless input.mode === 'touch' (and touch.enabled)
//
// It lays itself out in the space input.attach(canvas, w, h) was given and keeps clear of fit.safe
// (the notch and home bar) through that canvas, so no sizes need passing; a phone game made with
// --phone has it wired already, and any game can add it: it's a runtime file in every game.
//
//   touch.enabled = false                 // hide and ignore during menus and cutscenes (true by default)
//   touch.active                          // a finger is on the stick or a button right now
//   touch.owns(pointer.id)                // true for a pointer in input.pointers the controls are using
//   touch.stick                           // { active, x, y, ox, oy }: the stick vector and where its base is
//   touch.buttonAt(id)                    // { x, y, r } of a button, for drawing hints
//
// Options (game units of the space):
//   stick           false leaves the stick out (tap-only games with buttons); default true
//   buttons         up to four of 'a' 'b' 'x' 'y' 'lb' 'rb' 'lt' 'rt' (default ['a', 'b']); laid out like a pad; [] for none
//   labels          { a: 'Jump', b: 'Dash' } drawn under the buttons (optional)
//   radius          button radius (default 44: a 88 px target, well over the 64 px minimum)
//   stickRadius     how far the knob travels (default 70)
//   stickZone       { x, y, w, h } where a touch starts the stick (default: the left half of the lower 60%)
//   buttonZone      { x, y, w, h } where the buttons sit (default: the right half of the lower 60%)
//   w, h, safe      the space and insets, when not taken from input.attach / fit.safe
//   accent, ink     colours
//
// A game that drags things with the pointer should skip pointers the controls own:
// `if (input.pointer.down && !touch.active) …`, or check touch.owns(p.id) per pointer.
// Nothing here is a pause button: keep the game's on-screen ≡ button calling input.requestMenu().

const BUTTON_COLORS = { a: '#3fbf5f', b: '#e3514f', x: '#3f8fe3', y: '#e8c13c' }
const KNOWN = new Set(['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt'])
/** Below this fraction of stickRadius the stick reads as centred. */
const DEADZONE = 0.12
/** A finger may land this far outside a button and still press it. */
const SLOP = 24

export function createTouchControls(input, options = {}) {
  const o = {
    w: input.space?.w ?? 1280,
    h: input.space?.h ?? 800,
    stick: true,
    buttons: ['a', 'b'],
    labels: {},
    radius: 44,
    stickRadius: 70,
    margin: 40,
    safe: null,
    accent: '#ffb547',
    ink: '#eef0f5',
    ...options
  }
  const buttons = o.buttons.filter((b) => KNOWN.has(b)).slice(0, 4)
  // With fitCanvas({ fill: true }) the space follows the screen: re-read it, unless the game fixed it.
  const fixed = { w: 'w' in options, h: 'h' in options }
  const follow = () => {
    const space = input.space
    if (!fixed.w && space?.w) o.w = space.w
    if (!fixed.h && space?.h) o.h = space.h
  }
  const zone = (z, half) => z ?? { x: half ? o.w / 2 : 0, y: o.h * 0.4, w: o.w / 2, h: o.h * 0.6 }
  let stickZone = zone(o.stickZone, false)
  let buttonZone = zone(o.buttonZone, true)
  const relayout = () => {
    follow()
    stickZone = zone(o.stickZone, false)
    buttonZone = zone(o.buttonZone, true)
  }
  /** pointerId → { kind: 'stick' } | { kind: 'button', id: string | null } */
  const claimed = new Map()
  const held = new Set()
  const stick = { active: false, x: 0, y: 0, ox: 0, oy: 0 }

  /** fit.safe, read live: the option, else through the canvas input.attach was given, else none. */
  const insets = () => o.safe ?? o.insets ?? input.canvas?.__fit?.safe ?? { top: 0, right: 0, bottom: 0, left: 0 }
  const inside = (p, z) => p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h
  /** Where the stick rests when no finger is down. */
  const restSpot = () => ({ x: stickZone.x + insets().left + o.margin + o.stickRadius * 1.6, y: stickZone.y + stickZone.h - insets().bottom - o.margin - o.stickRadius * 1.6 })
  /** Button centres: one at the anchor, two on a diagonal, three or four in a pad diamond. */
  const layout = () => {
    const r = o.radius
    const gap = r * 2.5
    const ax = buttonZone.x + buttonZone.w - insets().right - o.margin - r - (buttons.length > 1 ? gap : 0)
    const ay = buttonZone.y + buttonZone.h - insets().bottom - o.margin - r - (buttons.length > 2 ? gap : 0)
    const spots = buttons.length === 1 ? [[0, 0]] : buttons.length === 2 ? [[0, 0], [gap, -gap]] : [[0, gap], [gap, 0], [-gap, 0], [0, -gap]]
    return buttons.map((id, i) => ({ id, x: ax + spots[i][0], y: ay + spots[i][1], r }))
  }
  const nearest = (p) => {
    let best = null
    for (const b of layout()) {
      const d = Math.hypot(p.x - b.x, p.y - b.y)
      if (d <= b.r + SLOP && (!best || d < best.d)) best = { id: b.id, d }
    }
    return best?.id ?? null
  }

  const touch = {
    enabled: true,
    stick,
    get active() {
      return claimed.size > 0
    },
    get visible() {
      return touch.enabled && input.mode === 'touch'
    },
    owns: (pointerId) => claimed.has(pointerId),
    held: (id) => held.has(id),
    buttonAt: (id) => layout().find((b) => b.id === id) ?? null,

    /** Call once per frame, after input.update(). */
    update() {
      relayout()
      held.clear()
      if (!touch.visible) {
        claimed.clear()
        stick.active = false
        stick.x = stick.y = 0
        return
      }
      const pointers = input.pointers ?? new Map()
      // Fingers that lifted (touch pointers leave input.pointers on release).
      for (const [id] of claimed) {
        const p = pointers.get(id)
        if (!p || !p.down) claimed.delete(id)
      }
      // New fingers: a button first (they're small), else the stick zone.
      for (const p of pointers.values()) {
        if (!p.down || claimed.has(p.id) || p.type === 'mouse') continue
        const button = nearest(p)
        if (button) claimed.set(p.id, { kind: 'button' })
        else if (o.stick && inside(p, stickZone) && ![...claimed.values()].some((c) => c.kind === 'stick')) {
          claimed.set(p.id, { kind: 'stick' })
          stick.ox = p.x
          stick.oy = p.y
        }
      }
      stick.active = false
      stick.x = stick.y = 0
      for (const [id, c] of claimed) {
        const p = pointers.get(id)
        if (c.kind === 'button') {
          // Re-aim every frame, so a thumb sliding from A to B presses B.
          const b = nearest(p)
          if (b) held.add(b)
          continue
        }
        let dx = p.x - stick.ox
        let dy = p.y - stick.oy
        let d = Math.hypot(dx, dy)
        // The base follows a finger that runs past the rim, so the stick never feels pinned.
        if (d > o.stickRadius) {
          stick.ox = p.x - (dx / d) * o.stickRadius
          stick.oy = p.y - (dy / d) * o.stickRadius
          dx = p.x - stick.ox
          dy = p.y - stick.oy
          d = o.stickRadius
        }
        const len = Math.min(1, d / o.stickRadius)
        stick.active = true
        if (len > DEADZONE) {
          const scaled = (len - DEADZONE) / (1 - DEADZONE)
          stick.x = (dx / (d || 1)) * scaled
          stick.y = (dy / (d || 1)) * scaled
        }
      }
      input.inject({ x: stick.x, y: stick.y, buttons: [...held] })
    },

    /** Draw the controls (after the game, before the pause button is fine). Nothing when not visible. */
    draw(ctx) {
      if (!touch.visible) return
      ctx.save()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      // Stick: a faint base where it rests, or where the finger put it, with the knob offset.
      if (o.stick) {
        const base = stick.active ? { x: stick.ox, y: stick.oy } : restSpot()
        ctx.globalAlpha = stick.active ? 0.55 : 0.28
        ctx.lineWidth = 3
        ctx.strokeStyle = o.ink
        ctx.fillStyle = 'rgba(255,255,255,0.08)'
        ctx.beginPath()
        ctx.arc(base.x, base.y, o.stickRadius + 16, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.globalAlpha = stick.active ? 0.9 : 0.4
        ctx.fillStyle = stick.active ? o.accent : o.ink
        ctx.beginPath()
        ctx.arc(base.x + stick.x * o.stickRadius, base.y + stick.y * o.stickRadius, o.stickRadius * 0.55, 0, Math.PI * 2)
        ctx.fill()
      }
      // Buttons: pad colours, the letter inside, the action under it.
      for (const b of layout()) {
        const on = held.has(b.id)
        ctx.globalAlpha = on ? 0.95 : 0.5
        ctx.fillStyle = BUTTON_COLORS[b.id] ?? 'rgba(255,255,255,0.25)'
        ctx.beginPath()
        ctx.arc(b.x, b.y, on ? b.r * 1.08 : b.r, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'
        ctx.stroke()
        ctx.fillStyle = BUTTON_COLORS[b.id] ? '#10140f' : o.ink
        ctx.font = `700 ${Math.round(b.r * 0.9)}px system-ui, sans-serif`
        ctx.fillText(b.id.toUpperCase(), b.x, b.y + b.r * 0.04)
        const label = o.labels[b.id]
        if (label) {
          ctx.globalAlpha = 0.85
          ctx.fillStyle = o.ink
          ctx.font = `600 ${Math.round(b.r * 0.75)}px system-ui, sans-serif`
          ctx.fillText(label, b.x, b.y + b.r + b.r * 0.6)
        }
      }
      ctx.restore()
    }
  }
  return touch
}
