// pushplay runtime v11 — replaced by `npm run update-kit`; don't edit, extend from game.js.
//
// A vertical menu that works the same with a controller, a keyboard, a mouse and touch:
//   d-pad / stick / arrows / WASD move, A / Space / Enter choose, B / Backspace / right-click
//   and the menu button (Start / Esc) go back, hovering highlights, clicking or tapping chooses.
// Use it for every menu (title, pause, game over, settings) so no player gets stuck.
//
//   const pause = createMenu([{ id: 'resume', label: 'Resume' }, { id: 'quit', label: 'Quit to title' }])
//   const choice = pause.update(input, dt)   // each frame: 'resume', 'quit', 'back' or null
//   pause.draw(ctx)
//
// Value items change with left/right (stick, d-pad, arrows, LB/RB, the ‹ › arrows, or tapping
// the left/right half of the row) and call item.onChange?.(value):
//   { id: 'music', label: 'Music', type: 'toggle', value: true }
//   { id: 'volume', label: 'Volume', type: 'range', value: 0.8, min: 0, max: 1, step: 0.1, format: (v) => `${Math.round(v * 100)}%` }
//   { id: 'size', label: 'Text size', type: 'choice', value: 1, options: [{ value: 1, label: 'Normal' }, { value: 1.5, label: 'Large' }] }
// Read them back with menu.value('music').
//
// Inside the launcher, a pause menu (any menu with a 'resume' item) also ends with "Quit to
// library", so players can always find the way back to their games. It quits through the
// launcher; the game never sees the choice. Outside the launcher it isn't added. Opt out (or in,
// for a pause menu without 'resume') with createMenu(items, { quitToLibrary: false | true }).

const VALUE_TYPES = new Set(['toggle', 'range', 'choice'])
export const QUIT_TO_LIBRARY = 'quit-to-library'

/**
 * items: [{ id, label, disabled?, type?, value?, ... }]. Options: center x and top y of the menu in
 * game coordinates, item width and height, gap between items, wrap (default true) and colors.
 */
export function createMenu(items, options = {}) {
  const o = { x: 640, y: 420, width: 420, height: 64, gap: 14, wrap: true, accent: '#ffb547', text: '#eef0f5', idle: 'rgba(255,255,255,0.08)', ...options }
  const launcher = globalThis.pushplay
  // Pause menus (they have 'resume') and title menus (they have 'play') get it unless told otherwise.
  if ((o.quitToLibrary ?? items.some((i) => i.id === 'resume' || i.id === 'play')) && typeof launcher?.quit === 'function') {
    items.push({ id: QUIT_TO_LIBRARY, label: 'Quit to library' })
    // Half a row higher, so the longer menu stays centred where the game put it.
    o.y -= (o.height + o.gap) / 2
  }
  /** Quit to library goes straight to the launcher. */
  const choose = (id) => {
    if (id !== QUIT_TO_LIBRARY) return id
    launcher.quit()
    return null
  }
  let selected = Math.max(0, items.findIndex((i) => !i.disabled))
  let hovered = -1

  const rect = (i) => ({ x: o.x - o.width / 2, y: o.y + i * (o.height + o.gap), w: o.width, h: o.height })
  const hit = (p, i) => {
    const r = rect(i)
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
  }
  const move = (dir) => {
    for (let n = 1; n <= items.length; n++) {
      const i = selected + dir * n
      if (!o.wrap && (i < 0 || i >= items.length)) return
      const j = ((i % items.length) + items.length) % items.length
      if (!items[j].disabled) return (selected = j)
    }
  }
  const round = (v, step) => Number((Math.round(v / step) * step).toFixed(6))
  /** Change a value item by dir (-1/1). Returns true when it's a value item. */
  const change = (item, dir) => {
    if (!VALUE_TYPES.has(item.type) || item.disabled) return false
    const old = item.value
    if (item.type === 'toggle') item.value = !item.value
    else if (item.type === 'range') {
      const step = item.step ?? 0.1
      item.value = Math.max(item.min ?? 0, Math.min(item.max ?? 1, round((item.value ?? 0) + dir * step, step)))
    } else if (item.type === 'choice') {
      const n = item.options.length
      const i = item.options.findIndex((opt) => opt.value === item.value)
      item.value = item.options[(((i < 0 ? 0 : i) + dir) % n + n) % n].value
    }
    if (item.value !== old) item.onChange?.(item.value)
    return true
  }
  const display = (item) => {
    if (item.type === 'toggle') return item.value ? 'On' : 'Off'
    if (item.type === 'range') return item.format ? item.format(item.value) : String(item.value)
    if (item.type === 'choice') return item.options.find((opt) => opt.value === item.value)?.label ?? String(item.value)
    return ''
  }

  return {
    items,
    get selected() {
      return items[selected]
    },
    select(id) {
      const i = items.findIndex((it) => it.id === id && !it.disabled)
      if (i >= 0) selected = i
    },
    value(id) {
      return items.find((it) => it.id === id)?.value
    },
    rect,
    display,

    /** Call once per frame. Returns the chosen action item's id, 'back', or null. */
    update(input, dt = 1 / 60) {
      const ny = input.navY ?? (input.pressed('up') ? -1 : input.pressed('down') ? 1 : 0)
      if (ny) move(ny)
      const nx = (input.navX ?? 0) || (input.pressed('rb') ? 1 : input.pressed('lb') ? -1 : 0)
      const current = items[selected]
      if (nx && current) change(current, nx)

      // Mouse and touch: hover highlights (mouse only), a click or tap chooses or changes.
      const p = input.pointer
      hovered = -1
      if (p?.active) {
        const over = items.findIndex((it, i) => !it.disabled && hit(p, i))
        if (input.mode === 'mouse') hovered = over
        if (over >= 0 && (input.mode === 'mouse' || p.pressed)) selected = over
        // A click or tap that ends on an item picks it (a quick tap can press and release in one frame).
        if (p.released && over >= 0) {
          selected = over
          const item = items[over]
          if (VALUE_TYPES.has(item.type)) change(item, p.x < o.x ? -1 : 1)
          else return choose(item.id)
        }
      }

      if (input.pressed('a') && current && !current.disabled) {
        if (current.type === 'toggle' || current.type === 'choice') change(current, 1)
        else if (current.type !== 'range') return choose(current.id)
      }
      if (input.pressed('b') || input.pressed('menu')) return 'back'
      return null
    },

    /** A plain default look; draw your own with menu.items, menu.selected and menu.rect(i) if you like. */
    draw(ctx, font = '600 30px system-ui, sans-serif') {
      ctx.save()
      ctx.font = font
      ctx.textBaseline = 'middle'
      items.forEach((it, i) => {
        const r = rect(i)
        const on = i === selected
        ctx.fillStyle = on ? o.accent : o.idle
        ctx.beginPath()
        ctx.roundRect(r.x, r.y, r.w, r.h, 14)
        ctx.fill()
        if (i === hovered && !on) {
          ctx.strokeStyle = o.accent
          ctx.lineWidth = 2
          ctx.stroke()
        }
        ctx.globalAlpha = it.disabled ? 0.4 : 1
        ctx.fillStyle = on ? '#1a1206' : o.text
        const cy = r.y + r.h / 2
        if (VALUE_TYPES.has(it.type)) {
          ctx.textAlign = 'left'
          ctx.fillText(it.label, r.x + 24, cy)
          ctx.textAlign = 'right'
          ctx.fillText(display(it), r.x + r.w - 54, cy)
          ctx.textAlign = 'center'
          ctx.fillText('‹', r.x + r.w - 78 - ctx.measureText(display(it)).width, cy)
          ctx.fillText('›', r.x + r.w - 30, cy)
        } else {
          ctx.textAlign = 'center'
          ctx.fillText(it.label, o.x, cy)
        }
        ctx.globalAlpha = 1
      })
      ctx.restore()
    }
  }
}
