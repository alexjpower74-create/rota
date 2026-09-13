// Rota app ↔ Worker. Plain fetch wrapper implementing docs/API.md.
// Base URL: ?api=<url> (remembered), else localStorage.rotaApiBase, else localhost:6002 in dev, else /api.

export class ApiError extends Error {
  constructor(status, body) {
    super((body && body.error) || `Request failed (${status})`)
    this.status = status
    this.current = body && body.current
  }
}

export function pickBase() {
  const q = new URLSearchParams(location.search).get('api')
  if (q) { try { localStorage.setItem('rotaApiBase', q) } catch {} ; return q }
  try { const s = localStorage.getItem('rotaApiBase'); if (s) return s } catch {}
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return 'http://localhost:6002'
  if (/\.workers\.dev$|apcosoftwaretools\.ca$/.test(location.hostname)) return 'https://rota.alexjpower74.workers.dev' // main fills the deployed Worker
  return '/api'
}

export function createApi(base = pickBase()) {
  let token = null
  async function request(method, path, body) {
    const headers = { 'Accept': 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (token) headers['Authorization'] = `Bearer ${token}`
    let res
    try {
      res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    } catch (e) {
      throw new ApiError(0, { error: "Can't reach the rota right now. Check your signal and try again." })
    }
    let data = null
    try { data = await res.json() } catch {}
    if (!res.ok) throw new ApiError(res.status, data || {})
    return data
  }
  return {
    base,
    setToken(t) { token = t || null },
    get: (p) => request('GET', p),
    post: (p, b) => request('POST', p, b),
    put: (p, b) => request('PUT', p, b),
    patch: (p, b) => request('PATCH', p, b),
    del: (p) => request('DELETE', p),
  }
}
