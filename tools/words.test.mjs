// Run with: node --test games/word-rally/tools/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ANSWERS, PANGRAMS, fitsPuzzle, isPangram, lockFeedback, lockwordPoints, makeDict, makePetal, makeTangle, petalPoints, petalValid, rallyPoints, scoreWords, seeded, solveTangle, tanglePath, tanglePoints } from '../words.js'

const dict = makeDict(readFileSync(new URL('../assets/words.txt', import.meta.url), 'utf8'))

test('every Lockword answer and Petal seed word is in the dictionary', () => {
  assert.deepEqual(ANSWERS.filter((w) => !dict.has(w) || w.length !== 5), [])
  assert.deepEqual(PANGRAMS.filter((w) => !dict.has(w)), [])
  assert.ok(dict.answers.length > 300)
  assert.ok(dict.pangrams.length > 80)
})

test('a Tangle word must run through touching tiles and use each tile once', () => {
  const grid = 'stoparnelliedmbst'.slice(0, 4) + 'arne' + 'lied' + 'mbst'
  assert.deepEqual(tanglePath(grid, 'stone'), [0, 1, 2, 6, 7])
  assert.equal(tanglePath(grid, 'trained') !== null, true)
  assert.equal(tanglePath(grid, 'note'), null, 'T and E do not touch')
  assert.equal(tanglePath(grid, 'pop'), null, 'one P cannot be used twice')
  assert.equal(fitsPuzzle('tangle', grid, 'st'), false, 'two letters is too short')
})

test('the same seed makes the same Tangle grid, with plenty of words in it', () => {
  const a = makeTangle(dict, seeded(7))
  const b = makeTangle(dict, seeded(7))
  assert.equal(a.grid, b.grid)
  assert.equal(a.grid.length, 16)
  assert.ok(a.words.length >= 40, `only ${a.words.length} words`)
  assert.deepEqual(solveTangle(dict, a.grid), a.words)
  for (const w of a.words.slice(0, 20)) assert.ok(tanglePath(a.grid, w))
})

test('longer Tangle words are worth steeply more', () => {
  assert.deepEqual(['cat', 'cats', 'crate', 'crates', 'created', 'creating'].map(tanglePoints), [1, 2, 4, 7, 11, 16])
})

test('a Petal word needs the middle letter, only the seven letters, and four or more of them', () => {
  const letters = 'agrnite'
  assert.equal(petalValid(letters, 'grain'), true)
  assert.equal(petalValid(letters, 'tiara'), true, 'letters can repeat')
  assert.equal(petalValid(letters, 'tiger'), false, 'no middle letter')
  assert.equal(petalValid(letters, 'tan'), false, 'too short')
  assert.equal(petalValid(letters, 'grains'), false, 'S is not one of the seven')
  assert.equal(isPangram('granite', letters), true)
  assert.equal(petalPoints('granite', letters), 11 + 10)
  assert.equal(petalPoints('grain', letters), 4)
})

test('a Petal flower has seven different letters and a fair number of words', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const p = makePetal(dict, seeded(seed))
    assert.equal(new Set(p.letters).size, 7)
    assert.ok(p.words.length >= 20, `${p.letters}: only ${p.words.length} words`)
    assert.ok(p.words.some((w) => isPangram(w, p.letters)))
  }
})

test('Lockword feedback marks right spot, wrong spot and absent letters, counting repeats once', () => {
  assert.equal(lockFeedback('plant', 'stone'), 'xoxbx')
  assert.equal(lockFeedback('plant', 'giant'), 'xxbbb')
  assert.equal(lockFeedback('plant', 'plant'), 'bbbbb')
  assert.equal(lockFeedback('apple', 'paper'), 'oobox')
  assert.equal(lockFeedback('robot', 'floor'), 'xxobo', 'one O is in the right spot, the other O and the R are elsewhere')
})

test('a solved Lockword word is worth 20, plus 5 for each guess left over', () => {
  assert.equal(lockwordPoints(1), 45)
  assert.equal(lockwordPoints(3), 35)
  assert.equal(lockwordPoints(6), 20)
})

test('with two or more players, a word only one of them found scores double', () => {
  const grid = 'stoparneliedmbst'
  const r = scoreWords('tangle', grid, { a: ['stone', 'rail'], b: ['rail', 'star'] })
  assert.equal(r.a.score, 4 * 2 + 2)
  assert.equal(r.b.score, 2 + 2 * 2)
  assert.equal(r.a.words.find((x) => x.w === 'stone').solo, true)
  assert.equal(scoreWords('tangle', grid, { a: ['stone'] }).a.score, 4, 'solo play has no doubling')
})

test('Rally points give the game winner 100 and the rest their share', () => {
  assert.deepEqual(rallyPoints({ a: 40, b: 20, c: 0 }), { a: 100, b: 50, c: 0 })
  assert.deepEqual(rallyPoints({ a: 0, b: 0 }), { a: 0, b: 0 })
  assert.deepEqual(rallyPoints({ a: 40, b: -10 }), { a: 100, b: 0 }, 'a score below zero earns nothing, not a negative share')
})
