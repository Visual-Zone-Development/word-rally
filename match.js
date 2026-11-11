// Word Rally: the rules of a match, run by the host (or by the one player when playing alone).
// No drawing and no browser APIs: it reads players' inputs and writes the shared state, so it
// runs the same over net.js, in solo play and in tests.
//
//   const match = createMatch({ dict, solo: false })
//   each frame on the host:  match.step(session, dt)
//   session = { state, inputs, players, away, started }   (net.js has exactly these)
//
// Shared state (everything players may see):
//   ph     'lobby' | 'pick' | 'count' | 'round' | 'results'
//   g      the game being played; part / parts: every game is one round today
//   k      round key: goes up by one for every round, players tag their input with it
//   t      whole seconds left in this phase (0 in results = the host decides when to go on)
//   pz     the puzzle: Tangle's 16 letters or Petal's 7 (middle one first); Lockword keeps its
//          answers on the host until the round ends, then lists the ones reached in `ans`
//   p[id]  { nm, s, w, x, wi, gs, tot, gain, pat, rw }: name, round score, words found, Lockword
//          words missed and the word that player is on, score in this game, match total, points
//          just gained, Lockword colour patterns for the current word, and (after the round) the
//          words that player found
//
// Lockword is a race through one list of hidden words, the same list in the same order for
// everyone, each player at their own pace. A player's finished words go only to that player
// (session.mine(id).h = 'plant:3,stone:0': solved in 3, missed), never into the shared state.
//
// Players send { nm, k, w: 'word,word' } (Tangle, Petal) or { nm, k, g: 'guess,guess,-' } (Lockword:
// every guess in order, '-' for a word skipped).
// The lists only grow, so a dropped or repeated update can never lose or double-count a word.

import { GAMES, RULES, fitsPuzzle, lockFeedback, lockwordPoints, makePetal, makeTangle, petalPoints, pickAnswer, rallyPoints, scoreWords, tanglePoints } from './words.js'

export const TIMING = { count: 3, betweenParts: 6, betweenRally: 12, maxWords: 150 }

export function createMatch({ dict, rand = Math.random, solo = false }) {
  let timer = 0
  let answers = [] // Lockword: the hidden words, in the order every player meets them
  let queue = [] // Rally: the games still to play
  let auto = false // results move on by themselves
  const seen = {} // id → { raw, list }: the last input checked, so words are validated once

  const players = (sess) => Object.keys(sess.state.p ?? {})
  const split = (text) => (typeof text === 'string' && text ? text.split(',') : [])

  function syncPlayers(sess) {
    const st = sess.state
    st.p ??= {}
    for (const id of sess.players) {
      const p = (st.p[id] ??= { nm: 0, s: 0, w: 0, x: 0, wi: 0, gs: 0, tot: 0, gain: 0, pat: '', rw: '' })
      const nm = sess.inputs[id]?.nm
      if (Number.isInteger(nm) && nm >= 0 && nm < 64) p.nm = nm
    }
    for (const id of Object.keys(st.p)) if (!sess.players.includes(id)) delete st.p[id]
  }

  function begin(sess, game) {
    const st = sess.state
    st.g = game
    st.n = (st.n ?? 0) + 1
    st.part = 0
    st.parts = RULES[game].parts
    for (const id of players(sess)) st.p[id].gs = 0
    startPart(sess)
  }

  function startPart(sess) {
    const st = sess.state
    const game = st.g
    st.k = (st.k ?? 0) + 1
    st.ans = ''
    st.final = 0
    if (game === 'tangle') st.pz = makeTangle(dict, rand).grid
    else if (game === 'petal') st.pz = makePetal(dict, rand).letters
    else {
      answers = []
      st.pz = ''
    }
    for (const id of players(sess)) {
      Object.assign(st.p[id], { s: 0, w: 0, x: 0, wi: 0, gain: 0, pat: '', rw: '' })
      const mine = sess.mine?.(id)
      if (mine) mine.h = ''
    }
    for (const id of Object.keys(seen)) delete seen[id]
    st.ph = 'count'
    timer = TIMING.count
    st.t = Math.ceil(timer)
  }

  /** Words games: validate what a player has sent so far and keep the live score. */
  function readWords(sess, id) {
    const st = sess.state
    const inp = sess.inputs[id]
    if (!inp || inp.k !== st.k) return
    const raw = typeof inp.w === 'string' ? inp.w : ''
    const cache = (seen[id] ??= { raw: null, list: [] })
    if (cache.raw === raw) return
    cache.raw = raw
    const list = []
    for (const w of split(raw).slice(0, TIMING.maxWords)) {
      if (!/^[a-z]{3,16}$/.test(w) || list.includes(w)) continue
      if (fitsPuzzle(st.g, st.pz, w) && dict.has(w)) list.push(w)
    }
    cache.list = list
    const p = st.p[id]
    p.w = list.length
    p.s = list.reduce((sum, w) => sum + (st.g === 'tangle' ? tanglePoints(w) : petalPoints(w, st.pz)), 0)
  }

  /** Lockword: the i-th hidden word, the same for every player. */
  function answerAt(i) {
    while (answers.length <= i) answers.push(pickAnswer(dict, rand, answers))
    return answers[i]
  }

  /**
   * Lockword: replay everything a player has guessed. A right guess scores and moves them to the
   * next word; six wrong guesses, or a skip, costs points and moves them on too.
   */
  function readGuesses(sess, id) {
    const st = sess.state
    const inp = sess.inputs[id]
    const p = st.p[id]
    if (!inp || inp.k !== st.k) return
    const raw = typeof inp.g === 'string' ? inp.g : ''
    const cache = (seen[id] ??= { raw: null, list: [] })
    if (cache.raw === raw) return
    cache.raw = raw
    const rules = RULES.lockword
    let wi = 0
    let cur = []
    let score = 0
    let solved = 0
    let missed = 0
    const hist = []
    const finish = (ok) => {
      hist.push(`${answerAt(wi)}:${ok ? cur.length : 0}`)
      if (ok) {
        score += lockwordPoints(cur.length)
        solved++
      } else {
        score -= rules.miss
        missed++
      }
      wi++
      cur = []
    }
    for (const token of split(raw).slice(0, 600)) {
      if (token === '-') {
        finish(false)
        continue
      }
      if (!/^[a-z]{5}$/.test(token) || !dict.has(token)) continue
      cur.push(token)
      if (token === answerAt(wi)) finish(true)
      else if (cur.length >= rules.guesses) finish(false)
    }
    cache.list = hist
    Object.assign(p, { s: score, w: solved, x: missed, wi, pat: cur.map((w) => lockFeedback(answerAt(wi), w)).join(',') })
    const mine = sess.mine?.(id)
    if (mine) mine.h = hist.join(',')
  }

  function finishPart(sess) {
    const st = sess.state
    const ids = players(sess)
    if (st.g === 'lockword') {
      // Now everyone may see the words that were reached, and how each player did on them.
      st.ans = answers.slice(0, Math.max(0, ...ids.map((id) => st.p[id].wi)) + 1).join(',')
      for (const id of ids) st.p[id].rw = (seen[id]?.list ?? []).join(',')
    } else {
      const scored = scoreWords(st.g, st.pz, Object.fromEntries(ids.map((id) => [id, seen[id]?.list ?? []])))
      for (const id of ids) {
        st.p[id].s = scored[id].score
        st.p[id].rw = scored[id].words.map((x) => x.w).join(',')
      }
    }
    for (const id of ids) st.p[id].gs += st.p[id].s
    st.part++
    st.final = st.part >= st.parts ? 1 : 0
    if (st.final) {
      // Alone, the total is simply every point scored; together, the winner of a game takes 100.
      const gains = solo ? Object.fromEntries(ids.map((id) => [id, st.p[id].gs])) : rallyPoints(Object.fromEntries(ids.map((id) => [id, st.p[id].gs])))
      for (const id of ids) {
        st.p[id].gain = gains[id]
        st.p[id].tot += gains[id]
      }
    }
    st.rally = queue.length
    auto = !st.final || queue.length > 0
    timer = !st.final ? TIMING.betweenParts : queue.length > 0 ? TIMING.betweenRally : 0
    st.ph = 'results'
    st.t = Math.ceil(timer)
  }

  const match = {
    /** The host picked what to play next: one game, or 'rally' for all three in a random order. */
    choose(sess, what) {
      if (what === 'rally') {
        queue = [...GAMES]
        for (let i = queue.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1))
          ;[queue[i], queue[j]] = [queue[j], queue[i]]
        }
      } else queue = [what]
      syncPlayers(sess)
      for (const id of players(sess)) sess.state.p[id].tot = solo ? 0 : sess.state.p[id].tot
      begin(sess, queue.shift())
      sess.state.rally = queue.length
    },

    /** From the final results: back to choosing a game (or straight on, when results are waiting on a timer). */
    next(sess) {
      const st = sess.state
      if (st.ph !== 'results') return
      if (!st.final) startPart(sess)
      else if (queue.length) {
        begin(sess, queue.shift())
        st.rally = queue.length
      } else st.ph = 'pick'
    },

    /** Start the standings again from zero (the host's "New match"). */
    resetTotals(sess) {
      for (const id of players(sess)) sess.state.p[id].tot = 0
    },

    step(sess, dt) {
      const st = sess.state
      syncPlayers(sess)
      st.ph ??= 'lobby'
      if (st.ph === 'lobby') {
        if (sess.started) st.ph = 'pick'
        return
      }
      if (st.ph === 'pick') return
      if (st.ph === 'count') {
        timer -= dt
        st.t = Math.max(1, Math.ceil(timer))
        if (timer <= 0) {
          st.ph = 'round'
          timer = RULES[st.g].seconds
          st.t = Math.ceil(timer)
        }
        return
      }
      if (st.ph === 'round') {
        timer -= dt
        st.t = Math.max(0, Math.ceil(timer))
        const ids = players(sess)
        for (const id of ids) (st.g === 'lockword' ? readGuesses : readWords)(sess, id)
        if (timer <= 0) finishPart(sess)
        return
      }
      if (st.ph === 'results' && auto) {
        timer -= dt
        st.t = Math.max(1, Math.ceil(timer))
        if (timer <= 0) match.next(sess)
      }
    },

    /** For tests and the ?debug overlay only: what the host is hiding. */
    peek: (i = 0) => ({ answer: answerAt(i), answers: [...answers], queue: [...queue], timer })
  }
  return match
}
