// pushplay runtime v10 — replaced by `npm run update-kit`; don't edit, extend from game.js.
//
// The online lobby: Quick match / Host / Join, the open-games list and the waiting room, all
// on a controller (A chooses, B goes back; the game's own pause menu handles Start / Esc).
// Shared by every online game; style it with the options, not by editing.
//
//   const lobby = createLobby(net, input, { title: 'Tank Duel' })
//   in the lobby screen:  const result = lobby.update()   // 'start' | 'back' | null
//                         lobby.draw(ctx, W, H)

export function createLobby(net, input, { title = '', accent = '#ffb547', ink = '#eef0f5', quiet = '#9aa3b5', panel = 'rgba(13,15,20,0.85)' } = {}) {
  const MENU = ['Quick match', 'Host a game', 'Join a game', 'Back']
  let screen = 'menu' // menu | browse | room
  let choice = 0
  let refreshedAt = 0
  let started = false
  // The build check plays two copies against each other with no one at the controls.
  let auto = typeof window !== 'undefined' && Boolean(window.__kitNetTest)

  /** -1 / +1 per d-pad press, stick flick or arrow key, with key repeat (input.navY). */
  const step = () => input.navY

  const lobby = {
    get screen() {
      return net.room ? 'room' : screen
    },

    /** Open the lobby (from the title screen, or after a match). */
    open() {
      screen = 'menu'
      choice = 0
      started = false
      net.error = ''
    },

    update() {
      if (net.status === 'playing') {
        if (started) return null
        started = true
        return 'start'
      }
      started = false // a match ended: the next one starts again
      if (net.status === 'connecting') return null
      if (net.status === 'error') {
        if (input.pressed('a')) {
          net.error = ''
          net.status = 'idle'
          screen = 'menu'
        } else if (input.pressed('b')) return leave()
        return null
      }

      if (net.room) {
        if (net.isHost && net.players.length >= net.minPlayers && (input.pressed('a') || auto)) {
          auto = false
          net.start()
        }
        if (input.pressed('b')) net.leave()
        return null
      }

      if (screen === 'menu') {
        if (auto === true) {
          auto = 'matching'
          void net.quickMatch()
          return null
        }
        choice = (choice + step() + MENU.length) % MENU.length
        if (input.pressed('b')) return leave()
        if (input.pressed('a')) {
          net.error = ''
          if (choice === 0) void net.quickMatch()
          if (choice === 1) void net.host()
          if (choice === 2) {
            screen = 'browse'
            choice = 0
            refreshedAt = 0
            void net.connect()
          }
          if (choice === 3) return leave()
        }
        return null
      }

      // browse
      const now = performance.now()
      if (now - refreshedAt > 2000 && net.status === 'online') {
        refreshedAt = now
        net.refresh()
      }
      if (net.rooms.length) choice = (choice + step() + net.rooms.length) % net.rooms.length
      if (input.pressed('a') && net.rooms[choice]) void net.join(net.rooms[choice].id)
      if (input.pressed('b')) {
        screen = 'menu'
        choice = 2
      }
      return null
    },

    draw(ctx, W, H) {
      ctx.save()
      ctx.fillStyle = panel
      ctx.fillRect(0, 0, W, H)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      const text = (s, y, size = 28, color = ink, weight = 600) => {
        ctx.font = `${weight} ${size}px system-ui, sans-serif`
        ctx.fillStyle = color
        ctx.fillText(s, W / 2, y)
      }
      const hint = (s) => text(s, H - 72, 24, quiet, 500)
      if (title) text(title, 120, 48, ink, 800)

      if (net.status === 'connecting') {
        text('Connecting…', H / 2, 32)
      } else if (net.status === 'error') {
        text(net.error || 'Something went wrong.', H / 2 - 20, 30)
        hint(`${input.label('a')} try again · ${input.label('b')} back`)
      } else if (net.room) {
        text(`Room ${net.room}`, 210, 40, accent, 800)
        if (net.status === 'reconnecting') text('Reconnecting…', 250, 26, accent, 600)
        net.players.forEach((id, i) => {
          const me = id === net.me
          const away = net.away?.includes(id)
          text(`${i === 0 ? 'Host' : `Player ${i + 1}`}${me ? ' (you)' : ''}${away ? ' · away' : ''}`, 290 + i * 48, 28, away ? quiet : me ? accent : ink, me ? 700 : 500)
        })
        for (let i = net.players.length; i < net.maxPlayers; i++) text('Waiting for a player…', 290 + i * 48, 26, quiet, 400)
        if (net.isHost) {
          const ready = net.players.length >= net.minPlayers
          hint(ready ? `${input.label('a')} start · ${input.label('b')} leave` : `Others can join with Quick match or room ${net.room} · ${input.label('b')} leave`)
        } else hint(`Waiting for the host to start · ${input.label('b')} leave`)
      } else if (screen === 'browse') {
        text('Open games', 210, 36, ink, 700)
        if (!net.rooms.length) text('No open games yet. Go back and host one!', H / 2, 28, quiet, 500)
        net.rooms.slice(0, 8).forEach((r, i) => {
          const on = i === choice
          text(`${on ? '▶ ' : ''}Room ${r.id} · ${r.players}/${r.max} players`, 290 + i * 52, 30, on ? accent : ink, on ? 700 : 500)
        })
        if (net.error) text(net.error, H - 130, 24, accent, 500)
        hint(`${input.label('a')} join · ${input.label('b')} back`)
      } else {
        MENU.forEach((label, i) => {
          const on = i === choice
          text(`${on ? '▶ ' : ''}${label}`, 280 + i * 64, 34, on ? accent : ink, on ? 800 : 500)
        })
        if (net.error) text(net.error, H - 130, 24, accent, 500)
        hint(`${input.label('a')} choose · ${input.label('b')} back`)
      }
      ctx.restore()
    }
  }

  function leave() {
    net.disconnect()
    screen = 'menu'
    return 'back'
  }

  return lobby
}
