// Run via `npm test` (tests/run.mjs) which seeds a fresh local D1 and starts wrangler dev on 6002.
// Or directly: API=http://127.0.0.1:6002 LEADER=<leader token> node --test tests/api.test.mjs
import { test, before } from 'node:test'
import assert from 'node:assert/strict'

const API = process.env.API || 'http://127.0.0.1:6002'
const LEADER = process.env.LEADER
if (!LEADER) throw new Error('Set LEADER=<leader token> (see worker/SECRETS.txt after seeding).')

async function call (method, path, { token, body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await res.text()
  let data = null
  try { data = JSON.parse(text) } catch { data = { raw: text } }
  return { status: res.status, data }
}
const lead = (m, p, body) => call(m, p, { token: LEADER, body })

// Dates well past anything in the snapshot so "next service" tests stay deterministic.
const far = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + 400 + n); return d.toISOString().slice(0, 10) }
const today = new Date().toISOString().slice(0, 10)

let sam, sue, svc
before(async () => {
  sam = (await lead('POST', '/people', { name: 'SAMPLE Sam Drummer', roles: ['drums', 'sound'], phone: '07700 900001' })).data
  sue = (await lead('POST', '/people', { name: 'SAMPLE Sue Bass', roles: ['bass', 'drums'] })).data
  assert.ok(sam.token && sue.token, 'people created with tokens')
  svc = (await lead('POST', '/services', { date: far(0), time: '11:00', kind: 'am' })).data
  assert.equal(svc.rev, 1)
  // Enough future services that "the next four" is really four.
  for (const n of [7, 14, 21]) await lead('POST', '/services', { date: far(n), time: '11:00', kind: 'am' })
})

test('health', async () => {
  const r = await call('GET', '/health')
  assert.equal(r.status, 200)
  assert.deepEqual(r.data, { ok: true })
})

test('next service for a member: earliest service on or after today, with slots, set and away names', async () => {
  const r = await call('GET', '/me', { token: sam.token })
  assert.equal(r.status, 200)
  assert.equal(r.data.person.name, sam.name)
  assert.ok(!('phone' in r.data.person), 'member view carries no phone')
  assert.ok(r.data.next.date >= today, 'next is not in the past')
  assert.equal(r.data.upcoming.length, 4)
  assert.equal(r.data.upcoming[0].id, r.data.next.id)
  for (let i = 1; i < 4; i++) assert.ok(r.data.upcoming[i].date >= r.data.upcoming[i - 1].date, 'upcoming in date order')
  assert.ok('lead guitar' in r.data.next.slots && 'projection' in r.data.next.slots, 'every role has a slot')
  assert.ok(Array.isArray(r.data.next.set) && Array.isArray(r.data.next.away_names))
  assert.deepEqual(r.data.away, [])
})

test('mark away, then assignment is refused with a plain sentence', async () => {
  const a = await call('PUT', `/me/away/${svc.date}`, { token: sam.token })
  assert.equal(a.status, 200)
  assert.deepEqual(a.data.away, [svc.date])

  const cur = (await lead('GET', `/services/${svc.id}`)).data
  assert.ok(cur.away_names.includes(sam.name), 'service view lists them as away')
  const r = await lead('PUT', `/services/${svc.id}/slots/drums`, { rev: cur.rev, person_id: sam.id })
  assert.equal(r.status, 409)
  assert.equal(r.data.error, `${sam.name} is away that day.`)
  const after = (await lead('GET', `/services/${svc.id}`)).data
  assert.equal(after.slots.drums, null, 'slot stayed open')
})

test('leader assigns and fills; a slot holds one person; marking away unassigns', async () => {
  let cur = (await lead('GET', `/services/${svc.id}`)).data
  let r = await lead('PUT', `/services/${svc.id}/slots/drums`, { rev: cur.rev, person_id: sue.id })
  assert.equal(r.status, 200)
  assert.equal(r.data.slots.drums.name, sue.name)
  assert.equal(r.data.rev, cur.rev + 1, 'rev bumps on assignment')

  // Sam is back; put Sam on drums → replaces Sue (one person per slot).
  await call('DELETE', `/me/away/${svc.date}`, { token: sam.token })
  r = await lead('PUT', `/services/${svc.id}/slots/drums`, { rev: r.data.rev, person_id: sam.id })
  assert.equal(r.status, 200)
  assert.equal(r.data.slots.drums.name, sam.name)
  const rows = Object.values(r.data.slots).filter(s => s && s.name === sue.name)
  assert.equal(rows.length, 0, 'Sue no longer holds the slot')

  // Member view shows the name.
  const me = await call('GET', '/me', { token: sue.token })
  const view = me.data.upcoming.find(s => s.id === svc.id) || (await call('GET', `/services/${svc.id}`, { token: sue.token })).data
  assert.equal(view.slots.drums.name, sam.name)

  // Sam marks away that day → unassigned and told which slot.
  const a = await call('PUT', `/me/away/${svc.date}`, { token: sam.token })
  assert.equal(a.status, 200)
  assert.deepEqual(a.data.unassigned, [`drums on ${svc.date}`])
  const after = (await lead('GET', `/services/${svc.id}`)).data
  assert.equal(after.slots.drums, null)
  await call('DELETE', `/me/away/${svc.date}`, { token: sam.token })

  // Clearing a slot with null.
  cur = (await lead('GET', `/services/${svc.id}`)).data
  r = await lead('PUT', `/services/${svc.id}/slots/bass`, { rev: cur.rev, person_id: sue.id })
  r = await lead('PUT', `/services/${svc.id}/slots/bass`, { rev: r.data.rev, person_id: null })
  assert.equal(r.status, 200)
  assert.equal(r.data.slots.bass, null)
})

test('set list keeps order, keys and lead; songs get last_used', async () => {
  const songs = (await lead('GET', '/songs')).data
  const byTitle = (t) => songs.find(s => s.title === t)
  const g1 = byTitle('Goodness of God'), g8 = byTitle('Holy Forever'), g3 = byTitle('Way Maker')
  assert.ok(g1 && g8 && g3, 'snapshot songs imported')
  assert.equal(g1.bpm, 63)
  let cur = (await lead('GET', `/services/${svc.id}`)).data
  let r = await lead('PUT', `/services/${svc.id}/set`, { rev: cur.rev, entries: [
    { song_id: g8.id, key: 'C' }, { song_id: g1.id, key: 'A', lead_person_id: sue.id, note: 'slow intro' }, { song_id: g3.id }
  ] })
  assert.equal(r.status, 200)
  assert.deepEqual(r.data.set.map(e => e.song.title), ['Holy Forever', 'Goodness of God', 'Way Maker'])
  assert.deepEqual(r.data.set.map(e => e.position), [1, 2, 3])
  assert.equal(r.data.set[1].key, 'A')
  assert.equal(r.data.set[1].lead_name, sue.name)
  assert.equal(r.data.set[2].key, g3.key, 'key defaults to the song key')
  // Reorder.
  r = await lead('PUT', `/services/${svc.id}/set`, { rev: r.data.rev, entries: [{ song_id: g3.id, key: 'E' }, { song_id: g8.id, key: 'C' }] })
  assert.deepEqual(r.data.set.map(e => e.song.title), ['Way Maker', 'Holy Forever'])
  const again = (await call('GET', `/services/${svc.id}`, { token: sam.token })).data
  assert.deepEqual(again.set.map(e => e.song.title), ['Way Maker', 'Holy Forever'], 'order persisted')
  const g3now = (await lead('GET', '/songs')).data.find(s => s.id === g3.id)
  assert.equal(g3now.last_used, svc.date)
})

test('desk note: any member can post, leader or sound can resolve', async () => {
  let r = await call('POST', '/desk', { token: sue.token, body: { text: 'kick mic crackling' } })
  assert.equal(r.status, 201)
  const note = r.data
  assert.equal(note.by_name, sue.name)
  r = await call('GET', '/desk', { token: sam.token })
  assert.ok(r.data.some(n => n.id === note.id && n.resolved === false))
  // Sue (no sound role, not leader) cannot resolve.
  r = await call('PATCH', `/desk/${note.id}`, { token: sue.token, body: { resolved: true } })
  assert.equal(r.status, 403)
  // Sam has the sound role.
  r = await call('PATCH', `/desk/${note.id}`, { token: sam.token, body: { resolved: true } })
  assert.equal(r.status, 200)
  assert.equal(r.data.resolved, true)
  r = await call('POST', '/desk', { token: sue.token, body: { text: '   ' } })
  assert.equal(r.status, 400)
})

test('stale rev → 409 with the current row', async () => {
  const cur = (await lead('GET', `/services/${svc.id}`)).data
  const r = await lead('PATCH', `/services/${svc.id}`, { rev: cur.rev - 1, title: 'Stale' })
  assert.equal(r.status, 409)
  assert.equal(r.data.error, "Someone changed this just now. Here's the latest.")
  assert.equal(r.data.current.rev, cur.rev)
  assert.equal(r.data.current.id, svc.id)
  // Same for slots and channels.
  const s = await lead('PUT', `/services/${svc.id}/slots/keys`, { rev: cur.rev + 5, person_id: null })
  assert.equal(s.status, 409)
  const ch = (await lead('GET', '/channels')).data
  assert.equal(ch.channels.length, 16)
  const c = await lead('PUT', '/channels', { rev: ch.rev - 1, channels: ch.channels })
  assert.equal(c.status, 409)
  assert.equal(c.data.current.rev, ch.rev)
  const ok = await lead('PUT', '/channels', { rev: ch.rev, channels: ch.channels.map(x => x.ch === 1 ? { ...x, note: 'new cable' } : x) })
  assert.equal(ok.status, 200)
  assert.equal(ok.data.rev, ch.rev + 1)
  assert.equal(ok.data.channels[0].note, 'new cable')
})

test('a member cannot edit another member, nor leader things', async () => {
  let r = await call('PUT', `/me/away/${far(3)}?person=${sue.id}`, { token: sam.token })
  assert.equal(r.status, 403)
  const sueAway = (await call('GET', '/me', { token: sue.token })).data.away
  assert.ok(!sueAway.includes(far(3)), 'Sue was not marked away by Sam')
  // Leader may act for someone.
  r = await call('PUT', `/me/away/${far(3)}?person=${sue.id}`, { token: LEADER })
  assert.equal(r.status, 200)
  assert.ok(r.data.away.includes(far(3)))
  await call('DELETE', `/me/away/${far(3)}?person=${sue.id}`, { token: LEADER })

  const cur = (await lead('GET', `/services/${svc.id}`)).data
  r = await call('PUT', `/services/${svc.id}/slots/bass`, { token: sam.token, body: { rev: cur.rev, person_id: sam.id } })
  assert.equal(r.status, 403)
  r = await call('POST', '/services', { token: sam.token, body: { date: far(9), kind: 'am' } })
  assert.equal(r.status, 403)
  r = await call('POST', '/songs', { token: sam.token, body: { title: 'Nope' } })
  assert.equal(r.status, 403)
  r = await call('GET', '/people', { token: sam.token })
  assert.equal(r.status, 200)
  assert.ok(r.data.every(p => !('phone' in p) && !('token' in p)), 'members see names and roles only')
  r = await call('GET', '/me', { token: 'not-a-real-token' })
  assert.equal(r.status, 401)
})

test('no token: public next service only, no phones or tokens; everything else needs a link', async () => {
  const r = await call('GET', '/public/next')
  assert.equal(r.status, 200)
  assert.ok(r.data.date >= today)
  const text = JSON.stringify(r.data)
  assert.ok(!text.includes('07700 900001'), 'no phone numbers')
  assert.ok(!/token/.test(text) && !text.includes(sam.token), 'no tokens')
  for (const p of ['/me', '/services', '/songs', '/channels', '/desk', '/people']) {
    const x = await call('GET', p)
    assert.equal(x.status, 401, p + ' needs a token')
  }
  const w = await call('PUT', `/me/away/${far(1)}`)
  assert.equal(w.status, 401)
})

test('deleting a person clears their slots and bumps the service rev', async () => {
  const tmp = (await lead('POST', '/people', { name: 'SAMPLE Temp Keys', roles: ['keys'] })).data
  let cur = (await lead('GET', `/services/${svc.id}`)).data
  const r = await lead('PUT', `/services/${svc.id}/slots/keys`, { rev: cur.rev, person_id: tmp.id })
  assert.equal(r.data.slots.keys.name, tmp.name)
  const d = await lead('DELETE', `/people/${tmp.id}`)
  assert.equal(d.status, 200)
  const after = (await lead('GET', `/services/${svc.id}`)).data
  assert.equal(after.slots.keys, null)
  assert.equal(after.rev, r.data.rev + 1)
  assert.equal((await call('GET', '/me', { token: tmp.token })).status, 401, 'their link stops working')
})

test('services: create, edit, list from a date; bad input gets a plain sentence', async () => {
  let r = await lead('POST', '/services', { date: 'next sunday', kind: 'am' })
  assert.equal(r.status, 400)
  assert.match(r.data.error, /date/i)
  r = await lead('POST', '/services', { date: far(20), time: '19:00', kind: 'practice', title: 'Practice' })
  assert.equal(r.status, 201)
  const p = r.data
  r = await lead('PATCH', `/services/${p.id}`, { rev: p.rev, title: 'Practice for the special', notes: 'Bring capos' })
  assert.equal(r.status, 200)
  assert.equal(r.data.title, 'Practice for the special')
  assert.equal(r.data.rev, p.rev + 1)
  const list = (await call('GET', `/services?from=${far(20)}&limit=8`, { token: sam.token })).data
  assert.equal(list[0].id, p.id)
  await lead('DELETE', `/services/${p.id}`)
})
