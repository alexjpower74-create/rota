// Rota Worker — implements docs/API.md. Plain sentences in every error; every write carries rev.
import { ROLES, KINDS, HttpError, bad, notFound, json, CORS, id, token, now, today, isDate, isTime, prettyDate, readJson, requireRev } from './util.js'
import { whoIs, needToken, needLeader, needLeaderOrSound, editorOf } from './auth.js'
import { serviceViews, serviceView, getService, upcoming, bumpRev, publicPerson } from './views.js'

const routes = []
const route = (method, pattern, handler) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '/?$'), handler })

route('GET', '/health', () => json({ ok: true }))

// ---------- who is editing ----------
const TITLES = ['worship leader', 'pastor']
async function logEdit (db, req, who, serviceId, what) {
  const ed = await editorOf(req, db, who)
  const at = now()
  await db.prepare('INSERT INTO edits(id, service_id, what, by_id, by_name, by_title, at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id(), serviceId, what, ed.id, ed.name, ed.title, at).run()
  if (serviceId) await db.prepare('UPDATE services SET last_edit_by = ?, last_edit_title = ?, last_edit_at = ? WHERE id = ?').bind(ed.name, ed.title, at, serviceId).run()
  return ed
}
route('GET', '/editors', async ({ db, who }) => {
  needLeader(who)
  const r = await db.prepare("SELECT id, name, title, is_leader FROM people WHERE title != '' OR is_leader = 1 ORDER BY name").all()
  return json(r.results.map(p => ({ id: p.id, name: p.name, title: p.title || 'worship leader' })))
})
route('POST', '/editors', async ({ db, who, req }) => {
  needLeader(who)
  const b = await readJson(req)
  const name = String(b.name || '').trim(), title = String(b.title || '').trim()
  if (!name) throw bad('Please give your name.')
  if (!TITLES.includes(title)) throw bad('Pick worship leader or pastor.')
  const existing = await db.prepare('SELECT id FROM people WHERE lower(name) = lower(?)').bind(name).first()
  let pid
  if (existing) { pid = existing.id; await db.prepare('UPDATE people SET title = ? WHERE id = ?').bind(title, pid).run() }
  else { pid = id(); await db.prepare('INSERT INTO people(id, name, roles, token, is_leader, phone, created, title) VALUES (?, ?, ?, ?, 0, ?, ?, ?)').bind(pid, name, '[]', token(), '', now(), title).run() }
  await logEdit(db, { headers: { get: () => pid } }, who, null, `${name} joined as ${title}`)
  return json({ id: pid, name, title }, 201)
})
route('GET', '/edits', async ({ db, who }) => {
  needToken(who)
  const r = await db.prepare('SELECT * FROM edits ORDER BY at DESC LIMIT 50').all()
  return json(r.results)
})

// ---------- public ----------
route('GET', '/public/next', async ({ db }) => {
  const [next] = await upcoming(db, today(), 1)
  if (!next) return json({ error: 'There is no service coming up yet.' }, 404)
  delete next.away_ids
  return json(next)
})

// ---------- me ----------
route('GET', '/me', async ({ db, who }) => {
  const { person } = needToken(who)
  const list = await upcoming(db, today(), 4)
  const away = await db.prepare('SELECT date FROM away WHERE person_id = ? ORDER BY date').bind(person.id).all()
  return json({ person: publicPerson(person), next: list[0] || null, upcoming: list, away: away.results.map(a => a.date) })
})

async function awayTarget (ctx) {
  const who = needToken(ctx.who)
  const other = ctx.url.searchParams.get('person')
  if (other && other !== who.person.id) {
    if (!who.isLeader) throw new HttpError(403, 'You can only change your own away days.')
    const p = await ctx.db.prepare('SELECT * FROM people WHERE id = ?').bind(other).first()
    if (!p) throw notFound('That person')
    return p
  }
  return who.person
}
async function awayList (db, personId) {
  const r = await db.prepare('SELECT date FROM away WHERE person_id = ? ORDER BY date').bind(personId).all()
  return r.results.map(a => a.date)
}

route('PUT', '/me/away/:date', async (ctx) => {
  const { db, params } = ctx
  if (!isDate(params.date)) throw bad('That date does not look right. Use YYYY-MM-DD.')
  const p = await awayTarget(ctx)
  await db.prepare('INSERT OR IGNORE INTO away(person_id, date) VALUES (?, ?)').bind(p.id, params.date).run()
  // Marking away un-assigns them from anything on that date.
  const hits = await db.prepare('SELECT a.service_id, a.role, s.date FROM assignments a JOIN services s ON s.id = a.service_id WHERE a.person_id = ? AND s.date = ?').bind(p.id, params.date).all()
  const unassigned = []
  for (const h of hits.results) {
    await db.prepare('DELETE FROM assignments WHERE service_id = ? AND role = ?').bind(h.service_id, h.role).run()
    await bumpRev(db, h.service_id)
    unassigned.push(`${h.role} on ${h.date}`)
  }
  const out = { away: await awayList(db, p.id) }
  if (unassigned.length) out.unassigned = unassigned
  return json(out)
})

route('DELETE', '/me/away/:date', async (ctx) => {
  const { db, params } = ctx
  if (!isDate(params.date)) throw bad('That date does not look right. Use YYYY-MM-DD.')
  const p = await awayTarget(ctx)
  await db.prepare('DELETE FROM away WHERE person_id = ? AND date = ?').bind(p.id, params.date).run()
  return json({ away: await awayList(db, p.id) })
})

// ---------- services ----------
route('GET', '/services', async ({ db, who, url }) => {
  needToken(who)
  const from = url.searchParams.get('from') || today()
  if (!isDate(from)) throw bad('That date does not look right. Use YYYY-MM-DD.')
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '8', 10) || 8, 1), 52)
  return json(await upcoming(db, from, limit))
})

route('GET', '/services/:id', async ({ db, who, params }) => {
  needToken(who)
  return json(await serviceView(db, params.id))
})

route('POST', '/services', async ({ db, who, req }) => {
  needLeader(who)
  const b = await readJson(req)
  if (!isDate(b.date)) throw bad('Please give the service a date (YYYY-MM-DD).')
  if (b.time != null && b.time !== '' && !isTime(b.time)) throw bad('Please give the time as HH:MM.')
  if (!KINDS.includes(b.kind)) throw bad('The kind must be one of: morning (am), evening (pm), practice or special.')
  const sid = id()
  await db.prepare('INSERT INTO services(id, date, time, kind, title, notes, rev) VALUES (?, ?, ?, ?, ?, ?, 1)')
    .bind(sid, b.date, b.time || '', b.kind, String(b.title || ''), String(b.notes || '')).run()
  await logEdit(db, req, who, sid, `added a service on ${b.date}`)
  return json(await serviceView(db, sid), 201)
})

route('PATCH', '/services/:id', async ({ db, who, req, params }) => {
  needLeader(who)
  const b = await readJson(req)
  const s = await getService(db, params.id)
  requireRev(b, await serviceView(db, s.id))
  const next = { title: s.title, notes: s.notes, date: s.date, time: s.time, kind: s.kind }
  for (const k of ['title', 'notes']) if (typeof b[k] === 'string') next[k] = b[k]
  if (b.date != null) { if (!isDate(b.date)) throw bad('That date does not look right. Use YYYY-MM-DD.'); next.date = b.date }
  if (b.time != null) { if (b.time !== '' && !isTime(b.time)) throw bad('Please give the time as HH:MM.'); next.time = b.time }
  if (b.kind != null) { if (!KINDS.includes(b.kind)) throw bad('The kind must be one of: am, pm, practice or special.'); next.kind = b.kind }
  await db.prepare('UPDATE services SET title = ?, notes = ?, date = ?, time = ?, kind = ?, rev = rev + 1 WHERE id = ?')
    .bind(next.title, next.notes, next.date, next.time, next.kind, s.id).run()
  if (next.date !== s.date) {
    // Anyone away on the new date can no longer be on it.
    await db.prepare('DELETE FROM assignments WHERE service_id = ? AND person_id IN (SELECT person_id FROM away WHERE date = ?)').bind(s.id, next.date).run()
  }
  await logEdit(db, req, who, s.id, 'changed the service details')
  return json(await serviceView(db, s.id))
})

route('DELETE', '/services/:id', async ({ db, who, params }) => {
  needLeader(who)
  await getService(db, params.id)
  await db.prepare('DELETE FROM services WHERE id = ?').bind(params.id).run()
  return json({ ok: true })
})

route('PUT', '/services/:id/slots/:role', async ({ db, who, req, params }) => {
  needLeader(who)
  const role = decodeURIComponent(params.role)
  if (!ROLES.includes(role)) throw bad(`"${role}" is not a role on the rota.`)
  const b = await readJson(req)
  const s = await getService(db, params.id)
  requireRev(b, await serviceView(db, s.id))
  if (b.person_id == null) {
    await db.prepare('DELETE FROM assignments WHERE service_id = ? AND role = ?').bind(s.id, role).run()
  } else {
    const p = await db.prepare('SELECT * FROM people WHERE id = ?').bind(b.person_id).first()
    if (!p) throw notFound('That person')
    // Rule: a person marked away for a date can never be assigned on it.
    const away = await db.prepare('SELECT 1 FROM away WHERE person_id = ? AND date = ?').bind(p.id, s.date).first()
    if (away) throw new HttpError(409, `${p.name} is away that day.`)
    // A role slot holds one person: upsert replaces whoever was there.
    await db.prepare('INSERT INTO assignments(service_id, role, person_id) VALUES (?, ?, ?) ON CONFLICT(service_id, role) DO UPDATE SET person_id = excluded.person_id')
      .bind(s.id, role, p.id).run()
  }
  await bumpRev(db, s.id)
  await logEdit(db, req, who, s.id, b.person_id == null ? `cleared ${role}` : `put ${(await db.prepare('SELECT name FROM people WHERE id = ?').bind(b.person_id).first()).name} on ${role}`)
  return json(await serviceView(db, s.id))
})

route('PUT', '/services/:id/set', async ({ db, who, req, params }) => {
  needLeader(who)
  const b = await readJson(req)
  const s = await getService(db, params.id)
  requireRev(b, await serviceView(db, s.id))
  if (!Array.isArray(b.entries)) throw bad('Please send the set as a list of songs.')
  const stmts = [db.prepare('DELETE FROM set_entries WHERE service_id = ?').bind(s.id)]
  let pos = 1
  for (const e of b.entries) {
    const song = await db.prepare('SELECT id, key FROM songs WHERE id = ?').bind(e.song_id).first()
    if (!song) throw notFound('One of those songs')
    if (e.lead_person_id) {
      const p = await db.prepare('SELECT id FROM people WHERE id = ?').bind(e.lead_person_id).first()
      if (!p) throw notFound('The person leading one of those songs')
    }
    stmts.push(db.prepare('INSERT INTO set_entries(id, service_id, position, song_id, key, lead_person_id, note) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(e.id || id(), s.id, pos++, song.id, String(e.key ?? song.key ?? ''), e.lead_person_id || null, String(e.note || '')))
    stmts.push(db.prepare('UPDATE songs SET last_used = ? WHERE id = ? AND last_used < ?').bind(s.date, song.id, s.date))
  }
  stmts.push(db.prepare('UPDATE services SET rev = rev + 1 WHERE id = ?').bind(s.id))
  await db.batch(stmts)
  await logEdit(db, req, who, s.id, 'changed the set list')
  return json(await serviceView(db, s.id))
})

// ---------- songs ----------
route('GET', '/songs', async ({ db, who }) => {
  needToken(who)
  const r = await db.prepare('SELECT * FROM songs ORDER BY title').all()
  return json(r.results)
})
function songFields (b, base = {}) {
  const out = { ...base }
  for (const k of ['title', 'artist', 'key', 'chart', 'video', 'notes']) if (typeof b[k] === 'string') out[k] = b[k].trim()
  if (b.bpm !== undefined) {
    if (b.bpm === null || b.bpm === '') out.bpm = null
    else { const n = Number(b.bpm); if (!Number.isInteger(n) || n < 20 || n > 300) throw bad('BPM should be a whole number between 20 and 300.'); out.bpm = n }
  }
  if (!out.title) throw bad('Every song needs a title.')
  return out
}
route('POST', '/songs', async ({ db, who, req }) => {
  needLeader(who)
  const f = songFields(await readJson(req), { artist: '', key: '', bpm: null, chart: '', video: '', notes: '' })
  const sid = id()
  await db.prepare('INSERT INTO songs(id, title, artist, key, bpm, chart, video, notes, last_used, rev) VALUES (?, ?, ?, ?, ?, ?, ?, ?, "", 1)')
    .bind(sid, f.title, f.artist, f.key, f.bpm, f.chart, f.video, f.notes).run()
  await logEdit(db, req, who, null, `added the song ${String(b.title || '').trim()}`); return json(await db.prepare('SELECT * FROM songs WHERE id = ?').bind(sid).first(), 201)
})
route('PATCH', '/songs/:id', async ({ db, who, req, params }) => {
  needLeader(who)
  const b = await readJson(req)
  const song = await db.prepare('SELECT * FROM songs WHERE id = ?').bind(params.id).first()
  if (!song) throw notFound('That song')
  requireRev(b, song)
  const f = songFields(b, song)
  await db.prepare('UPDATE songs SET title = ?, artist = ?, key = ?, bpm = ?, chart = ?, video = ?, notes = ?, rev = rev + 1 WHERE id = ?')
    .bind(f.title, f.artist, f.key, f.bpm, f.chart, f.video, f.notes, song.id).run()
  await logEdit(db, req, who, null, `edited the song ${f.title}`)
  return json(await db.prepare('SELECT * FROM songs WHERE id = ?').bind(song.id).first())
})
route('DELETE', '/songs/:id', async ({ db, who, params }) => {
  needLeader(who)
  const song = await db.prepare('SELECT id FROM songs WHERE id = ?').bind(params.id).first()
  if (!song) throw notFound('That song')
  await db.prepare('DELETE FROM songs WHERE id = ?').bind(song.id).run()
  await logEdit(db, req, who, null, 'removed a song')
  return json({ ok: true })
})

// ---------- channels ----------
async function channelList (db) {
  const [rows, rev] = await Promise.all([
    db.prepare('SELECT * FROM channels ORDER BY ch').all(),
    db.prepare("SELECT value FROM meta WHERE key = 'channels_rev'").first()
  ])
  return { rev: Number(rev?.value || 1), channels: rows.results }
}
route('GET', '/channels', async ({ db, who }) => { needToken(who); return json(await channelList(db)) })
route('PUT', '/channels', async ({ db, who, req }) => {
  needLeaderOrSound(who)
  const b = await readJson(req)
  const cur = await channelList(db)
  requireRev(b, cur)
  if (!Array.isArray(b.channels)) throw bad('Please send the channel list.')
  const stmts = [db.prepare('DELETE FROM channels')]
  let n = 1
  for (const c of b.channels) {
    const ch = Number.isInteger(c.ch) ? c.ch : n
    stmts.push(db.prepare('INSERT INTO channels(id, ch, src, inp, note) VALUES (?, ?, ?, ?, ?)').bind(c.id || id(), ch, String(c.src || ''), String(c.inp || ''), String(c.note || '')))
    n++
  }
  stmts.push(db.prepare("UPDATE meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'channels_rev'"))
  await db.batch(stmts)
  return json(await channelList(db))
})

// ---------- desk notes ----------
route('GET', '/desk', async ({ db, who }) => {
  needToken(who)
  const r = await db.prepare('SELECT n.id, n.text, n.created, n.resolved, n.person_id, p.name AS by_name FROM desk_notes n LEFT JOIN people p ON p.id = n.person_id ORDER BY n.resolved, n.created DESC').all()
  return json(r.results.map(n => ({ ...n, resolved: n.resolved === 1 })))
})
route('POST', '/desk', async ({ db, who, req }) => {
  const { person } = needToken(who)
  const b = await readJson(req)
  const text = String(b.text || '').trim()
  if (!text) throw bad('Please write something in the note.')
  if (text.length > 1000) throw bad('Keep the note under 1000 characters.')
  const nid = id()
  await db.prepare('INSERT INTO desk_notes(id, person_id, text, created, resolved) VALUES (?, ?, ?, ?, 0)').bind(nid, person.id, text, now()).run()
  return json({ id: nid, person_id: person.id, by_name: person.name, text, created: now(), resolved: false }, 201)
})
route('PATCH', '/desk/:id', async ({ db, who, req, params }) => {
  needLeaderOrSound(who)
  const b = await readJson(req)
  const n = await db.prepare('SELECT * FROM desk_notes WHERE id = ?').bind(params.id).first()
  if (!n) throw notFound('That note')
  const resolved = b.resolved === undefined ? 1 : (b.resolved ? 1 : 0)
  await db.prepare('UPDATE desk_notes SET resolved = ? WHERE id = ?').bind(resolved, n.id).run()
  return json({ ...n, resolved: resolved === 1 })
})

// ---------- people ----------
route('GET', '/people', async ({ db, who }) => {
  const w = needToken(who)
  const r = await db.prepare('SELECT * FROM people ORDER BY name').all()
  const link = (p) => `/#/${p.is_leader ? 'lead' : 'me'}/${p.token}`
  return json(r.results.map(p => w.isLeader
    ? { ...publicPerson(p), phone: p.phone, is_leader: p.is_leader === 1, token: p.token, link: link(p), created: p.created }
    : publicPerson(p)))
})
route('POST', '/people', async ({ db, who, req }) => {
  needLeader(who)
  const b = await readJson(req)
  const name = String(b.name || '').trim()
  if (!name) throw bad('Every person needs a name.')
  const roles = Array.isArray(b.roles) ? b.roles : []
  const badRole = roles.find(r => !ROLES.includes(r))
  if (badRole) throw bad(`"${badRole}" is not a role on the rota.`)
  const pid = id(), tok = token()
  await db.prepare('INSERT INTO people(id, name, roles, token, is_leader, phone, created) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(pid, name, JSON.stringify(roles), tok, b.is_leader ? 1 : 0, String(b.phone || ''), now()).run()
  return json({ id: pid, name, roles, phone: String(b.phone || ''), is_leader: !!b.is_leader, token: tok, link: `/#/${b.is_leader ? 'lead' : 'me'}/${tok}` }, 201)
})
route('PATCH', '/people/:id', async ({ db, who, req, params }) => {
  needLeader(who)
  const b = await readJson(req)
  const p = await db.prepare('SELECT * FROM people WHERE id = ?').bind(params.id).first()
  if (!p) throw notFound('That person')
  const name = typeof b.name === 'string' && b.name.trim() ? b.name.trim() : p.name
  const roles = Array.isArray(b.roles) ? b.roles : JSON.parse(p.roles)
  const badRole = roles.find(r => !ROLES.includes(r))
  if (badRole) throw bad(`"${badRole}" is not a role on the rota.`)
  const phone = typeof b.phone === 'string' ? b.phone : p.phone
  await db.prepare('UPDATE people SET name = ?, roles = ?, phone = ? WHERE id = ?').bind(name, JSON.stringify(roles), phone, p.id).run()
  return json({ id: p.id, name, roles, phone, is_leader: p.is_leader === 1, token: p.token })
})
route('DELETE', '/people/:id', async ({ db, who, params }) => {
  const w = needLeader(who)
  if (w.person.id === params.id) throw bad('You cannot remove yourself.')
  const p = await db.prepare('SELECT id FROM people WHERE id = ?').bind(params.id).first()
  if (!p) throw notFound('That person')
  // Deleting a person clears their slots (explicit, not relying on FK pragma being on).
  const touched = await db.prepare('SELECT DISTINCT service_id FROM assignments WHERE person_id = ?').bind(p.id).all()
  await db.batch([
    db.prepare('DELETE FROM assignments WHERE person_id = ?').bind(p.id),
    db.prepare('DELETE FROM away WHERE person_id = ?').bind(p.id),
    db.prepare('UPDATE set_entries SET lead_person_id = NULL WHERE lead_person_id = ?').bind(p.id),
    db.prepare('UPDATE desk_notes SET person_id = NULL WHERE person_id = ?').bind(p.id),
    db.prepare('DELETE FROM people WHERE id = ?').bind(p.id),
    ...touched.results.map(t => db.prepare('UPDATE services SET rev = rev + 1 WHERE id = ?').bind(t.service_id))
  ])
  return json({ ok: true })
})

// ---------- dispatch ----------
export default {
  async fetch (req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    const url = new URL(req.url)
    try {
      for (const r of routes) {
        if (r.method !== req.method) continue
        const m = r.re.exec(url.pathname)
        if (!m) continue
        const who = await whoIs(req, env.DB)
        return await r.handler({ req, env, db: env.DB, url, who, params: m.groups || {} })
      }
      return json({ error: 'There is nothing at that address.' }, 404)
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, ...e.extra }, e.status)
      console.error(e)
      return json({ error: 'Something went wrong on our side. Please try again.' }, 500)
    }
  }
}
