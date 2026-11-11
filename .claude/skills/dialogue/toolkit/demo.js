// Dialogue demo: renders the box in four states with a fake input, for screenshots and as a usage example.
import { createRunner } from './dialogue-script.js'
import { createDialogueBox } from './dialogue.js'

const script = `
=== smith
Brom (grumpy): Shop's closed, $name. Come back when the forge is *hot*.
: The forge hisses. Somewhere behind it, something {c=#ff9a4a}glows{/c}.
Brom (grumpy): Well? {w} I haven't got all day.
-> Ask about the sword [once]
    Brom: That old thing? It's not for sale.
-> Buy the sword [if gold >= 50]
    ~ set gold -= 50
    Brom (happy): {shake}Finally!{/shake} A customer.
-> Leave
    >> end
`

// a stand-in for the game's input.js: the parts the box reads
const input = { mode: 'gamepad', navY: 0, pointer: { x: 0, y: 0, pressed: false }, _p: new Set(), pressed(b) { return this._p.has(b) } }
const step = (box, frames = 1, press = []) => { for (let i = 0; i < frames; i++) { input._p = new Set(i === 0 ? press : []); box.update(1 / 60) } input._p = new Set() }

// the game's own prompt drawer would be passed in; this stand-in draws a chip and the label
const drawPrompts = (ctx, inp, pairs, { x, y, align, size }) => {
  ctx.save(); ctx.font = `600 ${size}px system-ui`; ctx.textBaseline = 'middle'
  const txt = pairs.map(([b, t]) => `[${{ a: 'A', b: 'B', select: 'View' }[b]}] ${t}`).join('    ')
  ctx.textAlign = align; ctx.fillStyle = '#cfc6b0'; ctx.fillText(txt, x, y); ctx.restore()
}
// portraits are injected: here a simple bust; a pixel-art game passes its baked portrait frames
const portrait = (ctx, who, mood, x, y, s, talking) => {
  ctx.fillStyle = '#2a2236'; ctx.fillRect(x, y, s, s)
  ctx.fillStyle = who === 'Brom' ? '#c98a5a' : '#8ab'; ctx.beginPath(); ctx.arc(x + s / 2, y + s * 0.45, s * 0.28, 0, 7); ctx.fill()
  ctx.fillStyle = '#3a2a22'; ctx.fillRect(x + s * 0.38, y + s * 0.4, 8, mood === 'happy' ? 4 : 8); ctx.fillRect(x + s * 0.58, y + s * 0.4, 8, mood === 'happy' ? 4 : 8)
  ctx.fillRect(x + s * 0.42, y + s * (talking ? 0.56 : 0.58), s * 0.16, talking ? 8 : 3)
}

function scene(title, setup) {
  const c = document.createElement('canvas'); c.width = 1280; c.height = 800; document.body.appendChild(c)
  const ctx = c.getContext('2d')
  const box = createDialogueBox({ input, drawPrompts, portrait, style: { nameColors: { Brom: '#ffb36b' } } })
  box.open(createRunner(script, { vars: { name: 'Ash', gold: 60 } }).start('smith'))
  setup(box)
  const g = ctx.createLinearGradient(0, 0, 0, 800); g.addColorStop(0, '#2b3a55'); g.addColorStop(1, '#141824')
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1280, 800)
  ctx.fillStyle = '#eee'; ctx.font = '600 32px system-ui'; ctx.fillText(title, 40, 60)
  box.draw(ctx)
}

scene('typing (gamepad)', (box) => { input.mode = 'gamepad'; step(box, 40) })
scene('finished line with markup (mouse: Skip button)', (box) => { input.mode = 'mouse'; step(box, 1, ['a']); step(box, 1, ['a']); step(box, 400) })
scene('choices', (box) => { input.mode = 'gamepad'; for (let i = 0; i < 6; i++) step(box, 1, ['a']); step(box, 400); input.navY = 1; step(box, 1); input.navY = 0 })
scene('log (select / View)', (box) => { input.mode = 'keyboard'; for (let i = 0; i < 6; i++) step(box, 1, ['a']); step(box, 1, ['select']) })
document.title = 'ready'
