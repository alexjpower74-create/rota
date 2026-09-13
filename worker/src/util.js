export const ROLES = ['worship leader', 'lead guitar', 'rhythm guitar', 'acoustic guitar 1', 'acoustic guitar 2', 'acoustic guitar 3', 'bass', 'drums', 'keys', 'piano', 'vocals 1', 'vocals 2', 'vocals 3', 'sound', 'projection']
export const KINDS = ['am', 'pm', 'practice', 'special']

export class HttpError extends Error {
  constructor (status, message, extra = {}) { super(message); this.status = status; this.extra = extra }
}

export const bad = (msg) => new HttpError(400, msg)
export const notFound = (what = 'That') => new HttpError(404, `${what} was not found.`)

export function json (data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS, ...headers }
  })
}

export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-max-age': '86400'
}

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'
export function id (n = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(n))
  let s = ''
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length]
  return s
}
export const token = () => id(24)

export const now = () => new Date().toISOString()
export const today = () => new Date().toISOString().slice(0, 10)

export function isDate (s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'))
}
export function isTime (s) { return typeof s === 'string' && /^\d{2}:\d{2}$/.test(s) }

export function prettyDate (d) {
  const dt = new Date(d + 'T00:00:00Z')
  return dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
}

export async function readJson (req) {
  const t = await req.text()
  if (!t) return {}
  try { return JSON.parse(t) } catch { throw bad('That request was not valid JSON.') }
}

export function requireRev (body, row) {
  if (!Number.isInteger(body.rev)) throw bad('Please send the row\'s rev with every change.')
  if (body.rev !== row.rev) throw new HttpError(409, "Someone changed this just now. Here's the latest.", { current: row })
}
