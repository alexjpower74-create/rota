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
