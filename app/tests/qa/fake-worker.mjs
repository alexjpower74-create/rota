// In-memory stand-in for the Worker, implementing just enough of docs/API.md to exercise
// tests/live-roundtrip.mjs before the real Worker exists. NOT the mock the app uses (that is r2's
// api.mock.js). Run: node app/tests/qa/fake-worker.mjs 6598 [--no-away-rule]   leader token: "lead"
import http from 'node:http'
const port = Number(process.argv[2] || 6598)
const noAwayRule = process.argv.includes('--no-away-rule')
const ROLES = ['lead guitar', 'rhythm guitar', 'bass', 'drums', 'keys', 'vocals 1', 'vocals 2', 'vocals 3', 'sound', 'projection']
const people = [
  { id: 'p1', name: 'Alexander Power', roles: ['lead guitar'], token: 't-alex', phone: '07700 900000', is_leader: 1 },
  { id: 'p2', name: 'Sam SAMPLE', roles: ['drums'], token: 't-sam', phone: '07700 900001' },
  { id: 'p3', name: 'Jo SAMPLE', roles: ['drums', 'bass'], token: 't-jo', phone: '' }
]
const away = new Set() // "personId|date"
const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7))
const services = [{ id: 's1', date: d.toISOString().slice(0, 10), time: '11:00', kind: 'am', title: '', notes: '', rev: 1, slots: Object.fromEntries(ROLES.map(r => [r, null])), set: [] }]
const view = s => ({ ...s, slots: Object.fromEntries(Object.entries(s.slots).map(([r, pid]) => [r, pid ? { person_id: pid, name: people.find(p => p.id === pid)?.name } : null])), away_names: people.filter(p => away.has(p.id + '|' + s.date)).map(p => p.name) })
let seq = 10
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'); const p = url.pathname; const m = req.method
  const tok = (req.headers.authorization || '').replace(/^Bearer /, '')
  const who = tok === 'lead' ? { id: 'p1', leader: true } : people.find(x => x.token === tok)
  let body = ''; for await (const c of req) body += c; body = body ? JSON.parse(body) : {}
  const svcAt = id => services.find(s => s.id === id)
  if (p === '/health') return json(res, 200, { ok: true })
  if (p === '/public/next') return json(res, 200, view(services[0]))
  if (p === '/people' && m === 'GET') return json(res, 200, who?.leader ? people : people.map(({ id, name, roles }) => ({ id, name, roles })))
  if (p === '/people' && m === 'POST') { if (!who?.leader) return json(res, 403, { error: 'Only the leader can add people.' }); const np = { id: 'p' + ++seq, name: body.name, roles: body.roles, token: 't-' + seq, phone: body.phone || '' }; people.push(np); return json(res, 200, np) }
  if (p.startsWith('/people/') && m === 'DELETE') { const id = p.split('/')[2]; const i = people.findIndex(x => x.id === id); if (i >= 0) people.splice(i, 1); for (const s of services) for (const r in s.slots) if (s.slots[r] === id) s.slots[r] = null; return json(res, 200, { ok: true }) }
  if (p === '/services' && m === 'GET') return json(res, 200, services.filter(s => s.date >= (url.searchParams.get('from') || '')).map(view))
  if (p === '/me' && who && !who.leader) return json(res, 200, { person: { id: who.id, name: who.name, roles: who.roles }, next: view(services[0]), upcoming: services.map(view), away: [...away].filter(k => k.startsWith(who.id + '|')).map(k => k.split('|')[1]) })
  if (p.startsWith('/me/away/') && who) {
    const date = p.split('/')[3]; const target = url.searchParams.get('person')
    const pid = who.leader ? (target || who.id) : who.id           // members can only touch themselves
    const key = pid + '|' + date
    const unassigned = []
    if (m === 'PUT') { away.add(key); for (const s of services) if (s.date === date) for (const r in s.slots) if (s.slots[r] === pid) { s.slots[r] = null; s.rev++; unassigned.push(`${r} on ${date}`) } }
    else away.delete(key)
    return json(res, 200, { away: [...away].filter(k => k.startsWith(pid + '|')).map(k => k.split('|')[1]), ...(unassigned.length ? { unassigned } : {}) })
  }
  const slot = p.match(/^\/services\/([^/]+)\/slots\/(.+)$/)
  if (slot && m === 'PUT') {
    if (!who?.leader) return json(res, 403, { error: 'Only the leader can change who is on.' })
    const s = svcAt(slot[1]); const role = decodeURIComponent(slot[2])
    if (!s) return json(res, 404, { error: 'No such service.' })
    if (body.rev !== s.rev) return json(res, 409, { error: "Someone changed this just now. Here's the latest.", current: view(s) })
    if (body.person_id && !noAwayRule && away.has(body.person_id + '|' + s.date)) return json(res, 409, { error: `${people.find(x => x.id === body.person_id)?.name} is away that day.` })
    s.slots[role] = body.person_id || null; s.rev++
    return json(res, 200, view(s))
  }
  json(res, who ? 404 : 401, { error: who ? 'Not found.' : 'This link is not valid.' })
}).listen(port, '127.0.0.1', () => console.log(`fake worker on ${port}${noAwayRule ? ' (AWAY RULE OFF)' : ''}`))
