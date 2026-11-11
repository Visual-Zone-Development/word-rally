// Runs in GitHub Actions in two stages, so game code never runs with a token in reach:
//   STAGE=build    builds and checks the games a push changed; writes zips, art and
//                  build-results.json to the work folder (uploaded as a workflow artifact).
//   STAGE=publish  (default and `beta` branches only) uploads those to the rolling release the
//                  launcher watches, using the `gh` CLI with the workflow's token, and updates the
//                  index. The default branch publishes to RELEASE_TAG (stable), `beta` to
//                  BETA_RELEASE_TAG (the beta channel, with its own index).
// With no STAGE both run in one go (local runs and tests).
//
// The release holds one index (INDEX_ASSET) plus, per game: <id>-web.zip, <id>-cover.png,
// <id>-hero.png and <id>-screenshot.png. A failed build keeps the game's last good build
// and records the error, so the launcher can show "build failed" instead of losing the game.
//
// DRY_RUN=1 skips GitHub entirely and writes the index to the work folder (used by tests).
import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BETA_RELEASE_TAG, INDEX_ASSET, KIT_DIR, KIT_VERSION, RELAY_URL, RELEASE_TAG, releaseTagFor } from './config.mjs'
import { distDir, layout, listGames, log, ROOT, validateIndex, WORK_DIR } from './repo.mjs'

const env = process.env
const dryRun = Boolean(env.DRY_RUN)
const stage = env.STAGE || 'all'
const repo = env.GITHUB_REPOSITORY ?? 'local/dry-run'
const defaultBranch = env.DEFAULT_BRANCH || 'main'
const resultsPath = join(distDir, 'build-results.json')

const gh = (...args) => execFileSync('gh', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const ghOk = (...args) => spawnSync('gh', args, { cwd: ROOT }).status === 0
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

let results
if (stage === 'build' || stage === 'all') results = await build()
else results = JSON.parse(readFileSync(resultsPath, 'utf8'))
if (stage === 'publish' || stage === 'all') await publish(results)
summary(results)
process.exit(results.games.some((r) => !r.ok) ? 1 : 0)

// --- Stage 1: build the games a push changed ---
async function build() {
  const { buildGame, launchBrowser } = await import('./pipeline.mjs')
  const sha = env.GITHUB_SHA ?? spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim()
  const branch = env.GITHUB_REF_NAME ?? 'local'
  const runUrl = env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL}/${repo}/actions/runs/${env.GITHUB_RUN_ID}` : null
  const buildNumber = Number(env.GITHUB_RUN_NUMBER ?? 0)
  const games = listGames()

  function changedFiles() {
    const before = env.BEFORE_SHA
    try {
      if (before && !/^0+$/.test(before)) return git('diff', '--name-only', before, sha).split('\n').filter(Boolean)
      // New branch: compare with where it left the default branch. The first push of a brand-new
      // repo has nothing to compare with (the branch is the default branch), so build everything.
      const base = git('merge-base', `origin/${defaultBranch}`, sha)
      if (base === sha) return null
      return git('diff', '--name-only', base, sha).split('\n').filter(Boolean)
    } catch {
      return null // unknown history → build everything
    }
  }
  const changed = changedFiles()
  const relevant = (file) => !file.endsWith('.md')
  const kitChanged = changed?.some((f) => f.startsWith(`${KIT_DIR}/`) || f.startsWith('.github/workflows/') || f === 'package.json' || f === 'package-lock.json')
  const buildAll = env.BUILD_ALL === 'true' || changed === null || kitChanged
  const targets = games.filter((game) => buildAll || changed.some((f) => relevant(f) && (game.rel ? f.startsWith(`${game.rel}/`) : !f.startsWith('.github/'))))
  log(`${repo} · ${layout()} repo · branch ${branch} @ ${sha.slice(0, 7)} · build #${buildNumber}`)
  log(targets.length ? `Building: ${targets.map((g) => g.id).join(', ')}` : 'No game changes to build.')

  const out = { sha, branch, buildNumber, runUrl, games: [] }
  if (targets.length) {
    const browser = await launchBrowser()
    for (const game of targets) {
      const { id } = game
      log(`\n▶ ${id}`)
      try {
        const built = await buildGame(game, browser, { beforePack: onlinePass })
        for (const w of built.warnings) log(`  ⚠ ${w}`)
        const m = built.manifest
        out.games.push({
          id,
          ok: true,
          warnings: built.warnings,
          entry: {
            id,
            name: m.name,
            description: m.description,
            version: m.version ?? null,
            players: m.players ?? null,
            controls: m.controls ?? null,
            tags: m.tags ?? [],
            inputs: m.inputs ?? null,
            online: m.online ?? false,
            party: m.party ?? false,
            phone: m.phone ?? null,
            platform: 'web',
            build: buildNumber,
            commit: sha,
            branch,
            builtAt: new Date().toISOString(),
            // Promoted out of a workshop: the launcher moves players' copies here, saves and all.
            ...(m.movedFrom ? { movedFrom: m.movedFrom } : {}),
            assets: Object.fromEntries(Object.entries(built.files).map(([k, f]) => [k, { name: f.name, size: f.size, sha256: f.sha256 }])),
            error: null
          },
          files: Object.values(built.files).map((f) => f.name)
        })
        log(`  ✓ built`)
      } catch (err) {
        const message = String(err.message)
        log(`  ✗ ${message.replaceAll('\n', '\n  ✗ ')}`)
        out.games.push({ id, ok: false, message, error: { message, commit: sha, branch, at: new Date().toISOString(), logUrl: runUrl } })
      }
    }
    await browser.close()
  }
  mkdirSync(distDir, { recursive: true })
  writeFileSync(resultsPath, JSON.stringify(out, null, 2) + '\n')
  return out
}

/**
 * Online games get the relay's address and a pass (a game token) in __net.json, which net.js
 * reads. The pass comes from the relay in exchange for this workflow's GitHub OIDC token, which
 * proves which repo built the game. No secrets needed. If it fails the game still ships, it just
 * can't go online until the next build. Runs in the build stage, before the game is zipped.
 */
async function onlinePass(out, manifest) {
  if (!(manifest.online || manifest.party) || dryRun) return []
  if (!RELAY_URL) return ['no online relay is configured for this kit (brand.json relayUrl), so online play is off in this build']
  const base = RELAY_URL.replace(/^ws/, 'http').replace(/\/+$/, '')
  let token = ''
  const warnings = []
  try {
    if (!env.ACTIONS_ID_TOKEN_REQUEST_URL) throw new Error(`the workflow needs "id-token: write" under permissions (update ${KIT_DIR} and its workflow)`)
    const oidc = await fetch(`${env.ACTIONS_ID_TOKEN_REQUEST_URL}&audience=${encodeURIComponent(base)}`, {
      headers: { authorization: `bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` }
    }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`GitHub OIDC token request failed (${r.status})`))))
    const res = await fetch(`${base}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ oidc: oidc.value, game: manifest.id, version: String(manifest.version ?? '0') })
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`the relay refused (${res.status}${body.error ? `: ${body.error}` : ''})`)
    token = body.token
  } catch (err) {
    warnings.push(`couldn't get an online pass, so this build can't go online: ${err.message}`)
  }
  writeFileSync(join(out, '__net.json'), JSON.stringify({ url: RELAY_URL, token }) + '\n')
  return warnings
}

// --- Stage 2: merge into the release index and upload ---
async function publish(results) {
  // Local runs and tests (no STAGE) publish like the default branch, whatever the branch is called.
  const releaseTag = releaseTagFor(results.branch, defaultBranch) ?? (stage === 'all' ? RELEASE_TAG : null)
  const beta = releaseTag === BETA_RELEASE_TAG
  if (!releaseTag) {
    log(`Branch ${results.branch} only builds and checks; nothing published.`)
    return
  }
  log(`Publishing to ${releaseTag}`)
  const scratch = join(WORK_DIR, 'release')
  mkdirSync(scratch, { recursive: true })
  const indexPath = join(scratch, INDEX_ASSET)
  let index = { version: 1, games: {} }
  if (dryRun) {
    if (existsSync(indexPath)) index = JSON.parse(readFileSync(indexPath, 'utf8'))
  } else if (!ghOk('release', 'view', releaseTag)) {
    gh('release', 'create', releaseTag, '--prerelease', '--target', results.sha, '--title', beta ? 'Beta game builds' : 'Game builds', '--notes',
      `Rolling ${beta ? 'beta ' : ''}game builds, updated automatically on every push${beta ? ' to the beta branch' : ''}. Not a versioned release.`)
    log(`Created release ${releaseTag}`)
  } else if (ghOk('release', 'download', releaseTag, '--pattern', INDEX_ASSET, '--dir', scratch, '--clobber')) {
    index = JSON.parse(readFileSync(indexPath, 'utf8'))
  }

  for (const r of results.games) {
    if (r.ok) {
      if (!dryRun) gh('release', 'upload', releaseTag, '--clobber', ...r.files.map((f) => join(distDir, f)))
      index.games[r.id] = r.entry
      log(`✓ ${r.id} ${dryRun ? 'built (dry run)' : 'published'}`)
    } else {
      // Keep the last good build playable; just flag the failure.
      index.games[r.id] = { ...(index.games[r.id] ?? { id: r.id, name: r.id, assets: null }), error: r.error }
      log(`✗ ${r.id} failed`)
    }
  }

  // Games deleted on the published branch (default or beta) disappear from that channel.
  const games = listGames()
  if (results.branch === defaultBranch || stage === 'publish') {
    for (const id of Object.keys(index.games)) if (!games.some((g) => g.id === id)) delete index.games[id]
  }

  index.repo = repo // stays correct if the repo is renamed or transferred
  index.layout = layout()
  index.kit = KIT_VERSION
  index.updatedAt = new Date().toISOString()
  const problems = validateIndex(index)
  if (problems.length) throw new Error(`the index the kit produced is invalid (a kit bug, please report it):\n${problems.join('\n')}`)
  writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n')
  if (!dryRun) gh('release', 'upload', releaseTag, '--clobber', indexPath)
}

// --- Summary on the workflow run page ---
function summary(results) {
  if (!env.GITHUB_STEP_SUMMARY || !existsSync(env.GITHUB_STEP_SUMMARY)) return
  const verb = stage === 'build' ? 'built' : 'published'
  const rows = results.games.map((r) =>
    r.ok ? `| ${r.id} | ✅ ${verb} | ${r.warnings.join('<br>')} |` : `| ${r.id} | ❌ failed | ${r.message.replaceAll('\n', '<br>')} |`
  )
  appendFileSync(
    env.GITHUB_STEP_SUMMARY,
    `## Game builds (#${results.buildNumber}, ${results.branch})\n\n` +
      (rows.length ? `| Game | Result | Notes |\n|---|---|---|\n${rows.join('\n')}\n` : 'No game changes in this push.\n')
  )
}
