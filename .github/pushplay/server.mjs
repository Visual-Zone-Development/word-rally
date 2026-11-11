import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join } from 'node:path'
import { inside } from './repo.mjs'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json'
}

/**
 * Minimal static server. Mounts map URL prefixes to folders ('/' = a game's files),
 * which mirrors how the launcher serves a game at the root of its own origin.
 * `files` serves fixed contents at exact paths (e.g. /__net.json), ahead of the mounts.
 * Returns { url, close, missing } where `missing` lists 404'd paths.
 */
export async function serve(mounts, files = {}) {
  const missing = []
  const prefixes = Object.keys(mounts).sort((a, b) => b.length - a.length)
  const server = createServer((req, res) => {
    let path
    try {
      path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    } catch {
      return res.writeHead(400).end('Bad request')
    }
    if (path === '/favicon.ico') return res.writeHead(204).end()
    if (path in files) return res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'text/plain' }).end(files[path])
    const prefix = prefixes.find((p) => path.startsWith(p))
    let file = prefix ? inside(mounts[prefix], path.slice(prefix.length)) : null
    if (file && existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
    if (!file || !existsSync(file)) {
      missing.push(path)
      return res.writeHead(404).end('Not found')
    }
    // CORS so art pages (rendered from about:blank) can load fonts from here.
    res.writeHead(200, {
      'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'access-control-allow-origin': '*'
    })
    createReadStream(file).pipe(res)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address()
  return {
    url: `http://127.0.0.1:${port}`,
    missing,
    close: () => new Promise((r) => server.close(r))
  }
}
