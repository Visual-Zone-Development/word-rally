// The party join page ("shell"): what a phone or browser opens to join a party by code. It is
// the same page for every game; the TV sends each phone its game's controller, which runs in
// frame.html, sandboxed with no network access.
//
// Dependency-free so the build kit's local relay can serve it too (copied as relay-shell.mjs).
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }
const FILE = /^\/([a-z0-9-]+\.(html|js|css|svg|png|webmanifest))$/
/** Party code in the QR link: /j/ABCD */
const JOIN = /^\/j\/[A-Za-z]{4}\/?$/

/**
 * Returns a request handler for the shell's GET routes, or null for anything else.
 * @param {string} dir the shell's files (apps/relay/public)
 * @param {{ name: string }} brand fills {{NAME}} in its pages, so the name lives in brand.json only
 */
export function shellHandler(dir, brand) {
  return async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false
    const path = new URL(req.url, 'http://shell').pathname
    const name = path === '/' || JOIN.test(path) ? 'index.html' : FILE.exec(path)?.[1]
    if (!name) return false
    let body
    try {
      body = await readFile(join(dir, name))
    } catch {
      return false
    }
    const ext = name.slice(name.lastIndexOf('.'))
    if (ext === '.html') body = body.toString('utf8').replaceAll('{{NAME}}', brand.name)
    const host = req.headers.host ?? ''
    const headers = {
      'content-type': TYPES[ext],
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer'
    }
    if (name === 'frame.html') {
      // A game's controller: inline code is fine, talking to anything but the shell is not.
      headers['content-security-policy'] =
        "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob: data:; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'"
    } else if (ext === '.html') {
      headers['content-security-policy'] = `default-src 'self'; connect-src 'self' ws://${host} wss://${host}; frame-src 'self'; img-src 'self' data:; font-src 'self' data:; style-src 'self' 'unsafe-inline'`
      headers['x-frame-options'] = 'DENY'
    }
    res.writeHead(200, headers).end(req.method === 'HEAD' ? undefined : body)
    return true
  }
}
