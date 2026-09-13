import { ROLES, notFound } from './util.js'

// Build <service view> rows for a list of services in one pass (few queries, no N+1 per slot).
export async function serviceViews (db, services, { withPhones = false } = {}) {
  if (!services.length) return []
  const ids = services.map(s => s.id)
  const marks = ids.map(() => '?').join(',')
  const dates = [...new Set(services.map(s => s.date))]
  const dmarks = dates.map(() => '?').join(',')

  const [asg, set, away, edits] = await Promise.all([
    db.prepare(`SELECT a.service_id, a.role, a.person_id, p.name FROM assignments a JOIN people p ON p.id = a.person_id WHERE a.service_id IN (${marks})`).bind(...ids).all(),
    db.prepare(`SELECT e.*, s.title, s.artist, s.bpm, s.chart, s.video, p.name AS lead_name FROM set_entries e JOIN songs s ON s.id = e.song_id LEFT JOIN people p ON p.id = e.lead_person_id WHERE e.service_id IN (${marks}) ORDER BY e.position`).bind(...ids).all(),
    db.prepare(`SELECT a.person_id, a.date, p.name FROM away a JOIN people p ON p.id = a.person_id WHERE a.date IN (${dmarks}) ORDER BY p.name`).bind(...dates).all(),
    db.prepare(`SELECT service_id, what, by_name, by_title, at FROM edits WHERE service_id IN (${marks}) ORDER BY at DESC`).bind(...ids).all()
  ])

  return services.map(s => {
    const slots = {}
    for (const r of ROLES) slots[r] = null
    for (const a of asg.results) if (a.service_id === s.id) slots[a.role] = { person_id: a.person_id, name: a.name }
    const setRows = set.results.filter(e => e.service_id === s.id).map(e => ({
      id: e.id,
      position: e.position,
      song: { id: e.song_id, title: e.title, artist: e.artist, bpm: e.bpm, chart: e.chart, video: e.video },
      key: e.key,
      lead_person_id: e.lead_person_id,
      lead_name: e.lead_name,
      note: e.note
    }))
    const awayRows = away.results.filter(a => a.date === s.date)
    return {
      id: s.id, date: s.date, time: s.time, kind: s.kind, title: s.title, notes: s.notes, rev: s.rev,
      slots, set: setRows,
      away_names: awayRows.map(a => a.name),
      away_ids: awayRows.map(a => a.person_id),
      last_edit: s.last_edit_by ? { by: s.last_edit_by, title: s.last_edit_title, at: s.last_edit_at } : null,
      edits: edits.results.filter(e => e.service_id === s.id).slice(0, 5).map(e => ({ what: e.what, by: e.by_name, title: e.by_title, at: e.at }))
    }
  })
}

export async function getService (db, id) {
  const s = await db.prepare('SELECT * FROM services WHERE id = ?').bind(id).first()
  if (!s) throw notFound('That service')
  return s
}

export async function serviceView (db, id) {
  const [v] = await serviceViews(db, [await getService(db, id)])
  return v
}

export async function upcoming (db, from, limit) {
  const r = await db.prepare('SELECT * FROM services WHERE date >= ? ORDER BY date, time LIMIT ?').bind(from, limit).all()
  return serviceViews(db, r.results)
}

export async function bumpRev (db, id) {
  await db.prepare('UPDATE services SET rev = rev + 1 WHERE id = ?').bind(id).run()
}

export function publicPerson (p) {
  return { id: p.id, name: p.name, roles: typeof p.roles === 'string' ? JSON.parse(p.roles) : p.roles }
}
