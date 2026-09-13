// Tiny static server for the QA runner. Serves app/ at / and app/tests/qa/fixtures at /__qa/fixtures/.
// No dependencies, no caching, no directory listings. `GET /__qa/health` → ok.
import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const port = Number(process.argv[2] || 6009)
const here = fileURLToPath(new URL('.', import.meta.url))
const appRoot = resolve(here, '../..')          // app/
const fixtures = resolve(here, 'fixtures')       // app/tests/qa/fixtures/

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
}

async function send (res, root, rel) {
  let path = resolve(root, '.' + rel)
  if (!path.startsWith(root + sep) && path !== root) return res.writeHead(403).end('forbidden')
  try {
    const s = await stat(path)
    if (s.isDirectory()) path = join(path, 'index.html')
    const body = await readFile(path)
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' })
    res.end(body)
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found: ' + rel)
  }
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  const p = decodeURIComponent(url.pathname)
  if (p === '/__qa/health') return res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}')
  if (p.startsWith('/__qa/fixtures/')) return send(res, fixtures, p.slice('/__qa/fixtures'.length))
  return send(res, appRoot, p)
}).listen(port, '127.0.0.1', () => console.log(`qa static server on http://127.0.0.1:${port} (app/ = ${appRoot})`))
