// npm test: npm run art must never call a paid image API before the person paying has agreed to the cost.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '../..')
const ID = 'zz-art-approval-test'
const GAME = join(ROOT, 'games', ID)
const FAKE_FETCH = join(import.meta.dirname, 'fake-fetch.test-helper.mjs')

before(() => {
  mkdirSync(join(GAME, 'art'), { recursive: true })
  writeFileSync(
    join(GAME, 'art', 'prompts.json'),
    JSON.stringify({ style: 'Test style.', quality: 'medium', assets: [{ id: 'rock' }, { id: 'tree' }] })
  )
})
after(() => rmSync(GAME, { recursive: true, force: true }))

/** Runs npm run art with a fake OpenAI key and a fetch that records calls; stdin is a pipe, as for an agent. */
function art(...args) {
  const env = { ...process.env, OPENAI_API_KEY: 'not-a-real-key' }
  for (const k of ['GEMINI_API_KEY', 'REPLICATE_API_TOKEN', 'ART_PROVIDER']) delete env[k]
  const r = spawnSync(process.execPath, ['--import', FAKE_FETCH, join(ROOT, 'tools/art/generate.mjs'), ID, ...args], { env, encoding: 'utf8' })
  return { code: r.status, out: r.stdout + r.stderr, called: r.stdout.includes('FAKE-FETCH') }
}

test('without --approve it shows the cost, asks for agreement and calls nothing', () => {
  const r = art()
  assert.equal(r.code, 2)
  assert.equal(r.called, false)
  assert.match(r.out, /about \$0\.10/)
  assert.match(r.out, /Nothing was charged/)
  assert.match(r.out, /--approve 0\.10/)
  assert.equal(existsSync(join(GAME, 'assets', 'art')), false)
})

test('an --approve amount below the estimate is refused and calls nothing', () => {
  const r = art('--approve', '0.05')
  assert.equal(r.code, 2)
  assert.equal(r.called, false)
  assert.match(r.out, /more than the \$0\.05 approved/)
})

test('--dry shows the prompts and the cost and calls nothing', () => {
  const r = art('--dry')
  assert.equal(r.code, 0)
  assert.equal(r.called, false)
  assert.match(r.out, /Nothing was generated or charged/)
})

test('an --approve amount that covers the estimate goes ahead and calls the provider', () => {
  const r = art('--approve', '$0.10')
  assert.equal(r.called, true)
})
