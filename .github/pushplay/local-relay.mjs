// A relay running next to the game, for `npm run dev` and the build check, so online games
// work with no internet. Same room logic as the hosted relay (relay-rooms.mjs is copied from it),
// and the same party join page (relay-shell.mjs, relay-public/), so phones on the same Wi-Fi can
// join a party game in development.
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { WebSocketServer } from 'ws'

// In a game repo the kit carries its own copies; in the launcher monorepo it reads the relay's.
const here = (vendored, source) => (existsSync(join(import.meta.dirname, vendored)) ? join(import.meta.dirname, vendored) : join(import.meta.dirname, '../../../apps/relay', source))
const { Relay } = await import(pathToFileURL(here('relay-rooms.mjs', 'src/rooms.mjs')).href)
const { shellHandler } = await import(pathToFileURL(here('relay-shell.mjs', 'src/shell.mjs')).href)
const SHELL_DIR = here('relay-public', 'public')
const BRAND = JSON.parse(readFileSync(here('brand.json', 'brand.json'), 'utf8'))

/** This machine's address on the local network, for phones on the same Wi-Fi. */
export function lanAddress() {
  for (const list of Object.values(networkInterfaces())) for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) return a.address
  return null
}

/**
 * Start a relay (port 0 = any free port). Tracks the bytes it forwards.
 * `lan: true` also listens on the local network, and party join links point there.
 */
export async function startLocalRelay(port = 0, { lan = false } = {}) {
  const stats = { bytes: 0 }
  const lanIp = lan ? lanAddress() : null
  let base = ''
  const relay = new Relay({ onTraffic: (n) => (stats.bytes += n), joinUrl: (code) => `${base}/j/${code}` })
  const shell = shellHandler(SHELL_DIR, BRAND)
  const server = createServer(async (req, res) => {
    if (!(await shell(req, res))) res.writeHead(404).end()
  })
  const wss = new WebSocketServer({ server })
  wss.on('connection', (ws, req) => {
    const phone = new URL(req.url, 'http://relay').searchParams.has('party')
    const client = relay.connect({ send: (t) => ws.send(t), close: (code, reason) => ws.close(code, reason) }, phone ? { phone } : { game: 'local' })
    ws.on('message', (data) => client.receive(data.toString('utf8')))
    ws.on('close', () => client.disconnect())
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, lanIp ? '0.0.0.0' : '127.0.0.1', resolve)
  })
  const actual = server.address().port
  base = `http://${lanIp ?? '127.0.0.1'}:${actual}`
  return {
    url: `ws://127.0.0.1:${actual}/`,
    /** Where phones open the join page. */
    joinBase: base,
    relay,
    stats,
    close: () =>
      new Promise((resolve) => {
        for (const ws of wss.clients) ws.terminate()
        server.close(resolve)
      })
  }
}
