// How the QA specs find their way into r2's mock app (`?mock=1`). Documented in docs/QA.md.
// Order of truth: window.rotaMock on the page → QA_* env vars → fail with a plain sentence (never skip).
export const MOCK = '/?mock=1'

export async function discover (page) {
  // The leader page asks who is building the rota; the QA journey answers it up front (the r2 suite covers that step).
  await page.addInitScript(() => { try { localStorage.setItem('rotaEditor', JSON.stringify({ id: 'p1', name: 'Alexander Power', title: 'worship leader' })) } catch {} })
  await page.goto(MOCK + '#/')
  await page.waitForLoadState('networkidle')
  const hook = await page.evaluate(() => globalThis.rotaMock || null)
  const env = process.env
  const leaderToken = hook?.leaderToken || env.QA_LEADER_TOKEN
  let people = hook?.people
  if (!people && env.QA_MEMBER_TOKEN) {
    people = [
      { name: env.QA_MEMBER_NAME || 'QA member', token: env.QA_MEMBER_TOKEN, roles: [env.QA_MEMBER_ROLE || 'lead guitar'] },
      { name: env.QA_OTHER_NAME || 'QA other', token: env.QA_OTHER_TOKEN || '', roles: [env.QA_MEMBER_ROLE || 'lead guitar'] }
    ]
  }
  if (!leaderToken || !people?.length) {
    throw new Error('QA cannot find the mock people. The mock app should set window.rotaMock = { leaderToken, people: [{ id, name, roles, token }] } (see docs/QA.md), or run with QA_LEADER_TOKEN and QA_MEMBER_TOKEN.')
  }
  return { leaderToken, people }
}

/** Pick a role with two SAMPLE people (so one can be away and the other can fill), avoiding vocals slots. */
export function pickPair (people) {
  const byRole = new Map()
  for (const p of people) for (const r of p.roles || []) {
    if (/vocal/i.test(r)) continue
    if (!byRole.has(r)) byRole.set(r, [])
    byRole.get(r).push(p)
  }
  for (const [role, ps] of byRole) {
    const samples = ps.filter(p => /sample/i.test(p.name) && p.token)
    if (samples.length >= 2) return { role, member: samples[0], other: samples[1] }
  }
  throw new Error('QA needs a role with at least two SAMPLE people who both have tokens (see docs/QA.md). Roles seen: ' + [...byRole.keys()].join(', '))
}

export const go = (page, hash) => page.evaluate(h => { location.hash = h }, hash)
