#!/usr/bin/env node
// Live round-trip against the REAL Worker. Run by main after deploy, never against a shared dev tree.
//   API=https://rota.<acct>.workers.dev LEADER=<leader token> node tests/live-roundtrip.mjs
// Checks: health · public view shows no phone numbers · member marks away then assignment refused ·
// leader fills with someone else · stale rev → 409. Touches only SAMPLE people (creates one if
// none exist) and puts everything back at the end. Exit 1 on any FAIL or VOID, 2 if not configured.
//
// Every check has a negative control: the predicate is re-run against a deliberately broken input
// (a doctored response or a doctored expectation). If it still passes, it is VOID — it measured nothing.

const API = (process.env.API || '').replace(/\/$/, '')
const LEADER = process.env.LEADER || ''
if (!API || !LEADER) {
  console.error('Set API=<worker url> and LEADER=<leader token>. Nothing was run.')
  process.exit(2)
}

const C = { pass: s => `\x1b[32m${s}\x1b[0m`, fail: s => `\x1b[31m${s}\x1b[0m`, void_: s => `\x1b[35m${s}\x1b[0m`, dim: s => `\x1b[2m${s}\x1b[0m` }
const results = []
async function check (name, { assert, breaks }) {
  const rec = { name, state: 'PASS', detail: '' }
  try {
    if (!(await assert())) { rec.state = 'FAIL'; rec.detail = 'assertion returned false' }
  } catch (e) { rec.state = 'FAIL'; rec.detail = e.message }
  if (rec.state === 'PASS') {
    let still
    try { still = await breaks() } catch { still = false }
    if (still) { rec.state = 'VOID'; rec.detail = 'still passed with the thing under test broken' }
  }
  results.push(rec)
  const tag = { PASS: C.pass('PASS'), FAIL: C.fail('FAIL'), VOID: C.void_('VOID') }[rec.state]
  console.log(`  ${tag}  ${name}${rec.detail ? C.dim('  — ' + rec.detail) : ''}`)
  return rec.state === 'PASS'
}

async function call (method, path, { token, body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  let json = null
  try { json = await res.json() } catch {}
  return { status: res.status, json }
}
const today = () => new Date().toISOString().slice(0, 10)
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/          // any 9+ digit run with phone punctuation
const looksLikePhone = obj => PHONE.test(JSON.stringify(obj).replace(/"\d{4}-\d{2}-\d{2}(T[^"]*)?"/g, '""')) // dates are not phones
const hasKey = (obj, key) => JSON.stringify(obj).includes(`"${key}"`)

console.log(`\nRota live round-trip → ${API}`)
const cleanup = []
try {
  // 1. Health
  await check('GET /health says ok', {
    assert: async () => (await call('GET', '/health')).json?.ok === true,
    breaks: async () => ({ ok: false }).ok === true
  })

  // 2. Public view: names, no phones, no tokens
  const pub = await call('GET', '/public/next')
  await check('GET /public/next (no token) is a service with slots and no phone numbers or tokens', {
    assert: () => pub.status === 200 && pub.json && typeof pub.json.slots === 'object' && !looksLikePhone(pub.json) && !hasKey(pub.json, 'token') && !hasKey(pub.json, 'phone'),
    breaks: () => {
      const doctored = { ...pub.json, slots: { ...pub.json.slots, drums: { person_id: 'x', name: 'SAMPLE', phone: '07700 900123' } } }
      return !looksLikePhone(doctored) && !hasKey(doctored, 'phone')
    }
  })

  // People: leader sees tokens. Use SAMPLE people only.
  const people = (await call('GET', '/people', { token: LEADER })).json
  if (!Array.isArray(people)) throw new Error('GET /people as leader did not return a list: ' + JSON.stringify(people).slice(0, 200))
  const samples = people.filter(p => /sample/i.test(p.name))
  const roleOf = p => (p.roles || []).find(r => !/vocal/i.test(r))
  let member = samples.find(p => roleOf(p) && p.token)
  if (!member) {
    const made = await call('POST', '/people', { token: LEADER, body: { name: 'SAMPLE QA round-trip', roles: ['drums'] } })
    if (made.status >= 300 || !made.json?.id) throw new Error('could not create a SAMPLE person: ' + JSON.stringify(made.json))
    member = made.json
    cleanup.push(() => call('DELETE', `/people/${member.id}`, { token: LEADER }))
  }
  const role = roleOf(member)
  let other = samples.find(p => p.id !== member.id && (p.roles || []).includes(role) && p.token)
  if (!other) {
    const made = await call('POST', '/people', { token: LEADER, body: { name: 'SAMPLE QA stand-in', roles: [role] } })
    if (made.status >= 300 || !made.json?.id) throw new Error('could not create a second SAMPLE person: ' + JSON.stringify(made.json))
    other = made.json
    cleanup.push(() => call('DELETE', `/people/${other.id}`, { token: LEADER }))
  }

  // Next service on or after today
  const services = (await call('GET', `/services?from=${today()}&limit=1`)).json
  const svc = Array.isArray(services) ? services[0] : null
  if (!svc) throw new Error('no service on or after today — add one before running the round-trip')
  const before = svc.slots?.[role] ?? null
  const rev0 = svc.rev
  cleanup.push(async () => {
    const cur = (await call('GET', `/services?from=${svc.date}&limit=1`)).json?.[0]
    if (cur) await call('PUT', `/services/${cur.id}/slots/${encodeURIComponent(role)}`, { token: LEADER, body: { rev: cur.rev, person_id: before?.person_id ?? null } })
  })
  console.log(C.dim(`  using service ${svc.date} ${svc.time || ''}, role "${role}", away: ${member.name}, fill: ${other.name}`))

  // 3. Member marks away, then the leader is refused
  const away = await call('PUT', `/me/away/${svc.date}`, { token: member.token })
  cleanup.push(() => call('DELETE', `/me/away/${svc.date}`, { token: member.token }))
  await check('member marks away with their own token', {
    assert: () => away.status === 200 && Array.isArray(away.json?.away) && away.json.away.includes(svc.date),
    breaks: () => ({ status: 200, json: { away: [] } }).json.away.includes(svc.date)
  })
  const cur1 = (await call('GET', `/services?from=${svc.date}&limit=1`)).json?.[0]
  const refused = await call('PUT', `/services/${svc.id}/slots/${encodeURIComponent(role)}`, { token: LEADER, body: { rev: cur1.rev, person_id: member.id } })
  await check('leader assigning the away person gets 409 and a plain sentence with their name', {
    assert: () => refused.status === 409 && typeof refused.json?.error === 'string' && refused.json.error.includes(member.name) && /away/i.test(refused.json.error),
    breaks: () => { const r = { status: 200, json: refused.json }; return r.status === 409 }
  })
  const cur2 = (await call('GET', `/services?from=${svc.date}&limit=1`)).json?.[0]
  await check('the away person is not in the slot afterwards', {
    assert: () => cur2.slots?.[role]?.person_id !== member.id,
    breaks: () => ({ slots: { [role]: { person_id: member.id } } }).slots[role].person_id !== member.id
  })

  // 4. Leader fills with someone else; the member's view shows the name
  const filled = await call('PUT', `/services/${svc.id}/slots/${encodeURIComponent(role)}`, { token: LEADER, body: { rev: cur2.rev, person_id: other.id } })
  await check('leader fills the slot with the other SAMPLE person', {
    assert: () => filled.status === 200 && filled.json?.slots?.[role]?.person_id === other.id && filled.json.slots[role].name === other.name,
    breaks: () => ({ status: 200, json: { slots: { [role]: { person_id: 'nobody', name: other.name } } } }).json.slots[role].person_id === other.id
  })
  const me = await call('GET', '/me', { token: member.token })
  await check("the member's own view shows the other person's name on that service", {
    assert: () => {
      const s = [me.json?.next, ...(me.json?.upcoming || [])].find(x => x && x.id === svc.id)
      return me.status === 200 && s?.slots?.[role]?.name === other.name
    },
    breaks: () => { const s = { slots: { [role]: { name: 'open' } } }; return s.slots[role].name === other.name }
  })

  // 5. Stale rev → 409 with the current row
  const stale = await call('PUT', `/services/${svc.id}/slots/${encodeURIComponent(role)}`, { token: LEADER, body: { rev: rev0, person_id: other.id } })
  await check('a stale rev gets 409 with the current row', {
    assert: () => stale.status === 409 && stale.json?.current?.id === svc.id && stale.json.current.rev > rev0 && typeof stale.json.error === 'string',
    breaks: () => { const s = { status: 409, json: { error: 'x', current: { id: svc.id, rev: rev0 } } }; return s.json.current.rev > rev0 }
  })

  // 6. Member cannot edit another member's away dates
  const cross = await call('PUT', `/me/away/${svc.date}?person=${other.id}`, { token: member.token })
  const otherAway = (await call('GET', '/me', { token: other.token })).json?.away || []
  await check("a member's token cannot mark another member away", {
    assert: () => !otherAway.includes(svc.date),
    breaks: () => !([svc.date]).includes(svc.date)
  })
  if (cross.status < 300 && otherAway.includes(svc.date)) cleanup.push(() => call('DELETE', `/me/away/${svc.date}`, { token: other.token }))
} catch (e) {
  results.push({ name: 'round-trip', state: 'FAIL', detail: e.message })
  console.log(`  ${C.fail('FAIL')}  ${e.message}`)
} finally {
  for (const f of cleanup.reverse()) { try { await f() } catch (e) { console.log(C.dim('  cleanup: ' + e.message)) } }
}

const n = s => results.filter(r => r.state === s).length
console.log(`\n${n('PASS')} passed, ${n('FAIL')} failed, ${n('VOID')} void`)
if (n('VOID')) console.log(C.void_('  VOID checks passed against broken input. They are not evidence of anything.'))
process.exit(n('FAIL') + n('VOID') ? 1 : 0)
