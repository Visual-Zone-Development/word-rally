// Word Rally: the word rules, with no drawing and no browser APIs, so they run in tests too.
// A dictionary is built once from the bundled word list; puzzles come from a seeded random
// number generator so the host can make one and every player can check words against it.

/** Everyday five-letter words: Lockword only ever hides one of these (any dictionary word can be guessed). */
export const ANSWERS = `about above actor adult after again agent agree ahead alarm album alert alike alive allow alone along alter among angel anger angle angry apart apple apply arena argue arise armor arrow aside asset audio avoid awake award aware awful bacon badge baker basic basin beach beard beast began begin being below bench berry birth black blade blame blank blast blaze bleak blend bless blind block bloom board boast bonus boost booth bound brain brake brand brave bread break brick bride brief bring broad broke brown brush build bunch burst cabin cable camel candy carry catch cause chain chair chalk champ chant charm chart chase cheap check cheek cheer chess chest chief child chill choir chord chose civic claim clash class clean clear clerk click cliff climb clock close cloth cloud coach coast color comet comic coral couch could count court cover crack craft crane crash crazy cream crest crime crisp cross crowd crown crumb crush curve cycle daily dairy dance dealt death debut decay delay dense depth diary dirty ditch dozen draft drain drama dream dress drift drill drink drive drown eager eagle early earth eight elbow elder elect empty enemy enjoy enter entry equal error event every exact exist extra fable faint fairy faith false fancy favor feast fence fever fiber field fifth fifty fight final first flame flash fleet flesh float flood floor flour fluid flute focus force forge forth forty found frame fresh front frost fruit funny ghost giant given glass globe glory glove grace grade grain grand grant grape graph grasp grass great green greet grief grill grind groom group grove guard guess guest guide habit happy harsh haste haunt heart heavy hedge hello honey honor horse hotel house human humor hurry ideal image imply index inner input irony ivory jelly jewel joint judge juice knife knock known label labor large laser later laugh layer learn least leave legal lemon level light limit linen liver local lodge logic loose lucky lunch magic major maker maple march marry match maybe mayor medal mercy metal meter might minor mixed model money month moral motor mount mouse mouth movie music naive nerve never night noble noise north novel nurse ocean offer often olive onion opera orbit order organ other ought outer owner paint panel panic paper party pasta patch pause peace peach pearl pedal phone photo piano piece pilot pitch pizza place plain plane plant plate point polar pound power press price pride prime print prize proof proud pulse punch pupil queen quest quick quiet quilt quite quote radio raise ranch range rapid ratio reach ready realm rebel refer relax reply rider ridge right rival river roast robin robot rocky rough round route royal rugby ruler rural salad sauce scale scare scarf scene scent scope score scout sense serve seven shade shake shall shame shape share sharp sheep sheet shelf shell shift shine shirt shock shoot shore short shout sight silly since skate skill slate sleep slice slide slope small smart smile smoke snake solar solid solve sorry sound south space spare spark speak speed spell spend spice spike spine spoke spoon sport spray squad stack staff stage stain stair stake stamp stand stare start state steak steal steam steel steep stick still stock stone stood store storm story stove strap straw study stuff style sugar sunny super swamp swear sweet swift swing sword table taste teach thank their theme there thick thief thing think third those three threw throw thumb tiger tight timer tired title toast today token tooth topic torch total touch tough towel tower track trade trail train treat trend trial tribe trick truck truly trunk trust truth twice twist uncle under union unite unity until upper upset urban usual valid value vapor vault video visit vital vivid vocal voice voter wagon waste watch water weary weigh weird whale wheat wheel where which while white whole whose width woman world worry worth would wound wrist write wrong yacht young youth zebra`.split(' ')

/** Everyday seven-letter words with seven different letters: each seeds one Petal flower. */
export const PANGRAMS = `granite capture kitchen journey blanket monster diamond captain harvest picture brother country husband morning teacher project problem machine fortune weather thunder painter dolphin compare complex plastic history charity holiday courage factory chapter display reading healthy stadium mystery nuclear payment trouble student pioneer blister cabinet chamber climate comfort density drawing farming fiction flaming gesture hamster imagine justice kingdom lantern magnify natural obscure outside pasture planted pointed quarter roasted sandbox section silence special storage tangled trample unicorn vintage warship younger frantic brought candles dustpan example fishing gliders husking keyword lobster mixture network orchids plumber quickly rainbow shelter thimble upgrade volcano wrinkle bracket clothes dancing earplug flowery grumble hopeful jackpot kneecap lodging mistake notable orbital parties routine shampoo tourism upright victory waiters backlog cashier dormant faculty goblins hydrant insult joyride lectern modesty neutral pyramid readily scholar tablets unlatch whisker`.split(' ').filter((w) => w.length === 7 && new Set(w).size === 7)

/** Letters for a Tangle grid, weighted like everyday English (no Q: it needs a U next to it). */
const GRID_LETTERS = 'eeeeeeeeeeeeaaaaaaaaaiiiiiiiioooooooouuuunnnnnnrrrrrrttttttttllllssssssddddggghhhbbccmmppffwwyykvxjz'
const VOWELS = new Set('aeiou')

/** Seconds on the clock and other numbers each game is built from. */
export const RULES = {
  tangle: { name: 'Tangle', seconds: 120, parts: 1, min: 3 },
  lockword: { name: 'Lockword', seconds: 180, parts: 1, guesses: 6, solve: 20, spare: 5, miss: 10 },
  petal: { name: 'Petal', seconds: 120, parts: 1, min: 4, pangramBonus: 10 }
}
export const GAMES = ['tangle', 'lockword', 'petal']

/** Longer words are worth steeply more: finding one long word beats several short ones. */
const LENGTH_POINTS = [0, 0, 0, 1, 2, 4, 7, 11, 16]
export const tanglePoints = (word) => LENGTH_POINTS[Math.min(word.length, 8)]
export function petalPoints(word, letters) {
  if (word.length < 4) return 0
  const base = LENGTH_POINTS[Math.min(word.length, 8)]
  return base + (isPangram(word, letters) ? RULES.petal.pangramBonus : 0)
}
export const isPangram = (word, letters) => [...letters].every((l) => word.includes(l))
/** Lockword: a solved word is worth 20, plus 5 for each guess left over. A missed or skipped word costs RULES.lockword.miss. */
export function lockwordPoints(guessesUsed) {
  const r = RULES.lockword
  return r.solve + r.spare * Math.max(0, r.guesses - guessesUsed)
}

/** A small seeded generator (mulberry32): the same seed always gives the same puzzle. */
export function seeded(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = (rand, list) => list[Math.floor(rand() * list.length)]
function shuffled(rand, list) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Build the dictionary from the bundled list (one lowercase word per line). */
export function makeDict(text) {
  const list = text.split(/\s+/).filter(Boolean)
  const set = new Set(list)
  return {
    list,
    has: (word) => set.has(word),
    /** Words a Tangle grid could hold (3 to 8 letters keeps the search quick). */
    tangleWords: list.filter((w) => w.length >= 3 && w.length <= 8 && !w.includes('q')),
    answers: ANSWERS.filter((w) => set.has(w)),
    pangrams: PANGRAMS.filter((w) => set.has(w))
  }
}

// ---- Tangle: a 4×4 grid; words run through touching tiles (diagonals too), each tile once.

const NEIGHBOURS = Array.from({ length: 16 }, (_, i) => {
  const r = Math.floor(i / 4)
  const c = i % 4
  const out = []
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr
      const cc = c + dc
      if ((dr || dc) && rr >= 0 && rr < 4 && cc >= 0 && cc < 4) out.push(rr * 4 + cc)
    }
  return out
})
export const touching = (a, b) => NEIGHBOURS[a].includes(b)

/** The tiles that spell `word` on `grid` (16 letters, row by row), or null when it can't be traced. */
export function tanglePath(grid, word) {
  const path = []
  const used = new Array(16).fill(false)
  const walk = (at, n) => {
    if (grid[at] !== word[n] || used[at]) return false
    used[at] = true
    path.push(at)
    if (n === word.length - 1) return true
    for (const next of NEIGHBOURS[at]) if (walk(next, n + 1)) return true
    used[at] = false
    path.pop()
    return false
  }
  for (let i = 0; i < 16; i++) if (walk(i, 0)) return path
  return null
}

/** Every dictionary word a grid holds. */
export function solveTangle(dict, grid) {
  const have = {}
  for (const l of grid) have[l] = (have[l] ?? 0) + 1
  const out = []
  next: for (const word of dict.tangleWords) {
    const need = {}
    for (const l of word) {
      need[l] = (need[l] ?? 0) + 1
      if (need[l] > (have[l] ?? 0)) continue next
    }
    if (tanglePath(grid, word)) out.push(word)
  }
  return out
}

/** A grid with plenty to find: the best of a few random ones. */
export function makeTangle(dict, rand, tries = 4) {
  let best = null
  for (let t = 0; t < tries; t++) {
    let grid = ''
    let vowels = 0
    for (let i = 0; i < 16; i++) {
      let l = pick(rand, GRID_LETTERS)
      // Between five and seven vowels keeps a grid from being all consonants or all mush.
      if (VOWELS.has(l) ? vowels >= 7 : i - vowels >= 11) l = VOWELS.has(l) ? pick(rand, 'nrstl') : pick(rand, 'aeio')
      if (VOWELS.has(l)) vowels++
      grid += l
    }
    const words = solveTangle(dict, grid)
    if (!best || words.length > best.words.length) best = { grid, words }
    if (words.length >= 90) break
  }
  return best
}

// ---- Petal: seven letters, the first is the middle one and every word must use it.

export function petalValid(letters, word) {
  if (word.length < RULES.petal.min || !word.includes(letters[0])) return false
  for (const l of word) if (!letters.includes(l)) return false
  return true
}
export const solvePetal = (dict, letters) => dict.list.filter((w) => petalValid(letters, w))

/** Seven letters from an everyday word, with the middle letter chosen so there is plenty to find but not everything. */
export function makePetal(dict, rand) {
  let best = null
  for (let t = 0; t < 6; t++) {
    const seed = pick(rand, dict.pangrams)
    for (const centre of shuffled(rand, [...seed])) {
      const letters = centre + shuffled(rand, [...seed].filter((l) => l !== centre)).join('')
      const words = solvePetal(dict, letters)
      const fit = words.length >= 30 && words.length <= 140
      if (!best || (fit && !best.fit) || (fit === best.fit && Math.abs(words.length - 70) < Math.abs(best.words.length - 70))) best = { letters, words, fit }
      if (fit) return { letters, words }
    }
  }
  return { letters: best.letters, words: best.words }
}

// ---- Lockword: guess the hidden five-letter word; each guess comes back as a pattern.

/** One letter per position: b = right spot, o = in the word but elsewhere, x = not in the word. */
export function lockFeedback(answer, guess) {
  const out = Array(5).fill('x')
  const left = {}
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) out[i] = 'b'
    else left[answer[i]] = (left[answer[i]] ?? 0) + 1
  }
  for (let i = 0; i < 5; i++) {
    if (out[i] === 'b') continue
    if (left[guess[i]] > 0) {
      out[i] = 'o'
      left[guess[i]]--
    }
  }
  return out.join('')
}
export const pickAnswer = (dict, rand, not = []) => {
  for (let i = 0; i < 20; i++) {
    const w = pick(rand, dict.answers)
    if (!not.includes(w)) return w
  }
  return pick(rand, dict.answers)
}

// ---- Scoring a finished round.

/**
 * Tangle and Petal: every player's valid words → points. With two or more players a word only one
 * of them found scores double. Returns { [id]: { score, words: [{ w, pts, solo }] } }.
 */
export function scoreWords(game, puzzle, wordsById) {
  const ids = Object.keys(wordsById)
  const count = {}
  for (const id of ids) for (const w of new Set(wordsById[id])) count[w] = (count[w] ?? 0) + 1
  const out = {}
  for (const id of ids) {
    let score = 0
    const words = [...new Set(wordsById[id])].map((w) => {
      const base = game === 'tangle' ? tanglePoints(w) : petalPoints(w, puzzle)
      const solo = ids.length > 1 && count[w] === 1
      const pts = base * (solo ? 2 : 1)
      score += pts
      return { w, pts, solo }
    })
    words.sort((a, b) => b.pts - a.pts || a.w.localeCompare(b.w))
    out[id] = { score, words }
  }
  return out
}

/** Is `word` allowed in this puzzle? (The dictionary check is separate, so callers can say why not.) */
export function fitsPuzzle(game, puzzle, word) {
  if (game === 'tangle') return word.length >= RULES.tangle.min && tanglePath(puzzle, word) !== null
  if (game === 'petal') return petalValid(puzzle, word)
  return word.length === 5
}

/** Rally points for one finished game: the winner gets 100 and everyone else their share of it. */
export function rallyPoints(scoreById) {
  const top = Math.max(0, ...Object.values(scoreById))
  const out = {}
  for (const [id, s] of Object.entries(scoreById)) out[id] = top > 0 ? Math.max(0, Math.round((100 * s) / top)) : 0
  return out
}
