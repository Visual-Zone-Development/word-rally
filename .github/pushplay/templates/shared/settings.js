// pushplay runtime v10 — replaced by `npm run update-kit`; don't edit, extend from game.js.
//
// A ready-made settings screen (master / music / SFX volume, reduced screen shake, text size)
// built on menu.js, so it works with every input. Reachable from the title and the pause menu.
//
//   const screen = createSettingsScreen({ settings, audio, extra: [{ id: 'hard', label: 'Hard mode', type: 'toggle', value: false }] })
//   // while state.screen === 'settings':
//   if (screen.update(input, dt) === 'back') state.screen = previous
//   screen.draw(ctx)
// Extra items work like menu.js items; their values land in settings.data[id] and are saved.

import { createMenu } from './menu.js'

const pct = (v) => `${Math.round(v * 100)}%`

export function createSettingsScreen({ settings, audio, extra = [], title = 'Settings', x = 640, y = 190, width = 680 } = {}) {
  const data = settings.data
  const volume = (id, label) => ({
    id,
    label,
    type: 'range',
    value: data[id] ?? 1,
    min: 0,
    max: 1,
    step: 0.1,
    format: pct,
    onChange: (v) => {
      data[id] = v
      audio?.setVolume(id, v)
      if (id === 'sfx' || id === 'master') audio?.tone({ freq: 520, dur: 0.06, gain: 0.15 })
    }
  })
  const items = [
    volume('master', 'Master volume'),
    volume('music', 'Music volume'),
    volume('sfx', 'Sound effects'),
    { id: 'reducedShake', label: 'Reduce screen shake', type: 'toggle', value: Boolean(data.reducedShake), onChange: (v) => (data.reducedShake = v) },
    {
      id: 'textScale',
      label: 'Text size',
      type: 'choice',
      value: data.textScale ?? 1,
      options: [
        { value: 1, label: 'Normal' },
        { value: 1.25, label: 'Large' },
        { value: 1.5, label: 'Extra large' }
      ],
      onChange: (v) => (data.textScale = v)
    },
    ...extra.map((item) => ({
      ...item,
      value: item.value === undefined || !(item.id in data) ? item.value : data[item.id],
      onChange: (v) => {
        data[item.id] = v
        item.onChange?.(v)
      }
    })),
    { id: 'back', label: 'Back' }
  ]
  const menu = createMenu(items, { x, y, width, height: 58, gap: 12 })

  return {
    menu,
    /** Returns 'back' when the player leaves (settings are saved then), an extra action's id, or null. */
    update(input, dt) {
      const choice = menu.update(input, dt)
      if (choice === 'back') {
        settings.save()
        return 'back'
      }
      return choice
    },
    draw(ctx, { font = '600 28px system-ui, sans-serif', titleFont = '700 56px system-ui, sans-serif', color = '#eef0f5' } = {}) {
      ctx.save()
      ctx.fillStyle = color
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = titleFont
      ctx.fillText(title, x, y - 80)
      ctx.restore()
      menu.draw(ctx, font)
    }
  }
}
