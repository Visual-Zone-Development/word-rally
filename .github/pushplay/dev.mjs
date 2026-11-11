// npm run dev <game-id> [--host]
// Serves a game with live reload at http://localhost:5173 for playing in a browser.
// --host also listens on the LAN, to try the game on a phone or a handheld on the same Wi-Fi.
import { spawn } from 'node:child_process'
import { LOCAL_RELAY_PORT } from './config.mjs'
import { startLocalRelay } from './local-relay.mjs'
import { findGame, listGames, log, npmSpawn, quote, readManifest, ROOT } from './repo.mjs'

const args = process.argv.slice(2)
const host = args.includes('--host')
const wanted = args.find((a) => !a.startsWith('--'))
const games = listGames()
const game = wanted ? findGame(wanted) : games.length === 1 ? games[0] : undefined
if (!game) {
  log(`Usage: npm run dev <game-id> [--host]   (games: ${games.map((g) => g.id).join(', ') || 'none yet'})`)
  process.exit(1)
}
// Online games find this relay on their own when served from localhost: open two browser
// windows to play against yourself. Party games' relay also listens on the Wi-Fi, so phones
// can scan the QR code on the game's lobby screen.
const manifest = readManifest(game)
if (manifest.online || manifest.party) {
  await startLocalRelay(LOCAL_RELAY_PORT, { lan: Boolean(manifest.party) }).then(
    (r) =>
      log(
        manifest.party
          ? `Local party relay: phones on this Wi-Fi join at ${r.joinBase} (or scan the QR code in the game's lobby)`
          : `Local online relay on ws://localhost:${LOCAL_RELAY_PORT} (open the game in two windows to test online play)`
      ),
    (err) => log(`Couldn't start the local relay on port ${LOCAL_RELAY_PORT}: ${err.message}`)
  )
}
const child = spawn('npx', quote(['vite', game.dir, '--port', '5173', ...(host ? ['--host'] : [])]), { ...npmSpawn, cwd: ROOT, stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 0))
