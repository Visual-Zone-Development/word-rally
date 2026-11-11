// pushplay runtime v10 — replaced by npm run update-kit; don't edit
// The phone side of a party game. party.js (on the TV) puts this script at the top of the
// game's controller.html and sends the page to each phone, where it runs with no network: it
// talks only to the TV, through the join page. It defines a global `controller`:
//
//   controller.me          { id, name, color, room }
//   controller.players     [{ id, name, color, kind, connected }]
//   controller.public      what the TV shares with every phone (party.public)
//   controller.mine        what the TV shows only this phone (party.view(id))
//   controller.on('update', fn)        after any of the above change
//   controller.on('msg', fn)           one-off messages from the TV (party.send)
//   controller.input({ x, y, a, b })   held controls; sent when they change (party.inputs[id])
//   controller.send(data)              a one-off message to the TV (party.on('msg'))
//   controller.vibrate(ms)
//
// While the TV's lobby is open (public.lobby), a built-in screen shows who's in and gives the
// first player a Start button. Set controller.lobbyScreen = false to draw your own.
;(() => {
  const listeners = {}
  const SEND_MS = 33
  let sentInput = '{}'
  let nextInput = null
  let inputTimer = null

  const controller = {
    me: { id: null, name: '', color: '#ffb547', room: '' },
    players: [],
    public: {},
    mine: {},
    lobbyScreen: true,
    on(type, fn) {
      ;(listeners[type] ??= []).push(fn)
      return () => (listeners[type] = listeners[type].filter((f) => f !== fn))
    },
    input(value) {
      nextInput = JSON.stringify(value ?? {})
      if (inputTimer === null) flushInput()
    },
    send(data) {
      parent.postMessage({ type: 'send', d: { k: 'm', d: data } }, '*')
    },
    vibrate(ms = 30) {
      parent.postMessage({ type: 'vibrate', ms }, '*')
    }
  }

  /** At most one input message per SEND_MS; the newest value always gets through. */
  function flushInput() {
    inputTimer = null
    if (nextInput === null || nextInput === sentInput) return
    sentInput = nextInput
    parent.postMessage({ type: 'send', d: { k: 'i', i: JSON.parse(sentInput) } }, '*')
    inputTimer = setTimeout(flushInput, SEND_MS)
  }

  const emit = (type, payload) => {
    for (const fn of listeners[type] ?? []) fn(payload)
  }

  addEventListener('message', (e) => {
    if (e.source !== parent || !e.data) return
    if (e.data.type === 'me') {
      controller.me = { ...e.data.me, color: controller.players.find((p) => p.id === e.data.me.id)?.color ?? e.data.me.color }
      return changed()
    }
    if (e.data.type !== 'msg') return
    const d = e.data.d
    if (d.k === 'P') controller.public = d.s
    else if (d.k === 'p') controller.public = applyPatch(controller.public, d.p)
    else if (d.k === 'V') controller.mine = d.s
    else if (d.k === 'v') controller.mine = applyPatch(controller.mine, d.p)
    else if (d.k === 'pl') {
      controller.players = d.players
      // The TV may have given us a different colour (ours was taken).
      const mine = d.players.find((p) => p.id === controller.me.id)
      if (mine) controller.me = { ...controller.me, color: mine.color }
    }
    else if (d.k === 'm') return emit('msg', d.d)
    else return
    changed()
  })

  function changed() {
    lobby()
    emit('update', controller)
  }

  // ---- built-in lobby screen -------------------------------------------------------------

  let screen = null
  function lobby() {
    const l = controller.public.lobby
    if (!l || !controller.lobbyScreen) {
      screen?.remove()
      screen = null
      return
    }
    if (!screen) {
      screen = document.createElement('div')
      screen.style.cssText =
        'position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px;background:#0d0f14;color:#eef0f5;font:18px/1.4 system-ui,sans-serif;text-align:center'
      document.body.append(screen)
    }
    const vip = l.vip === controller.me.id
    const others = controller.players.filter((p) => p.id !== controller.me.id)
    screen.replaceChildren()
    const h = document.createElement('div')
    h.style.cssText = `font-size:28px;font-weight:800;color:${controller.me.color || '#ffb547'}`
    h.textContent = `You're in, ${controller.me.name}!`
    const who = document.createElement('div')
    who.style.color = '#9aa3b5'
    who.textContent = others.length ? `With ${others.map((p) => p.name).join(', ')}` : 'Waiting for others to join…'
    screen.append(h, who)
    if (vip && l.canStart) {
      const b = document.createElement('button')
      b.textContent = 'Everybody’s in — start!'
      b.style.cssText = 'font:inherit;font-size:22px;font-weight:800;padding:16px 28px;border:0;border-radius:14px;background:#ffb547;color:#1b1404'
      b.onclick = () => {
        controller.send({ $start: true })
        controller.vibrate(20)
      }
      screen.append(b)
    } else {
      const wait = document.createElement('div')
      wait.style.color = '#9aa3b5'
      wait.textContent = vip ? `Need ${l.need} more to start` : 'The game starts from the TV or the first player’s phone.'
      screen.append(wait)
    }
  }

  // Same as net.js applyPatch: [path, value] sets, [path] deletes.
  function applyPatch(root, ops) {
    root = structuredClone(root)
    for (const [path, value] of ops) {
      const deleting = value === undefined
      if (!path.length) {
        root = deleting ? {} : value
        continue
      }
      let node = root
      for (let i = 0; i < path.length - 1; i++) {
        if (node[path[i]] === null || typeof node[path[i]] !== 'object') node[path[i]] = typeof path[i + 1] === 'number' ? [] : {}
        node = node[path[i]]
      }
      const key = path.at(-1)
      if (deleting) delete node[key]
      else node[key] = value
    }
    return root
  }

  window.controller = controller
  // Ready once the page's own scripts have run and registered their listeners.
  let ready = false
  const announce = () => {
    if (ready) return
    ready = true
    parent.postMessage({ type: 'ready' }, '*')
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', announce)
  else setTimeout(announce)
})()
