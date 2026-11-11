// Dialogue scripts (dialogue skill): a small, readable text format for conversations with choices,
// conditions, variables and events, plus a runner that steps through it. No DOM: works in the game, in the
// box (dialogue.js) and in Node (lint.mjs). Keep scripts as template strings in JS modules
// (export default `…`) so they load offline in plain and Vite games alike.
//
// Format (indentation makes blocks; 2 or 4 spaces, be consistent):
//
//   # a comment
//   === blacksmith                       start of a node (a conversation, or part of one)
//   Brom (grumpy): Shop's closed.        a line: speaker, optional mood (picks the portrait), text
//   : The forge hisses.                  narration (no speaker)
//   Brom: You again, $name? {w} Fine.    $var interpolation; {w} / {w=0.6} pause; *emphasis*;
//                                        {shake}…{/shake}; {c=#e0b04a}…{/c} colour
//   -> Ask about the sword [once]        choices: consecutive -> lines form one choice set
//       Brom: That old thing?            the indented block runs when it's picked
//       ~ set askedSword                 set a flag (true)
//   -> Buy it [if gold >= 50]            a condition: the choice only shows when true
//       ~ set gold -= 50                 =, +=, -= with numbers, strings or true/false
//       ~ emit give sword                an event for the game: on.give('sword')
//   -> Leave
//       >> end                           jump: >> node, or >> end
//   if askedSword and not boughtSword:   if / elif / else blocks, conditions with and / or / not,
//       Brom: Still thinking about it?   ==, !=, <, >, <=, >= against numbers, strings or flags
//   else:
//       Brom: Off you go.
//   >> end
//
// Lines and choices may end with #some-id to give them a stable id for translation; otherwise their id is
// <node>:<line number>.

// ---------- parse ----------

export function parse(src, { file = 'script' } = {}) {
  const nodes = {}
  const errors = []
  const raw = src.replace(/\r/g, '').split('\n')
  let node = null
  const lines = []
  raw.forEach((text, i) => {
    const m = text.match(/^(\s*)(.*?)\s*$/)
    const body = m[2]
    if (!body || body.startsWith('#')) return
    if (body.startsWith('===')) {
      node = body.slice(3).trim()
      if (nodes[node]) errors.push(`${file}:${i + 1} node "${node}" defined twice`)
      nodes[node] = { name: node, line: i + 1, body: [] }
      lines.push({ node, indent: -1, text: '===', n: i + 1 })
      return
    }
    if (!node) { errors.push(`${file}:${i + 1} text before the first === node`); return }
    lines.push({ node, indent: m[1].replace(/\t/g, '    ').length, text: body, n: i + 1 })
  })
  // build block trees per node by indentation
  let idx = 0
  const block = (indent, nodeName) => {
    const out = []
    while (idx < lines.length) {
      const L = lines[idx]
      if (L.node !== nodeName || L.indent < indent || L.text === '===') break
      if (L.indent > indent) { errors.push(`${file}:${L.n} unexpected indentation`); idx++; continue }
      idx++
      const st = statement(L, nodeName)
      if (!st) continue
      if (st.t === 'choice') {
        st.body = childBlock(L, nodeName)
        const prev = out[out.length - 1]
        if (prev && prev.t === 'choices') prev.options.push(st)
        else out.push({ t: 'choices', options: [st], n: L.n })
      } else if (st.t === 'if') {
        st.branches[0].body = childBlock(L, nodeName)
        out.push(st)
      } else if (st.t === 'elif' || st.t === 'else') {
        const prev = out[out.length - 1]
        if (!prev || prev.t !== 'if') { errors.push(`${file}:${L.n} ${st.t} without if`); childBlock(L, nodeName); continue }
        if (prev.hasElse) { errors.push(`${file}:${L.n} ${st.t} after else`); childBlock(L, nodeName); continue }
        const b = { cond: st.t === 'else' ? null : st.cond, body: childBlock(L, nodeName) }
        prev.branches.push(b)
        if (st.t === 'else') prev.hasElse = true
      } else out.push(st)
    }
    return out
  }
  const childBlock = (L, nodeName) => {
    const next = lines[idx]
    if (!next || next.node !== nodeName || next.text === '===' || next.indent <= L.indent) return []
    return block(next.indent, nodeName)
  }
  const statement = (L, nodeName) => {
    let t = L.text
    let id = null
    const idm = t.match(/\s#([\w:.-]+)$/)
    if (idm) { id = idm[1]; t = t.slice(0, idm.index).trim() }
    id = id || `${nodeName}:${L.n}`
    if (t.startsWith('->')) {
      let text = t.slice(2).trim(), cond = null, once = false
      for (const tag of [...text.matchAll(/\[(if [^\]]+|once)\]/g)]) {
        if (tag[1] === 'once') once = true
        else cond = tag[1].slice(3).trim()
      }
      text = text.replace(/\s*\[(if [^\]]+|once)\]/g, '').trim()
      return { t: 'choice', text, cond, once, id, n: L.n }
    }
    if (t.startsWith('>>')) return { t: 'goto', node: t.slice(2).trim(), n: L.n }
    if (t.startsWith('~')) {
      const parts = t.slice(1).trim().split(/\s+/)
      if (parts[0] === 'set') {
        const m = t.slice(1).trim().slice(3).trim().match(/^([\w.]+)\s*(\+=|-=|=)?\s*(.*)$/)
        if (!m) { errors.push(`${file}:${L.n} bad set`); return null }
        return { t: 'set', name: m[1], op: m[2] || '=', value: m[2] ? literal(m[3]) : true, n: L.n }
      }
      if (parts[0] === 'emit') return { t: 'emit', name: parts[1], args: parts.slice(2).map(literal), n: L.n }
      errors.push(`${file}:${L.n} unknown command ~${parts[0]}`)
      return null
    }
    let m = t.match(/^if\s+(.+):$/)
    if (m) return { t: 'if', branches: [{ cond: m[1].trim(), body: [] }], n: L.n }
    m = t.match(/^elif\s+(.+):$/)
    if (m) return { t: 'elif', cond: m[1].trim(), n: L.n }
    if (/^else:$/.test(t)) return { t: 'else', n: L.n }
    m = t.match(/^([^:()]*?)(?:\s*\(([\w-]+)\))?\s*:\s(.*)$/) || t.match(/^():\s*(.*)$/)
    if (m) {
      if (m.length === 3) return { t: 'line', who: '', mood: null, text: m[2], id, n: L.n }
      return { t: 'line', who: m[1].trim(), mood: m[2] || null, text: m[3], id, n: L.n }
    }
    errors.push(`${file}:${L.n} can't read "${t}" (a line needs "Speaker: text")`)
    return null
  }
  while (idx < lines.length) {
    const L = lines[idx]
    if (L.text === '===') {
      idx++
      const first = lines[idx]
      if (first && first.node === L.node && first.text !== '===') nodes[L.node].body = block(first.indent, L.node)
      continue
    }
    idx++
  }
  return { nodes, errors }
}

function literal(s) {
  s = (s ?? '').trim()
  if (s === 'true') return true
  if (s === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s)
  return s.replace(/^["']|["']$/g, '')
}

// ---------- conditions ----------

/** Evaluate "a and not b or gold >= 10" against vars. No parentheses: and binds tighter than or. */
export function evaluate(cond, vars) {
  if (!cond) return true
  return cond.split(/\s+or\s+/).some((part) => part.split(/\s+and\s+/).every((atom) => {
    atom = atom.trim()
    let neg = false
    if (atom.startsWith('not ')) { neg = true; atom = atom.slice(4).trim() }
    const m = atom.match(/^([\w.]+)\s*(==|!=|<=|>=|<|>)\s*(.+)$/)
    let r
    if (m) {
      const a = vars[m[1]] ?? 0, b = literal(m[3])
      r = { '==': a == b, '!=': a != b, '<': a < b, '>': a > b, '<=': a <= b, '>=': a >= b }[m[2]] // eslint-disable-line eqeqeq
    } else r = !!vars[atom]
    return neg ? !r : r
  }))
}

/** Replace $name with vars.name in display text. */
export function interpolate(text, vars) {
  return text.replace(/\$(\w+(?:\.\w+)*)/g, (_, k) => (vars[k] ?? `$${k}`))
}

// ---------- run ----------

/**
 * A runner over parsed nodes. vars is a plain object the game owns (keep it in save.data so choices
 * persist); on is { eventName(...args) } for ~ emit; strings is { id: translated text }.
 * next() returns { type: 'line', who, mood, text, id } | { type: 'choices', options: [{ text, id, index }] } |
 * { type: 'end' }. choose(index) picks an option of the last choices.
 */
export function createRunner(script, { vars = {}, on = {}, strings = {} } = {}) {
  const { nodes } = typeof script === 'string' ? parse(script) : script
  let stack = []
  let pending = null
  const tr = (st) => interpolate(strings[st.id] ?? st.text, vars)
  const run = {
    vars,
    nodes,
    start(name) {
      if (!nodes[name]) throw new Error(`dialogue: no node "${name}"`)
      stack = [{ body: nodes[name].body, i: 0 }]
      pending = null
      vars[`__seen:${name}`] = (vars[`__seen:${name}`] || 0) + 1
      return run
    },
    next() {
      if (pending) return pending.view
      for (let guard = 0; guard < 10000; guard++) {
        const f = stack[stack.length - 1]
        if (!f) return { type: 'end' }
        if (f.i >= f.body.length) { stack.pop(); continue }
        const st = f.body[f.i++]
        if (st.t === 'line') return { type: 'line', who: st.who, mood: st.mood, text: tr(st), id: st.id }
        if (st.t === 'set') {
          const cur = vars[st.name] ?? 0
          vars[st.name] = st.op === '+=' ? cur + st.value : st.op === '-=' ? cur - st.value : st.value
          continue
        }
        if (st.t === 'emit') { on[st.name]?.(...st.args); on['*']?.(st.name, ...st.args); continue }
        if (st.t === 'goto') {
          if (st.node === 'end') { stack = []; return { type: 'end' } }
          if (!nodes[st.node]) throw new Error(`dialogue: no node "${st.node}"`)
          vars[`__seen:${st.node}`] = (vars[`__seen:${st.node}`] || 0) + 1
          stack = [{ body: nodes[st.node].body, i: 0 }]
          continue
        }
        if (st.t === 'if') {
          const b = st.branches.find((br) => evaluate(br.cond, vars))
          if (b && b.body.length) stack.push({ body: b.body, i: 0 })
          continue
        }
        if (st.t === 'choices') {
          const opts = st.options.filter((o) => evaluate(o.cond, vars) && !(o.once && vars[`__once:${o.id}`]))
          if (!opts.length) continue
          pending = { opts, view: { type: 'choices', options: opts.map((o, index) => ({ text: tr(o), id: o.id, index })) } }
          return pending.view
        }
      }
      throw new Error('dialogue: runaway script (a loop with no line or choice?)')
    },
    choose(index) {
      if (!pending) return
      const o = pending.opts[index]
      if (!o) return // out of range: keep waiting for a valid choice
      pending = null
      if (o.once) vars[`__once:${o.id}`] = true
      if (o.body.length) stack.push({ body: o.body, i: 0 })
    }
  }
  return run
}
