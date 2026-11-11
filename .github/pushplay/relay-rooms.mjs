// Rooms and message forwarding for online games. The relay never reads game data: it groups
// players into rooms and passes their messages along, within limits.
//
// Transport-agnostic and dependency-free: the hosted relay (server.mjs) and the build kit's
// local stand-in (copied into game repos as relay-rooms.mjs) both drive it. A socket is
// anything with send(text) and close(code, reason).
//
// Protocol (JSON text frames). Client → relay:
//   {t:'list'}                    open rooms of this game
//   {t:'host', max}               open a room and join it as host
//   {t:'join', room}              join a room by code
//   {t:'quick', max}              join the oldest open room with space, or host one
//   {t:'start'}                   host only: close the room to new players
//   {t:'leave'}
//   {t:'send', to?, d}            forward d to one player (to) or everyone else in the room
//   {t:'rejoin', room, resume}    take back a slot in a started room after the socket dropped
// Relay → client:
//   {t:'hello', you, limits}      {t:'rooms', rooms:[{id, players, max}]}
//   {t:'joined', room, you, host, players, max, resume, started, away}
//   {t:'peer-join', id}  {t:'peer-leave', id}  {t:'start'}  {t:'closed', reason}
//   {t:'peer-away', id}  {t:'peer-back', id}   (a started room: a player's socket dropped / came back)
//   {t:'msg', from, d}  {t:'error', code}  {t:'warn', code}
// Once a room has started, a player whose socket drops (a phone in the background, a sleeping
// Deck) keeps its slot and id for roomGraceMs; sending {t:'rejoin'} with the `resume` token from
// `joined` gets it back, and the others see peer-away / peer-back. In an open room (the lobby) a
// drop is a leave.
//
// Party rooms: a TV host (a signed game) plus phones or browsers (unsigned, joined by code).
// Host → relay:
//   {t:'party-host', max, resume?}   open a party, or take back the one `resume` names
//   {t:'send', to?, d}               to one seat, or every connected seat
//   {t:'kick', id}  {t:'lock'}  {t:'unlock'}  {t:'leave'}
// Phone → relay:
//   {t:'party-join', room, name, color?, resume?}
//   {t:'send', d}                    always to the host
//   {t:'leave'}
// Relay → host:  {t:'party', room, you, resume, max, join, players:[{id, name, color, away}]}
//                {t:'peer-join', id, name, color}  {t:'peer-away', id}  {t:'peer-back', id}  {t:'peer-leave', id}
// Relay → phone: {t:'party-joined', room, you, resume}  {t:'host-away'}  {t:'host-back'}  {t:'closed', reason}
// Messages from the host arrive as {t:'msg', from:'host', d}; from a phone, from is its seat id.
// Seats outlive sockets: a phone that drops keeps its seat (and id) for seatGraceMs and comes
// back with its resume token; a host that drops keeps the party for hostGraceMs.

export const LIMITS = {
  maxPlayers: 8,
  /** Largest frame a client may send. */
  maxMessageBytes: 16 * 1024,
  /** Per player, counting every copy forwarded (a host sending to 3 players pays 3×). */
  bytesPerSecond: 48 * 1024,
  burstBytes: 128 * 1024,
  messagesPerSecond: 90,
  roomsPerGame: 200,
  idleRoomMs: 10 * 60_000,
  /** How long a started room keeps a dropped player's slot (phones suspend sockets in the background). */
  roomGraceMs: 60_000,
  /** Over-limit messages (dropped) before the player is disconnected. */
  strikes: 30,
  /** Seats in a party, not counting the host. */
  maxPartyPlayers: 16,
  /** A party host sends to every seat, so it gets this many times a player's rate. */
  partyHostFactor: 4,
  seatGraceMs: 120_000,
  hostGraceMs: 60_000,
  idlePartyMs: 30 * 60_000,
  /** A phone that hasn't joined a party by then is disconnected. */
  joinTimeoutMs: 20_000
}

export const CLOSE = { rate: 4029, tooBig: 4013, replaced: 4001, noParty: 4004 }

const PHONE_MESSAGES = new Set(['party-join', 'send', 'leave'])

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // no I or O: codes are read off a screen

export class Relay {
  /**
   * @param {object} [opts]
   * @param {Partial<typeof LIMITS>} [opts.limits]
   * @param {(bytes: number) => void} [opts.onTraffic] bytes sent to clients, for bandwidth budgets
   * @param {() => number} [opts.now]
   * @param {(code: string) => string} [opts.joinUrl] the join page link for a party (the TV's QR code)
   */
  constructor({ limits = {}, onTraffic = () => {}, now = Date.now, joinUrl = () => '' } = {}) {
    this.limits = { ...LIMITS, ...limits }
    this.joinUrl = joinUrl
    this.onTraffic = onTraffic
    this.now = now
    /** game → Map(code → room) */
    this.games = new Map()
    /** code → party. One code space for every game: a phone knows only the code. */
    this.parties = new Map()
    this.clients = new Set()
    this.nextId = 1
  }

  /**
   * Attach a socket. `game` namespaces rooms (repo, game id and version), so games never mix.
   * `phone` is an unsigned party player: it may only join a party and talk to its host.
   */
  connect(socket, { game = null, phone = false }) {
    const client = {
      id: `p${this.nextId++}`,
      game,
      phone,
      socket,
      room: null,
      /** Token to take this slot back after a drop (started rooms); the time the socket dropped. */
      resume: null,
      away: null,
      party: null,
      seat: null,
      factor: 1,
      connected: this.now(),
      bytes: this.limits.burstBytes,
      messages: this.limits.messagesPerSecond,
      refilled: this.now(),
      strikes: 0,
      warned: -Infinity
    }
    this.clients.add(client)
    const { maxMessageBytes, bytesPerSecond, maxPlayers } = this.limits
    this.#send(client, { t: 'hello', you: client.id, limits: { maxMessageBytes, bytesPerSecond, maxPlayers } })
    return {
      id: client.id,
      receive: (text) => this.#receive(client, text),
      disconnect: () => this.#disconnect(client)
    }
  }

  /** Close idle rooms, expire dropped seats and hosts, drop phones that never joined. Call every 30 s or so. */
  sweep() {
    const now = this.now()
    const cutoff = now - this.limits.idleRoomMs
    for (const rooms of this.games.values()) {
      for (const room of [...rooms.values()]) {
        if (room.active < cutoff) {
          this.#close(room, 'idle')
          continue
        }
        // Dropped players who never came back give up their slot (the host's drop ends the room).
        for (const p of [...room.players]) if (p.away !== null && p.away < now - this.limits.roomGraceMs) this.#drop(p)
      }
    }

    const { seatGraceMs, hostGraceMs, idlePartyMs, joinTimeoutMs } = this.limits
    for (const party of [...this.parties.values()]) {
      if (party.active < now - idlePartyMs) this.#closeParty(party, 'idle')
      else if (!party.host && party.hostAway < now - hostGraceMs) this.#closeParty(party, 'host-left')
      else for (const seat of [...party.seats.values()]) if (!seat.client && seat.away < now - seatGraceMs) this.#removeSeat(party, seat)
    }
    for (const client of this.clients) if (client.phone && !client.party && client.connected < now - joinTimeoutMs) client.socket.close(CLOSE.noParty, 'no party joined')
  }

  /** Close every connection (budget exhausted, shutdown). */
  closeAll(code, reason) {
    for (const client of [...this.clients]) client.socket.close(code, reason)
  }

  stats() {
    let rooms = 0
    for (const r of this.games.values()) rooms += r.size
    let phones = 0
    for (const c of this.clients) if (c.phone) phones++
    return { players: this.clients.size, rooms, games: this.games.size, parties: this.parties.size, phones }
  }

  #receive(client, text) {
    const size = typeof text === 'string' ? Buffer.byteLength(text) : text.length
    if (size > this.limits.maxMessageBytes) return client.socket.close(CLOSE.tooBig, 'message too big')
    let msg
    try {
      msg = JSON.parse(text)
    } catch {
      return this.#send(client, { t: 'error', code: 'bad-message' })
    }
    if (!msg || typeof msg !== 'object') return this.#send(client, { t: 'error', code: 'bad-message' })
    if (client.phone && !PHONE_MESSAGES.has(msg.t)) return this.#send(client, { t: 'error', code: 'bad-message' })

    const recipients = msg.t === 'send' ? this.#recipients(client, msg.to).length : 1
    if (!this.#spend(client, size * Math.max(1, recipients))) return

    switch (msg.t) {
      case 'list':
        return this.#send(client, { t: 'rooms', rooms: this.#openRooms(client.game).map((r) => ({ id: r.id, players: r.players.length, max: r.max })) })
      case 'host':
        return this.#host(client, msg.max)
      case 'join':
        return this.#join(client, String(msg.room ?? '').toUpperCase())
      case 'quick': {
        const max = this.#max(msg.max)
        const room = this.#openRooms(client.game).find((r) => r.max === max && r !== client.room)
        return room ? this.#join(client, room.id) : this.#host(client, max)
      }
      case 'start':
        if (client.room?.host === client) {
          client.room.open = false
          this.#broadcast(client.room, { t: 'start' })
        }
        return
      case 'leave':
        return client.party ? this.#leaveParty(client) : this.#leave(client)
      case 'rejoin':
        return this.#rejoin(client, String(msg.room ?? '').toUpperCase(), msg.resume)
      case 'party-host':
        return this.#hostParty(client, msg)
      case 'party-join':
        return this.#joinParty(client, msg)
      case 'kick':
      case 'lock':
      case 'unlock': {
        const party = client.party
        if (!party || party.host !== client) return this.#send(client, { t: 'error', code: 'no-room' })
        if (msg.t === 'lock') party.locked = true
        else if (msg.t === 'unlock') party.locked = false
        else {
          const seat = party.seats.get(msg.id)
          if (seat?.client) this.#send(seat.client, { t: 'closed', reason: 'kicked' })
          if (seat) this.#removeSeat(party, seat)
        }
        return
      }
      case 'send': {
        if (client.party) {
          client.party.active = this.now()
          const out = JSON.stringify({ t: 'msg', from: client.seat ? client.seat.id : 'host', d: msg.d })
          for (const to of this.#recipients(client, msg.to)) this.#sendRaw(to, out)
          return
        }
        if (!client.room) return this.#send(client, { t: 'error', code: 'no-room' })
        client.room.active = this.now()
        const out = JSON.stringify({ t: 'msg', from: client.id, d: msg.d })
        for (const to of this.#recipients(client, msg.to)) this.#sendRaw(to, out)
        return
      }
      default:
        return this.#send(client, { t: 'error', code: 'bad-message' })
    }
  }

  /** Token buckets for bytes and messages. Over the limit: drop, warn, and eventually disconnect. */
  #spend(client, bytes) {
    const now = this.now()
    const seconds = (now - client.refilled) / 1000
    client.refilled = now
    const f = client.factor
    const [bytesPerSecond, burstBytes, messagesPerSecond] = [this.limits.bytesPerSecond * f, this.limits.burstBytes * f, this.limits.messagesPerSecond * f]
    client.bytes = Math.min(burstBytes, client.bytes + seconds * bytesPerSecond)
    client.messages = Math.min(messagesPerSecond, client.messages + seconds * messagesPerSecond)
    if (client.bytes >= bytes && client.messages >= 1) {
      client.bytes -= bytes
      client.messages -= 1
      return true
    }
    if (++client.strikes > this.limits.strikes) {
      client.socket.close(CLOSE.rate, 'sending too much')
      return false
    }
    if (now - client.warned > 1000) {
      client.warned = now
      this.#send(client, { t: 'warn', code: 'rate' })
    }
    return false
  }

  #max(max) {
    const n = Math.floor(Number(max))
    return Number.isFinite(n) ? Math.max(2, Math.min(this.limits.maxPlayers, n)) : 2
  }

  #rooms(game) {
    let rooms = this.games.get(game)
    if (!rooms) this.games.set(game, (rooms = new Map()))
    return rooms
  }

  #openRooms(game) {
    const rooms = this.games.get(game)
    if (!rooms) return []
    return [...rooms.values()].filter((r) => r.open && r.players.length < r.max).sort((a, b) => a.created - b.created)
  }

  #host(client, max) {
    this.#leaveParty(client)
    this.#leave(client)
    const rooms = this.#rooms(client.game)
    if (rooms.size >= this.limits.roomsPerGame) return this.#send(client, { t: 'error', code: 'busy' })
    const id = this.#code(rooms)
    const now = this.now()
    const room = { id, game: client.game, host: client, players: [client], max: this.#max(max), open: true, created: now, active: now }
    rooms.set(id, room)
    client.room = room
    client.resume = crypto.randomUUID()
    this.#sendJoined(client)
  }

  #join(client, id) {
    const room = this.games.get(client.game)?.get(id)
    if (!room) return this.#send(client, { t: 'error', code: 'not-found' })
    if (room === client.room) return this.#sendJoined(client)
    if (!room.open) return this.#send(client, { t: 'error', code: 'started' })
    if (room.players.length >= room.max) return this.#send(client, { t: 'error', code: 'full' })
    this.#leaveParty(client)
    this.#leave(client)
    this.#broadcast(room, { t: 'peer-join', id: client.id })
    room.players.push(client)
    room.active = this.now()
    client.room = room
    client.resume = crypto.randomUUID()
    this.#sendJoined(client)
  }

  #sendJoined(client) {
    const room = client.room
    this.#send(client, {
      t: 'joined',
      room: room.id,
      you: client.id,
      host: room.host.id,
      players: room.players.map((p) => p.id),
      max: room.max,
      resume: client.resume,
      started: !room.open,
      away: room.players.filter((p) => p.away !== null).map((p) => p.id)
    })
  }

  /** A new socket takes back the slot `resume` names in a started room (see peer-away). */
  #rejoin(client, id, resume) {
    const room = this.games.get(client.game)?.get(id)
    const old = typeof resume === 'string' && room ? room.players.find((p) => p.resume === resume) : null
    if (!old) return this.#send(client, { t: 'error', code: 'not-found' })
    if (old === client) return this.#sendJoined(client)
    this.#leaveParty(client)
    this.#leave(client)
    if (old.away === null) {
      // The old socket hasn't noticed it's gone: the new one wins.
      this.clients.delete(old)
      old.socket.close(CLOSE.replaced, 'replaced by a newer connection')
    }
    old.room = null
    client.id = old.id
    client.resume = old.resume
    client.room = room
    client.away = null
    room.players[room.players.indexOf(old)] = client
    if (room.host === old) room.host = client
    room.active = this.now()
    this.#sendJoined(client)
    for (const p of room.players) if (p !== client) this.#sendRaw(p, JSON.stringify({ t: 'peer-back', id: client.id }))
  }

  /** A dropped player's grace ran out: the room goes on without them, or ends if they hosted it. */
  #drop(client) {
    const room = client.room
    if (!room) return
    client.room = null
    if (room.host === client) return this.#close(room, 'host-left')
    room.players = room.players.filter((p) => p !== client)
    this.#broadcast(room, { t: 'peer-leave', id: client.id })
  }

  #leave(client) {
    const room = client.room
    if (!room) return
    client.room = null
    if (room.host === client) return this.#close(room, 'host-left')
    room.players = room.players.filter((p) => p !== client)
    this.#broadcast(room, { t: 'peer-leave', id: client.id })
  }

  #close(room, reason) {
    this.games.get(room.game)?.delete(room.id)
    if (this.games.get(room.game)?.size === 0) this.games.delete(room.game)
    for (const p of room.players) {
      if (p.room !== room) continue
      p.room = null
      this.#send(p, { t: 'closed', reason })
    }
  }

  #disconnect(client) {
    if (!this.clients.delete(client)) return
    const room = client.room
    if (room && !room.open) {
      // Mid-match: keep the slot for a while (see sweep); the others see the player as away.
      client.away = this.now()
      for (const p of room.players) if (p !== client) this.#sendRaw(p, JSON.stringify({ t: 'peer-away', id: client.id }))
    } else this.#leave(client)
    const party = client.party
    if (!party) return
    // Keep the seat or the party for a while: phones lock, TVs reload.
    if (party.host === client) {
      party.host = null
      party.hostAway = this.now()
      this.#toSeats(party, { t: 'host-away' })
    } else if (client.seat?.client === client) {
      client.seat.client = null
      client.seat.away = this.now()
      if (party.host) this.#send(party.host, { t: 'peer-away', id: client.seat.id })
    }
  }

  #code(taken) {
    let id
    do id = Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join('')
    while (taken.has(id))
    return id
  }

  #hostParty(client, { max, resume }) {
    if (client.phone) return this.#send(client, { t: 'error', code: 'bad-message' })
    const now = this.now()
    let party = typeof resume === 'string' ? [...this.parties.values()].find((p) => p.hostResume === resume && p.game === client.game) : null
    if (party) {
      if (party.host === client) return this.#sendParty(client)
      this.#leave(client)
      this.#leaveParty(client)
      const old = party.host
      if (old) {
        old.party = null
        old.socket.close(CLOSE.replaced, 'replaced by a newer connection')
      }
      party.host = client
      party.hostAway = null
      party.active = now
      client.party = party
      this.#makeHost(client)
      this.#sendParty(client)
      return this.#toSeats(party, { t: 'host-back' })
    }
    this.#leave(client)
    this.#leaveParty(client)
    let mine = 0
    for (const p of this.parties.values()) if (p.game === client.game) mine++
    if (mine >= this.limits.roomsPerGame) return this.#send(client, { t: 'error', code: 'busy' })
    const n = Math.floor(Number(max))
    party = {
      code: this.#code(this.parties),
      game: client.game,
      host: client,
      hostResume: crypto.randomUUID(),
      hostAway: null,
      seats: new Map(),
      max: Number.isFinite(n) ? Math.max(1, Math.min(this.limits.maxPartyPlayers, n)) : this.limits.maxPartyPlayers,
      locked: false,
      created: now,
      active: now
    }
    this.parties.set(party.code, party)
    client.party = party
    this.#makeHost(client)
    this.#sendParty(client)
  }

  #makeHost(client) {
    client.factor = this.limits.partyHostFactor
    client.bytes = this.limits.burstBytes * client.factor
    client.messages = this.limits.messagesPerSecond * client.factor
  }

  #sendParty(client) {
    const p = client.party
    const players = [...p.seats.values()].map((s) => ({ id: s.id, name: s.name, color: s.color, away: !s.client }))
    this.#send(client, { t: 'party', room: p.code, you: client.id, resume: p.hostResume, max: p.max, join: this.joinUrl(p.code), players })
  }

  #joinParty(client, { room, name, color, resume }) {
    if (!client.phone) return this.#send(client, { t: 'error', code: 'bad-message' })
    const party = this.parties.get(String(room ?? '').toUpperCase())
    if (!party) return this.#send(client, { t: 'error', code: 'not-found' })
    const seat = typeof resume === 'string' ? [...party.seats.values()].find((s) => s.resume === resume) : null
    if (seat) {
      if (seat.client === client) return this.#send(client, { t: 'party-joined', room: party.code, you: seat.id, resume: seat.resume })
      this.#leaveParty(client)
      const old = seat.client
      if (old) {
        old.party = old.seat = null
        old.socket.close(CLOSE.replaced, 'replaced by a newer connection')
      }
      seat.client = client
      seat.away = null
      client.party = party
      client.seat = seat
      party.active = this.now()
      this.#send(client, { t: 'party-joined', room: party.code, you: seat.id, resume: seat.resume })
      if (party.host) this.#send(party.host, { t: 'peer-back', id: seat.id })
      if (!party.host) this.#send(client, { t: 'host-away' })
      return
    }
    if (party.locked) return this.#send(client, { t: 'error', code: 'locked' })
    if (party.seats.size >= party.max) return this.#send(client, { t: 'error', code: 'full' })
    this.#leaveParty(client)
    const fresh = {
      id: client.id,
      name: String(name ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 20) || 'Player',
      color: /^#[0-9a-f]{6}$/i.test(color ?? '') ? color : null,
      resume: crypto.randomUUID(),
      client,
      away: null
    }
    party.seats.set(fresh.id, fresh)
    party.active = this.now()
    client.party = party
    client.seat = fresh
    this.#send(client, { t: 'party-joined', room: party.code, you: fresh.id, resume: fresh.resume })
    if (party.host) this.#send(party.host, { t: 'peer-join', id: fresh.id, name: fresh.name, color: fresh.color })
    else this.#send(client, { t: 'host-away' })
  }

  /** Leave on purpose: a host ends the party, a phone gives up its seat. */
  #leaveParty(client) {
    const party = client.party
    if (!party) return
    if (party.host === client) return this.#closeParty(party, 'host-left')
    if (client.seat) this.#removeSeat(party, client.seat)
  }

  #removeSeat(party, seat) {
    party.seats.delete(seat.id)
    if (seat.client) seat.client.party = seat.client.seat = null
    if (party.host) this.#send(party.host, { t: 'peer-leave', id: seat.id })
  }

  #closeParty(party, reason) {
    this.parties.delete(party.code)
    if (party.host) {
      party.host.party = null
      party.host.factor = 1
      this.#send(party.host, { t: 'closed', reason })
    }
    for (const seat of party.seats.values()) {
      if (!seat.client) continue
      seat.client.party = seat.client.seat = null
      this.#send(seat.client, { t: 'closed', reason })
    }
  }

  #toSeats(party, msg) {
    const out = JSON.stringify(msg)
    for (const seat of party.seats.values()) if (seat.client) this.#sendRaw(seat.client, out)
  }

  #recipients(client, to) {
    const party = client.party
    if (party) {
      if (client.seat) return party.host ? [party.host] : []
      if (to === undefined || to === null) return [...party.seats.values()].filter((s) => s.client).map((s) => s.client)
      const seat = party.seats.get(to)
      return seat?.client ? [seat.client] : []
    }
    const room = client.room
    if (!room) return []
    if (to === undefined || to === null) return room.players.filter((p) => p !== client && p.away === null)
    const target = room.players.find((p) => p.id === to)
    return target && target !== client && target.away === null ? [target] : []
  }

  #broadcast(room, msg) {
    const out = JSON.stringify(msg)
    for (const p of room.players) this.#sendRaw(p, out)
  }

  #send(client, msg) {
    this.#sendRaw(client, JSON.stringify(msg))
  }

  #sendRaw(client, text) {
    if (client.away !== null) return // a dropped player: nothing to send to until it rejoins
    this.onTraffic(Buffer.byteLength(text))
    client.socket.send(text)
  }
}
