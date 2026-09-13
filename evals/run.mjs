#!/usr/bin/env node
// Rota — "is it right" evals.
//
//   node evals/run.mjs --api http://localhost:6002 --leader <leader token> [--snapshot data/spc-state-2026-09-13.json]
//
// After an import, checks the SPC snapshot survived (songs with key + BPM, services with their
// set in order, the 16 channels in order), then checks the rota rules live against the Worker
// (away → assign refused; assign someone else → the member's own view shows them; stale rev → 409).
// Prints a table. Exit 0 all good, 1 on any miss, 2 if the snapshot file is missing or unreadable.
//
// Everything it writes it undoes: it only ever touches SAMPLE people it created itself, and it
// puts the slot it borrowed back the way it found it.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROLE_CODES = {
  lg: 'lead guitar', rg: 'rhythm guitar', ba: 'bass', dr: 'drums', ke: 'keys',
  v1: 'vocals 1', v2: 'vocals 2', v3: 'vocals 3', so: 'sound', pr: 'projection',
};
const KIND = { am: 'am', pm: 'pm', prac: 'practice', special: 'special' };

// ---------- args ----------
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true;
}
const API = String(args.api || process.env.API || '').replace(/\/$/, '');
const LEADER = String(args.leader || process.env.LEADER || '');
const SNAPSHOT = resolve(String(args.snapshot || 'data/spc-state-2026-09-13.json'));
if (!API || !LEADER) {
  console.error('usage: node evals/run.mjs --api <url> --leader <token> [--snapshot <file>]');
  process.exit(1);
}

let snap;
try {
  snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  if (!Array.isArray(snap.songs) || !Array.isArray(snap.services) || !Array.isArray(snap.channels)) throw new Error('not a snapshot');
} catch (e) {
  console.error(`Snapshot missing or unreadable: ${SNAPSHOT} (${e.message})`);
  process.exit(2);
}

// ---------- results ----------
const rows = [];
let misses = 0;
function record(group, name, ok, detail = '') {
  rows.push({ group, name, ok, detail });
  if (!ok) misses++;
}
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// ---------- http ----------
async function call(method, path, { token = LEADER, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    return { status: 0, json: null, error: e.message };
  }
  let json = null;
  try { json = await res.json(); } catch { /* not json */ }
  return { status: res.status, json };
}

// ---------- 1. health ----------
{
  const r = await call('GET', '/health', { token: null });
  record('health', 'GET /health is ok', r.status === 200 && r.json?.ok === true, r.error || `status ${r.status}`);
  if (r.status !== 200) { print(); process.exit(1); }
}

// ---------- 2. songs ----------
const songs = (await call('GET', '/songs')).json;
const songByTitle = new Map((Array.isArray(songs) ? songs : []).map(s => [s.title, s]));
for (const s of snap.songs) {
  const got = songByTitle.get(s.title);
  if (!got) { record('songs', s.title, false, 'missing'); continue; }
  const okKey = got.key === s.key;
  const okBpm = Number(got.bpm) === Number(s.bpm);
  record('songs', s.title, okKey && okBpm,
    okKey && okBpm ? `${s.key} ${s.bpm}` : `expected ${s.key} ${s.bpm}, got ${got.key} ${got.bpm}`);
}
record('songs', `count ≥ ${snap.songs.length}`, songByTitle.size >= snap.songs.length, `${songByTitle.size} songs`);

// ---------- 3. services with their set in order ----------
const snapSongTitle = Object.fromEntries(snap.songs.map(s => [s.id, s.title]));
const firstDate = snap.services.map(s => s.date).sort()[0];
const services = (await call('GET', `/services?from=${firstDate}&limit=100`)).json;
const svcList = Array.isArray(services) ? services : [];
for (const s of snap.services) {
  const kind = KIND[s.type] || s.type;
  const got = svcList.find(v => v.date === s.date && (v.time || '') === (s.time || '') && v.kind === kind);
  if (!got) { record('services', `${s.date} ${s.time} ${kind}`, false, 'missing'); continue; }
  const want = s.set.map(e => [snapSongTitle[e.songId] || e.songId, e.key]);
  const have = [...(got.set || [])].sort((a, b) => a.position - b.position).map(e => [e.song?.title, e.key]);
  record('services', `${s.date} ${s.time} ${kind}`, same(want, have),
    want.length ? (same(want, have) ? `set: ${want.map(w => `${w[0]} (${w[1]})`).join(', ')}` : `expected ${JSON.stringify(want)}, got ${JSON.stringify(have)}`) : 'no set');
  // assignments from the snapshot (only real people it names)
  for (const [code, pid] of Object.entries(s.assign || {})) {
    const role = ROLE_CODES[code] || code;
    const name = snap.team.find(p => p.id === pid)?.name;
    record('services', `${s.date} ${role} = ${name}`, got.slots?.[role]?.name === name, got.slots?.[role]?.name || 'open');
  }
}

// ---------- 4. channels ----------
{
  const r = (await call('GET', '/channels', { token: null })).json;
  const list = Array.isArray(r) ? r : Array.isArray(r?.channels) ? r.channels : [];
  const want = snap.channels.map(c => [c.ch, c.src, c.inp]);
  const have = list.map(c => [c.ch, c.src, c.inp]);
  record('channels', `${snap.channels.length} channels in order`, same(want, have),
    same(want, have) ? `1–${snap.channels.length}` : `got ${have.length}: ${JSON.stringify(have).slice(0, 200)}`);
}

// ---------- 5. rota rules, live ----------
const created = [];
let borrowed = null; // { service, role, before }
try {
  const upcoming = (await call('GET', `/services?from=${today()}&limit=4`)).json;
  const service = Array.isArray(upcoming) ? upcoming[0] : null;
  if (!service) {
    record('rules', 'a service to test on', false, 'no upcoming service');
  } else {
    const role = 'bass'; // never Alexander's lead guitar slot
    borrowed = { service, role, before: service.slots?.[role]?.person_id ?? null };

    const away = (await call('POST', '/people', { body: { name: 'SAMPLE Eval Away', roles: [role] } })).json;
    const other = (await call('POST', '/people', { body: { name: 'SAMPLE Eval Other', roles: [role] } })).json;
    for (const p of [away, other]) if (p?.id) created.push(p.id);
    record('rules', 'leader can add SAMPLE people (with tokens)', !!(away?.id && away?.token && other?.id && other?.token),
      away?.id ? '' : JSON.stringify(away));

    // mark away
    const a = await call('PUT', `/me/away/${service.date}?person=${away.id}`);
    record('rules', `mark away ${service.date}`, a.status === 200 && (a.json?.away || []).includes(service.date), `status ${a.status}`);

    // the away person cannot be assigned
    let cur = (await call('GET', `/services?from=${service.date}&limit=1`)).json?.[0] || service;
    const refused = await call('PUT', `/services/${service.id}/slots/${role}`, { body: { rev: cur.rev, person_id: away.id } });
    record('rules', 'away person → assign refused with 409', refused.status === 409 && /away/i.test(refused.json?.error || ''),
      `status ${refused.status}: ${refused.json?.error || ''}`);
    cur = (await call('GET', `/services?from=${service.date}&limit=1`)).json?.[0] || cur;
    record('rules', 'slot still not the away person', cur.slots?.[role]?.person_id !== away.id, cur.slots?.[role]?.name || 'open');

    // assign someone else → member view shows them
    const ok = await call('PUT', `/services/${service.id}/slots/${role}`, { body: { rev: cur.rev, person_id: other.id } });
    record('rules', 'assign someone else → 200', ok.status === 200 && ok.json?.slots?.[role]?.person_id === other.id, `status ${ok.status}`);
    const me = await call('GET', '/me', { token: other.token });
    const shown = me.json?.next?.id === service.id ? me.json.next : (me.json?.upcoming || []).find(v => v.id === service.id);
    record('rules', "member's own view shows them on the slot", shown?.slots?.[role]?.name === other.name,
      shown ? `${role}: ${shown.slots?.[role]?.name || 'open'}` : `status ${me.status}, next=${me.json?.next?.id}`);
    const wall = await call('GET', '/public/next', { token: null });
    if (wall.json?.id === service.id) {
      record('rules', 'public view shows the same name, no phones', wall.json.slots?.[role]?.name === other.name && !JSON.stringify(wall.json).includes('"phone"'),
        wall.json.slots?.[role]?.name || 'open');
    }

    // stale rev → 409 with the current row
    const stale = await call('PATCH', `/services/${service.id}`, { body: { rev: cur.rev, notes: 'stale write from the evals' } });
    record('rules', 'stale rev → 409 with current row', stale.status === 409 && stale.json?.current?.rev > cur.rev,
      `status ${stale.status}, current.rev=${stale.json?.current?.rev}`);
  }
} catch (e) {
  record('rules', 'ran without throwing', false, e.message);
} finally {
  // put it back the way it was
  if (borrowed) {
    const cur = (await call('GET', `/services?from=${borrowed.service.date}&limit=1`)).json?.[0];
    if (cur) await call('PUT', `/services/${cur.id}/slots/${borrowed.role}`, { body: { rev: cur.rev, person_id: borrowed.before } });
  }
  for (const id of created) await call('DELETE', `/people/${id}`);
  if (created.length) {
    const people = (await call('GET', '/people')).json;
    const left = (Array.isArray(people) ? people : []).filter(p => created.includes(p.id));
    record('cleanup', 'eval SAMPLE people removed', left.length === 0, left.length ? `${left.length} left behind` : '');
  }
}

print();
process.exit(misses ? 1 : 0);

// ---------- helpers ----------
function today() { return new Date().toISOString().slice(0, 10); }
function print() {
  const w = Math.max(...rows.map(r => r.name.length), 10);
  console.log(`\nRota evals against ${API}\n`);
  console.log(`  ${'RESULT'.padEnd(6)}  ${'GROUP'.padEnd(9)}  ${'CHECK'.padEnd(w)}  DETAIL`);
  for (const r of rows) console.log(`  ${(r.ok ? 'ok' : 'MISS').padEnd(6)}  ${r.group.padEnd(9)}  ${r.name.padEnd(w)}  ${r.detail}`);
  console.log(`\n  ${rows.length - misses} ok, ${misses} miss${misses === 1 ? '' : 'es'}\n`);
}
