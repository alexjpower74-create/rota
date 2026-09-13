// In-browser stand-in for the Worker (?mock=1). Same surface as api.js, same rules as docs/API.md.
// State lives in localStorage so a reload, a second tab or a second route sees the same rota.
// Seeded from the SPC snapshot plus SAMPLE people so every role has someone.
// ?today=YYYY-MM-DD pins "today" (tests); ?reset=1 throws the saved state away.
import { ApiError } from './api.js'
import { snapshot } from './mock-data.js'

export const ROLES = ['worship leader', 'lead guitar', 'rhythm guitar', 'acoustic guitar 1', 'acoustic guitar 2', 'acoustic guitar 3', 'bass', 'drums', 'keys', 'piano', 'vocals 1', 'vocals 2', 'vocals 3', 'sound', 'projection']
const ROLE_CODES = { lg: 'lead guitar', rg: 'rhythm guitar', bs: 'bass', ba: 'bass', dr: 'drums', ky: 'keys', v1: 'vocals 1', v2: 'vocals 2', v3: 'vocals 3', sd: 'sound', pj: 'projection' }
const KIND = { am: 'am', pm: 'pm', prac: 'practice', practice: 'practice', special: 'special' }

export const LEADER_TOKEN = 'lead-demo'
export const SAMPLE_PEOPLE = [
  { id: 'sp-noah', name: 'SAMPLE Noah', roles: ['lead guitar', 'rhythm guitar'], token: 'sample-noah', phone: '07700 900001' },
  { id: 'sp-eli', name: 'SAMPLE Eli', roles: ['rhythm guitar'], token: 'sample-eli', phone: '07700 900002' },
  { id: 'sp-ruth', name: 'SAMPLE Ruth', roles: ['bass'], token: 'sample-ruth', phone: '07700 900003' },
  { id: 'sp-ben', name: 'SAMPLE Ben', roles: ['bass', 'drums'], token: 'sample-ben', phone: '07700 900004' },
  { id: 'sp-dan', name: 'SAMPLE Dan', roles: ['drums'], token: 'sample-dan', phone: '07700 900005' },
  { id: 'sp-kim', name: 'SAMPLE Kim', roles: ['keys', 'vocals 3'], token: 'sample-kim', phone: '07700 900006' },
  { id: 'sp-ava', name: 'SAMPLE Ava', roles: ['vocals 1', 'vocals 2'], token: 'sample-ava', phone: '07700 900007' },
  { id: 'sp-mia', name: 'SAMPLE Mia', roles: ['vocals 2', 'vocals 3'], token: 'sample-mia', phone: '07700 900008' },
  { id: 'sp-zoe', name: 'SAMPLE Zoe', roles: ['vocals 1', 'vocals 3'], token: 'sample-zoe', phone: '07700 900009' },
  { id: 'sp-tom', name: 'SAMPLE Tom', roles: ['sound'], token: 'sample-tom', phone: '07700 900010' },
  { id: 'sp-pia', name: 'SAMPLE Pia', roles: ['projection', 'sound'], token: 'sample-pia', phone: '07700 900011' },
]

const KEY = 'rota-mock-v1'
const params = new URLSearchParams(location.search)
const todayStr = params.get('today') || new Date().toISOString().slice(0, 10)

function addDays(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
function nextSunday(iso) { const d = new Date(iso + 'T12:00:00Z'); const dow = d.getUTCDay(); return addDays(iso, (7 - dow) % 7) }

function seed() {
  const people = snapshot.team.map(p => ({
    id: p.id, name: p.name, roles: p.roles.map(r => ROLE_CODES[r] || r), token: p.id === 'p1' ? 'alex-demo' : `tok-${p.id}`,
    phone: p.phone || '', is_leader: p.id === 'p1' ? 1 : 0,
  })).concat(SAMPLE_PEOPLE.map(p => ({ ...p, is_leader: 0 })))
  const songs = snapshot.songs.map(s => ({ id: s.id, title: s.title, artist: s.artist, key: s.key, bpm: s.bpm, chart: s.chart, video: s.video, notes: s.notes, last_used: s.last || null, rev: 1 }))
  const services = snapshot.services.map(s => ({
    id: s.id, date: s.date, time: s.time, kind: KIND[s.type] || s.type, title: s.title || '', notes: s.notes || '', rev: 1,
    slots: Object.fromEntries(ROLES.map(r => [r, null])),
    set: s.set.map((e, i) => ({ song_id: e.songId, key: e.key, lead_person_id: e.leadId || null, note: e.note || '' })),
  }))
  for (const s of snapshot.services) for (const [code, pid] of Object.entries(s.assign || {})) {
    const svc = services.find(x => x.id === s.id); if (svc) svc.slots[ROLE_CODES[code] || code] = pid
  }
  // Keep the rota rolling: Sunday mornings for the six weeks after the snapshot's last service.
  const last = services.map(s => s.date).sort().pop()
  let d = nextSunday(addDays(last, 1))
  for (let i = 0; i < 6; i++, d = addDays(d, 7)) {
    services.push({ id: `gen-${d}`, date: d, time: '11:00', kind: 'am', title: '', notes: '', rev: 1, slots: Object.fromEntries(ROLES.map(r => [r, null])), set: [] })
  }
  const channels = snapshot.channels.map(c => ({ id: c.id, ch: c.ch, src: c.src, inp: c.inp, note: c.note || '' }))
  return { people, songs, services, away: [], channels, channels_rev: 1, desk: [], seq: 1 }
}

let db = null
let resetDone = false
// Re-read on every request: another tab (or the leader in a second window) may have written since.
function load() {
  db = null
  if (params.get('reset') === '1' && !resetDone) {
    resetDone = true
    const u = new URL(location.href); u.searchParams.delete('reset'); history.replaceState(null, '', u.toString())
  } else { try { const raw = localStorage.getItem(KEY); if (raw) db = JSON.parse(raw) } catch {} }
  if (!db) db = seed()
  save()
  return db
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)) } catch {} }
function nid(prefix) { db.seq++; return `${prefix}${db.seq}` }
function fail(status, error, extra) { throw new ApiError(status, { error, ...extra }) }

function personView(p, full) { const v = { id: p.id, name: p.name, roles: p.roles }; if (full) { v.phone = p.phone; v.token = p.token; v.is_leader = p.is_leader } return v }
function isAway(pid, date) { return db.away.some(a => a.person_id === pid && a.date === date) }
function serviceView(s) {
  const slots = {}
  for (const r of ROLES) { const pid = s.slots[r]; const p = pid && db.people.find(x => x.id === pid); slots[r] = p ? { person_id: p.id, name: p.name } : null }
  const set = s.set.map((e, i) => {
    const song = db.songs.find(x => x.id === e.song_id) || { id: e.song_id, title: '(song removed)', artist: '' }
    const lead = e.lead_person_id && db.people.find(x => x.id === e.lead_person_id)
    return { position: i + 1, song: { id: song.id, title: song.title, artist: song.artist, chart: song.chart, video: song.video, bpm: song.bpm }, key: e.key, lead_name: lead ? lead.name : null, note: e.note || '' }
  })
  const away_names = db.people.filter(p => isAway(p.id, s.date)).map(p => p.name)
  return { id: s.id, date: s.date, time: s.time, kind: s.kind, title: s.title, notes: s.notes, rev: s.rev, slots, set, away_names }
}
function sorted() { return [...db.services].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)) }
function upcoming(from, limit) { return sorted().filter(s => s.date >= from).slice(0, limit) }
function findService(id) { return db.services.find(s => s.id === id) || fail(404, "That service isn't on the rota any more.") }
function checkRev(row, rev, view) { if (rev !== undefined && rev !== null && rev !== row.rev) fail(409, "Someone changed this just now. Here's the latest.", { current: view ? view(row) : row }) }

export function createMockApi() {
  let token = null
  // Hook for the QA harness (r4, docs/QA.md): who exists in the mock and how to sign in as them. SAMPLE people only.
  if (typeof window !== 'undefined') { const d = load(); window.rotaMock = { leaderToken: LEADER_TOKEN, people: d.people.map(p => ({ id: p.id, name: p.name, roles: p.roles, token: p.token })) } }
  const who = () => token === LEADER_TOKEN ? { leader: true } : (token ? db.people.find(p => p.token === token) : null)
  const need = (w) => { if (!w) fail(401, 'That link is not a Rota link. Ask the leader for yours.') ; return w }
  const leaderOnly = (w) => { if (!(w && w.leader)) fail(403, 'Only the leader can change that.'); }
  const soundOrLeader = (w) => { if (!(w && (w.leader || w.roles.includes('sound')))) fail(403, 'Only the leader or the sound team can change that.') }

  const routes = [
    ['GET', /^\/health$/, () => ({ ok: true })],
    ['GET', /^\/me$/, () => {
      const w = need(who()); if (w.leader) fail(403, 'That is the leader link. Open your own link to see your page.')
      const up = upcoming(todayStr, 5)
      return { person: personView(w), next: up[0] ? serviceView(up[0]) : null, upcoming: up.slice(1, 5).map(serviceView), away: db.away.filter(a => a.person_id === w.id).map(a => a.date).sort() }
    }],
    ['GET', /^\/public\/next$/, () => { const n = upcoming(todayStr, 1)[0]; return n ? serviceView(n) : null }],
    ['GET', /^\/services$/, (m, b, q) => upcoming(q.get('from') || todayStr, +(q.get('limit') || 8)).map(serviceView)],
    ['POST', /^\/services$/, (m, b) => {
      leaderOnly(who())
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) fail(400, 'Pick a date for the service.')
      if (!['am', 'pm', 'practice', 'special'].includes(b.kind)) fail(400, 'Pick what kind of service it is.')
      const s = { id: nid('svc'), date: b.date, time: b.time || '11:00', kind: b.kind, title: b.title || '', notes: '', rev: 1, slots: Object.fromEntries(ROLES.map(r => [r, null])), set: [] }
      db.services.push(s); save(); return serviceView(s)
    }],
    ['PATCH', /^\/services\/([^/]+)$/, (m, b) => {
      leaderOnly(who()); const s = findService(m[1]); checkRev(s, b.rev, serviceView)
      for (const k of ['title', 'notes', 'date', 'time']) if (b[k] !== undefined) s[k] = b[k]
      s.rev++; save(); return serviceView(s)
    }],
    ['PUT', /^\/services\/([^/]+)\/slots\/(.+)$/, (m, b) => {
      leaderOnly(who()); const s = findService(m[1]); const role = decodeURIComponent(m[2])
      if (!ROLES.includes(role)) fail(400, "That isn't one of the team roles.")
      checkRev(s, b.rev, serviceView)
      if (b.person_id) {
        const p = db.people.find(x => x.id === b.person_id) || fail(404, "That person isn't on the team list.")
        if (isAway(p.id, s.date)) fail(409, `${p.name} is away that day.`, { current: serviceView(s) })
        if (!p.roles.includes(role)) fail(400, `${p.name} doesn't play ${role}.`)
        s.slots[role] = p.id
      } else s.slots[role] = null
      s.rev++; save(); return serviceView(s)
    }],
    ['PUT', /^\/me\/away\/(\d{4}-\d{2}-\d{2})$/, (m, b, q) => setAway(m[1], q, true)],
    ['DELETE', /^\/me\/away\/(\d{4}-\d{2}-\d{2})$/, (m, b, q) => setAway(m[1], q, false)],
    ['GET', /^\/songs$/, () => db.songs.map(s => ({ ...s }))],
    ['POST', /^\/songs$/, (m, b) => {
      leaderOnly(who()); if (!b.title) fail(400, 'Give the song a title.')
      const s = { id: nid('song'), title: b.title, artist: b.artist || '', key: b.key || '', bpm: b.bpm ? +b.bpm : null, chart: b.chart || '', video: b.video || '', notes: b.notes || '', last_used: null, rev: 1 }
      db.songs.push(s); save(); return { ...s }
    }],
    ['PATCH', /^\/songs\/([^/]+)$/, (m, b) => {
      leaderOnly(who()); const s = db.songs.find(x => x.id === m[1]) || fail(404, "That song isn't in the list."); checkRev(s, b.rev)
      for (const k of ['title', 'artist', 'key', 'bpm', 'chart', 'video', 'notes']) if (b[k] !== undefined) s[k] = b[k]
      s.rev++; save(); return { ...s }
    }],
    ['DELETE', /^\/songs\/([^/]+)$/, (m) => { leaderOnly(who()); const i = db.songs.findIndex(x => x.id === m[1]); if (i < 0) fail(404, "That song isn't in the list."); db.songs.splice(i, 1); for (const s of db.services) s.set = s.set.filter(e => e.song_id !== m[1]); save(); return { ok: true } }],
    ['PUT', /^\/services\/([^/]+)\/set$/, (m, b) => {
      leaderOnly(who()); const s = findService(m[1]); checkRev(s, b.rev, serviceView)
      if (!Array.isArray(b.entries)) fail(400, 'Send the set list as a list.')
      s.set = b.entries.map(e => ({ song_id: e.song_id, key: e.key || '', lead_person_id: e.lead_person_id || null, note: e.note || '' }))
      for (const e of s.set) { const song = db.songs.find(x => x.id === e.song_id); if (song && (!song.last_used || song.last_used < s.date)) song.last_used = s.date }
      s.rev++; save(); return serviceView(s)
    }],
    ['GET', /^\/channels$/, () => ({ rev: db.channels_rev, channels: db.channels.map(c => ({ ...c })) })],
    ['PUT', /^\/channels$/, (m, b) => {
      soundOrLeader(who()); if (b.rev !== db.channels_rev) fail(409, "Someone changed this just now. Here's the latest.", { current: { rev: db.channels_rev, channels: db.channels } })
      db.channels = b.channels.map((c, i) => ({ id: c.id || nid('ch'), ch: c.ch ?? i + 1, src: c.src || '', inp: c.inp || '', note: c.note || '' }))
      db.channels_rev++; save(); return { rev: db.channels_rev, channels: db.channels.map(c => ({ ...c })) }
    }],
    ['GET', /^\/desk$/, () => db.desk.map(n => ({ ...n, name: (db.people.find(p => p.id === n.person_id) || { name: 'Leader' }).name })).reverse()],
    ['POST', /^\/desk$/, (m, b) => {
      const w = need(who()); if (!b.text || !b.text.trim()) fail(400, 'Write the note first.')
      const n = { id: nid('note'), person_id: w.leader ? null : w.id, text: b.text.trim(), created: new Date().toISOString(), resolved: 0, rev: 1 }
      db.desk.push(n); save(); return { ...n, name: w.leader ? 'Leader' : w.name }
    }],
    ['PATCH', /^\/desk\/([^/]+)$/, (m, b) => {
      soundOrLeader(who()); const n = db.desk.find(x => x.id === m[1]) || fail(404, 'That note is gone.')
      if (b.resolved !== undefined) n.resolved = b.resolved ? 1 : 0; n.rev++; save(); return { ...n }
    }],
    ['GET', /^\/people$/, () => { const w = need(who()); return db.people.map(p => personView(p, !!w.leader)) }],
    ['POST', /^\/people$/, (m, b) => {
      leaderOnly(who()); if (!b.name) fail(400, 'Give the person a name.')
      const p = { id: nid('p'), name: b.name, roles: (b.roles || []).filter(r => ROLES.includes(r)), token: 'new-' + Math.random().toString(36).slice(2, 10), phone: b.phone || '', is_leader: 0 }
      db.people.push(p); save(); return personView(p, true)
    }],
    ['DELETE', /^\/people\/([^/]+)$/, (m) => {
      leaderOnly(who()); const i = db.people.findIndex(p => p.id === m[1]); if (i < 0) fail(404, "That person isn't on the team list.")
      const pid = db.people[i].id; db.people.splice(i, 1)
      for (const s of db.services) for (const r of ROLES) if (s.slots[r] === pid) { s.slots[r] = null; s.rev++ }
      db.away = db.away.filter(a => a.person_id !== pid); save(); return { ok: true }
    }],
  ]

  function setAway(date, q, on) {
    const w = need(who())
    let pid = w.leader ? q.get('person') : w.id
    if (w.leader && !pid) fail(400, 'Say which person is away.')
    const person = db.people.find(p => p.id === pid) || fail(404, "That person isn't on the team list.")
    const unassigned = []
    if (on) {
      if (!isAway(pid, date)) db.away.push({ person_id: pid, date })
      for (const s of db.services) if (s.date === date) for (const r of ROLES) if (s.slots[r] === pid) { s.slots[r] = null; s.rev++; unassigned.push(`${r} on ${date}`) }
    } else db.away = db.away.filter(a => !(a.person_id === pid && a.date === date))
    save()
    const out = { away: db.away.filter(a => a.person_id === pid).map(a => a.date).sort() }
    if (unassigned.length) out.unassigned = unassigned
    return out
  }

  async function request(method, path, body) {
    load()
    await new Promise(r => setTimeout(r, 30)) // a little latency so "Saving…" states are real
    const [p, qs] = path.split('?'); const q = new URLSearchParams(qs || '')
    for (const [mm, re, fn] of routes) { const m = mm === method && p.match(re); if (m) return JSON.parse(JSON.stringify(fn(m, body || {}, q))) }
    fail(404, "That page isn't part of the rota.")
  }
  return {
    base: 'mock', mock: true, today: todayStr,
    setToken(t) { token = t || null },
    get: (p) => request('GET', p), post: (p, b) => request('POST', p, b), put: (p, b) => request('PUT', p, b), patch: (p, b) => request('PATCH', p, b), del: (p) => request('DELETE', p),
    _reset() { db = seed(); save() },
  }
}
