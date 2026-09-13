// Fresh local D1 → migrate → seed from the snapshot → wrangler dev on 6002 → node --test.
import { spawn, execSync } from 'node:child_process'
import { rmSync, existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = process.env.PORT || '6002'
const sh = (cmd, quiet = false) => execSync(cmd, { cwd: root, stdio: quiet ? ['ignore', 'ignore', 'inherit'] : 'inherit' })

rmSync(join(root, '.wrangler', 'state'), { recursive: true, force: true })
sh('npx wrangler d1 migrations apply rota --local')
process.env.ROTA_SECRETS = join(root, 'SECRETS.local.txt') // the local database's links, never the live file
sh('node import.mjs ../data/spc-state-2026-09-13.json > seed.sql')
sh('npx wrangler d1 execute rota --local --file seed.sql', true)

const leaderLine = readFileSync(join(root, 'SECRETS.local.txt'), 'utf8').split('\n').find(l => l.includes('(leader)'))
const LEADER = leaderLine.split('/#/lead/')[1].trim()

const dev = spawn('npx', ['wrangler', 'dev', '--port', PORT], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
let devLog = ''
dev.stdout.on('data', d => { devLog += d })
dev.stderr.on('data', d => { devLog += d })

const base = `http://127.0.0.1:${PORT}`
const deadline = Date.now() + 60_000
let up = false
while (Date.now() < deadline) {
  try { const r = await fetch(base + '/health'); if (r.ok) { up = true; break } } catch {}
  await new Promise(r => setTimeout(r, 300))
}
if (!up) { console.error('wrangler dev did not come up:\n' + devLog); dev.kill(); process.exit(2) }

const test = spawn(process.execPath, ['--test', 'tests/api.test.mjs'], { cwd: root, stdio: 'inherit', env: { ...process.env, API: base, LEADER } })
test.on('exit', (code) => {
  dev.kill('SIGTERM')
  setTimeout(() => process.exit(code ?? 1), 300)
})
