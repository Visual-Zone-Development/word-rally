// Lint dialogue scripts (dialogue skill): parse errors, jumps to missing nodes, nodes nothing reaches, lines
// too long for a handheld box, long stretches without player input, too many or too long choices,
// variables read but never set, and speaker names that differ only in case or spacing.
//
//   node .claude/skills/dialogue/lint.mjs dialogue/*.js [--max-chars 140] [--max-run 4] [--entry intro,smith]
//
// Files are modules whose default export is the script text (export default `…`), or plain .dlg text files.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse } from './toolkit/dialogue-script.js'

const args = process.argv.slice(2)
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : def }
const maxChars = Number(opt('--max-chars', 140))
const maxRun = Number(opt('--max-run', 4))
const entries = (opt('--entry', '') || '').split(',').filter(Boolean)
if (!args.length) { console.error('usage: node lint.mjs <script files…> [--max-chars 140] [--max-run 4] [--entry a,b]'); process.exit(1) }

const problems = [], notes = []
const all = {}, speakers = new Map(), reads = new Set(), writes = new Set(), jumps = new Set()
const visible = (t) => t.replace(/\{[^}]*\}|\*/g, '').replace(/\$\w+/g, 'XXXXXXXX')

for (const f of args) {
  const src = f.endsWith('.js') || f.endsWith('.mjs') ? (await import(pathToFileURL(path.resolve(f)).href)).default : fs.readFileSync(f, 'utf8')
  if (typeof src !== 'string') { problems.push(`${f}: default export is not a string`); continue }
  const { nodes, errors } = parse(src, { file: f })
  problems.push(...errors)
  for (const [name, n] of Object.entries(nodes)) {
    if (all[name]) problems.push(`${f}:${n.line} node "${name}" also defined in ${all[name].file}`)
    all[name] = { ...n, file: f }
  }
}

const condVars = (c) => (c || '').split(/\s+(?:and|or)\s+/).map((a) => a.replace(/^not\s+/, '').match(/^([\w.]+)/)?.[1]).filter(Boolean)
function walk(body, file, node, run = { n: 0 }) {
  for (const st of body) {
    if (st.t === 'line') {
      run.n++
      const len = visible(st.text).length
      if (len > maxChars) problems.push(`${file}:${st.n} line is ${len} characters (max ${maxChars}: split it, a handheld box shows ~2–3 lines)`)
      if (run.n === maxRun + 1) notes.push(`${file}:${st.n} ${maxRun + 1}+ lines in a row without a choice in "${node}": consider a choice, a bark, or cutting`)
      if (st.who) {
        const key = st.who.toLowerCase().replace(/\s+/g, '')
        if (!speakers.has(key)) speakers.set(key, new Set())
        speakers.get(key).add(st.who)
      }
    } else if (st.t === 'choices') {
      run.n = 0
      if (st.options.length > 4) problems.push(`${file}:${st.n} ${st.options.length} choices (max 4 fit and read well)`)
      for (const o of st.options) {
        if (visible(o.text).length > 42) notes.push(`${file}:${o.n} choice "${o.text}" is long (keep choices under ~40 characters)`)
        condVars(o.cond).forEach((v) => reads.add(v))
        walk(o.body, file, node, { n: 0 })
      }
    } else if (st.t === 'if') {
      for (const b of st.branches) { condVars(b.cond).forEach((v) => reads.add(v)); walk(b.body, file, node, { ...run }) }
    } else if (st.t === 'set') writes.add(st.name)
    else if (st.t === 'goto') {
      if (st.node !== 'end') { jumps.add(st.node); if (!all[st.node]) problems.push(`${file}:${st.n} >> ${st.node}: no such node`) }
    }
  }
}
for (const [name, n] of Object.entries(all)) walk(n.body, n.file, name)

for (const name of Object.keys(all)) if (!jumps.has(name) && !entries.includes(name)) notes.push(`node "${name}" is never jumped to (fine if the game starts it; list it with --entry)`)
for (const v of reads) if (!writes.has(v) && !v.startsWith('__')) notes.push(`variable "${v}" is read but never set by a script (fine if the game sets it)`)
for (const names of speakers.values()) if (names.size > 1) problems.push(`speaker written differently: ${[...names].join(', ')}`)

for (const p of problems) console.log(`✗ ${p}`)
for (const n of notes) console.log(`· ${n}`)
console.log(`${Object.keys(all).length} node(s), ${speakers.size} speaker(s): ${problems.length} problem(s), ${notes.length} note(s)`)
process.exit(problems.length ? 1 : 0)
