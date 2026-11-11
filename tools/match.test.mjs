// Run with: node --test games/word-rally/tools/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createMatch, TIMING } from '../match.js'
import { RULES, makeDict, seeded, solveTangle, solvePetal } from '../words.js'

const dict = makeDict(readFileSync(new URL('../assets/words.txt', import.meta.url), 'utf8'))

/** A stand-in for net.js on the host: two players, no network. */
function session(ids = ['a', 'b']) {
  return { state: {}, inputs: Object.fromEntries(ids.map((id) => [id, {}])), players: [...ids], away: [], started: true }
}
const run = (match, sess, seconds, dt = 0.25) => {
  for (let t = 0; t < seconds; t += dt) match.step(sess, dt)
}
const toRound = (match, sess) => run(match, sess, TIMING.count + 0.5)

test('a match waits in the lobby, then lets the host pick a game', () => {
  const sess = session()
  sess.started = false
  const match = createMatch({ dict, rand: seeded(1) })
  match.step(sess, 0.1)
  assert.equal(sess.state.ph, 'lobby')
  sess.started = true
  match.step(sess, 0.1)
  assert.equal(sess.state.ph, 'pick')
  match.choose(sess, 'tangle')
  assert.equal(sess.state.ph, 'count')
  assert.equal(sess.state.pz.length, 16)
  toRound(match, sess)
  assert.equal(sess.state.ph, 'round')
  assert.equal(sess.state.t, RULES.tangle.seconds)
})

test('Tangle counts valid words live, ignores invalid ones, and doubles a word only one player found', () => {
  const sess = session()
  const match = createMatch({ dict, rand: seeded(3) })
  match.step(sess, 0.1)
  match.choose(sess, 'tangle')
  toRound(match, sess)
  const st = sess.state
  const all = solveTangle(dict, st.pz).sort((x, y) => y.length - x.length)
  const [shared, onlyA] = [all[0], all[1]]
  sess.inputs.a = { nm: 2, k: st.k, w: `${shared},${onlyA},zzzz,${shared}` }
  sess.inputs.b = { nm: 5, k: st.k, w: shared }
  match.step(sess, 0.1)
  assert.equal(st.p.a.w, 2, 'the made-up word and the repeat are not counted')
  assert.equal(st.p.a.nm, 2)
  const live = st.p.a.s
  run(match, sess, RULES.tangle.seconds + 1)
  assert.equal(st.ph, 'results')
  assert.equal(st.final, 1)
  assert.ok(st.p.a.s > live, 'the word only A found is doubled at the end')
  assert.deepEqual(new Set(st.p.a.rw.split(',')), new Set([shared, onlyA]))
  assert.equal(st.p.a.tot, 100, 'the game winner takes 100 match points')
  assert.ok(st.p.b.tot < 100 && st.p.b.tot > 0)
  assert.equal(st.t, 0, 'final results wait for the host')
  match.next(sess)
  assert.equal(st.ph, 'pick')
})

test('an input tagged with an old round is ignored', () => {
  const sess = session()
  const match = createMatch({ dict, rand: seeded(4) })
  match.step(sess, 0.1)
  match.choose(sess, 'petal')
  toRound(match, sess)
  const st = sess.state
  const word = solvePetal(dict, st.pz)[0]
  sess.inputs.a = { k: st.k - 1, w: word }
  match.step(sess, 0.1)
  assert.equal(st.p.a.w, 0)
  sess.inputs.a = { k: st.k, w: word }
  match.step(sess, 0.1)
  assert.equal(st.p.a.w, 1)
})

/** The test session's stand-in for net.privateView(id). */
function withPrivate(sess) {
  sess.priv = {}
  sess.mine = (id) => (sess.priv[id] ??= {})
  return sess
}

test('Lockword gives everyone the same words in the same order, each at their own pace', () => {
  const sess = withPrivate(session())
  const match = createMatch({ dict, rand: seeded(5) })
  match.step(sess, 0.1)
  match.choose(sess, 'lockword')
  toRound(match, sess)
  const st = sess.state
  assert.equal(st.t, RULES.lockword.seconds)
  const [first, second] = [match.peek(0).answer, match.peek(1).answer]
  assert.notEqual(first, second)
  const wrong = dict.answers.find((w) => w !== first && w !== second)
  sess.inputs.a = { k: st.k, g: `${wrong},${first},${second}` }
  sess.inputs.b = { k: st.k, g: wrong }
  match.step(sess, 0.1)
  assert.equal(st.p.a.w, 2, 'A solved the first two words')
  assert.equal(st.p.a.wi, 2)
  assert.equal(st.p.a.s, (20 + 5 * 4) + (20 + 5 * 5), 'solved in 2 guesses, then in 1')
  assert.equal(st.p.a.pat, '', 'a fresh board for the third word')
  assert.equal(st.p.b.wi, 0, 'B is still on the first word')
  assert.equal(st.p.b.pat.length, 5)
  sess.inputs.b = { k: st.k, g: `${wrong},${first}` }
  match.step(sess, 0.1)
  assert.equal(st.p.b.wi, 1, 'B met the same first word')
  assert.equal(st.ph, 'round', 'the round runs to the clock, whoever is done')
})

test('a Lockword word that is skipped or runs out of guesses costs 10 and moves the player on', () => {
  const sess = withPrivate(session())
  const match = createMatch({ dict, rand: seeded(11) })
  match.step(sess, 0.1)
  match.choose(sess, 'lockword')
  toRound(match, sess)
  const st = sess.state
  const [first, second, third] = [0, 1, 2].map((i) => match.peek(i).answer)
  const wrong = dict.answers.find((w) => ![first, second, third].includes(w))
  sess.inputs.a = { k: st.k, g: `-,${Array(6).fill(wrong).join(',')},${third}` }
  match.step(sess, 0.1)
  assert.equal(st.p.a.x, 2, 'one skipped, one out of guesses')
  assert.equal(st.p.a.w, 1)
  assert.equal(st.p.a.s, -10 - 10 + 45)
  assert.equal(sess.priv.a.h, `${first}:0,${second}:0,${third}:1`, 'only that player is told the words they finished')
  sess.inputs.b = { k: st.k, g: '-' }
  match.step(sess, 0.1)
  assert.equal(st.p.b.s, -10)
})

test('Lockword keeps every answer out of the shared state until the round ends', () => {
  const sess = withPrivate(session())
  const match = createMatch({ dict, rand: seeded(12) })
  match.step(sess, 0.1)
  match.choose(sess, 'lockword')
  toRound(match, sess)
  const st = sess.state
  const first = match.peek(0).answer
  sess.inputs.a = { k: st.k, g: first }
  match.step(sess, 0.1)
  for (const word of match.peek().answers) assert.ok(!JSON.stringify(st).includes(word), `${word} leaked`)
  run(match, sess, RULES.lockword.seconds + 1)
  assert.equal(st.ph, 'results')
  assert.equal(st.final, 1)
  assert.ok(st.ans.split(',').includes(first))
  assert.equal(st.p.a.rw, `${first}:1`)
  assert.equal(st.p.a.tot, 100)
  assert.equal(st.p.b.tot, 0)
})

test('a Rally plays all three games back to back and adds up match points', () => {
  const sess = session()
  const match = createMatch({ dict, rand: seeded(6) })
  match.step(sess, 0.1)
  match.choose(sess, 'rally')
  const played = []
  for (let guard = 0; guard < 4000 && played.length < 3; guard++) {
    match.step(sess, 0.5)
    const st = sess.state
    if (st.ph === 'results' && st.final && played.at(-1) !== st.n) {
      played.push(st.n)
      if (played.length < 3) assert.ok(st.t > 0, 'the next game starts by itself')
    }
  }
  assert.equal(played.length, 3)
  assert.equal(sess.state.rally, 0)
  match.next(sess)
  assert.equal(sess.state.ph, 'pick')
})

test('playing alone, the total is the points scored', () => {
  const sess = session(['you'])
  const match = createMatch({ dict, rand: seeded(8), solo: true })
  match.step(sess, 0.1)
  match.choose(sess, 'tangle')
  toRound(match, sess)
  const st = sess.state
  const word = solveTangle(dict, st.pz).find((w) => w.length === 4)
  sess.inputs.you = { k: st.k, w: word }
  run(match, sess, RULES.tangle.seconds + 1)
  assert.equal(st.p.you.s, 2, 'no doubling when alone')
  assert.equal(st.p.you.tot, 2)
})

test('a player who leaves is dropped from the scores', () => {
  const sess = session()
  const match = createMatch({ dict, rand: seeded(9) })
  match.step(sess, 0.1)
  sess.players = ['a']
  match.step(sess, 0.1)
  assert.deepEqual(Object.keys(sess.state.p), ['a'])
})
