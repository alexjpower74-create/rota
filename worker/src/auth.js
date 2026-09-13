import { HttpError } from './util.js'

// Returns { person, isLeader } or null when there is no (or an unknown) token.
export async function whoIs (req, db) {
  const h = req.headers.get('authorization') || ''
  const m = /^Bearer\s+(\S+)$/i.exec(h)
  if (!m) return null
  const person = await db.prepare('SELECT * FROM people WHERE token = ?').bind(m[1]).first()
  if (!person) throw new HttpError(401, 'That link is not recognised. Ask the leader for a fresh one.')
  person.roles = JSON.parse(person.roles || '[]')
  return { person, isLeader: person.is_leader === 1 }
}

export function needToken (who) {
  if (!who) throw new HttpError(401, 'You need your personal link to see this.')
  return who
}
export function needLeader (who) {
  needToken(who)
  if (!who.isLeader) throw new HttpError(403, 'Only the leader can change this.')
  return who
}
export function needLeaderOrSound (who) {
  needToken(who)
  if (!who.isLeader && !who.person.roles.includes('sound')) throw new HttpError(403, 'Only the leader or the sound team can change this.')
  return who
}

// Who is making this change: the X-Editor header names a worship leader or pastor (people.title set, or the leader
// row); without it, the leader link's own person. Every write on the rota is stamped with this.
export async function editorOf (req, db, who) {
  const hid = req.headers.get('x-editor') || ''
  if (hid) {
    const p = await db.prepare('SELECT id, name, title, is_leader FROM people WHERE id = ?').bind(hid).first()
    if (p && (p.title || p.is_leader === 1)) return { id: p.id, name: p.name, title: p.title || (p.is_leader ? 'worship leader' : '') }
  }
  if (who && who.person) return { id: who.person.id, name: who.person.name, title: who.person.title || (who.isLeader ? 'worship leader' : '') }
  return { id: '', name: 'Unknown', title: '' }
}
