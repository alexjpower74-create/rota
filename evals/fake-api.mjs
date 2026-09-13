#!/usr/bin/env node
// A throwaway in-memory stand-in for the Worker, implementing just enough of docs/API.md for
// evals/run.mjs to run before r1's Worker exists. NOT the real thing; never deploy it.
//
//   node evals/fake-api.mjs --port 6102 [--snapshot data/spc-state-2026-09-13.json] [--break away|bpm|rev]
//
// --break deliberately breaks one rule so the matching eval can be shown going red:
//   away  the away check is skipped (an away person can be assigned)
//   bpm   one song is imported with the wrong BPM
//   rev   stale revs are accepted
// Prints "leader token: <token>" on start.

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[i + 1]?.startsWith('--') ? true : process.argv[++i];
const PORT = Number(args.port || 6102);
const BREAK = args.break || '';
const snap = JSON.parse(readFileSync(args.snapshot || 'data/spc-state-2026-09-13.json', 'utf8'));
const samples = JSON.parse(readFileSync('data/sample-people.json', 'utf8')).people;

const ROLES = ['lead guitar', 'rhythm guitar', 'bass', 'drums', 'keys', 'vocals 1', 'vocals 2', 'vocals 3', 'sound', 'projection'];
const CODE = { lg: 'lead guitar', rg: 'rhythm guitar', ba: 'bass', dr: 'drums', ke: 'keys', v1: 'vocals 1', v2: 'vocals 2', v3: 'vocals 3', so: 'sound', pr: 'projection' };
const KIND = { am: 'am', pm: 'pm', prac: 'practice', special: 'special' };
const tok = () => randomBytes(12).toString('base64url');
let seq = 1000;
const nid = (p) => `${p}${seq++}`;

// ---- state ----
const LEADER = tok();
const people = new Map();
for (const p of snap.team) people.set(p.id, { id: p.id, name: p.name, roles: p.roles.map(r => CODE[r] || r), phone: p.phone || '', token: tok(), is_leader: p.id === 'p1' });
for (const p of samples) people.set(p.id, { ...p, token: tok(), is_leader: false });
const songs = new Map(snap.songs.map(s => [s.id, { id: s.id, title: s.title, artist: s.artist, key: s.key, bpm: s.bpm, chart: s.chart, video: s.video, notes: s.notes, last_used: s.last, rev: 1 }]));
if (BREAK === 'bpm') songs.get('g1').bpm += 1;
const services = new Map(snap.services.map(s => [s.id, {
  id: s.id, date: s.date, time: s.time, kind: KIND[s.type] || s.type, title: s.title || '', notes: s.notes || '', rev: 1,
  slots: Object.fromEntries(Object.entries(s.assign || {}).map(([c, pid]) => [CODE[c] || c, pid])),
  set: s.set.map((e, i) => ({ position: i + 1, song_id: e.songId, key: e.key, lead_person_id: e.leadId || null, note: e.note || '' })),
}]));
const away = new Map(); // person_id -> Set(date)
let channels = { rev: 1, list: snap.channels.map(c => ({ id: c.id, ch: c.ch, src: c.src, inp: c.inp, note: c.note })) };
const desk = [];

// ---- views ----
function view(s, pub = false) {
  const slots = {};
  for (const r of ROLES) { const pid = s.slots[r]; slots[r] = pid && people.has(pid) ? { person_id: pid, name: people.get(pid).name } : null; }
  return {
    id: s.id, date: s.date, time: s.time, kind: s.kind, title: s.title, notes: s.notes, rev: s.rev, slots,
    set: s.set.map(e => ({ position: e.position, song: { id: e.song_id, title: songs.get(e.song_id)?.title, artist: songs.get(e.song_id)?.artist }, key: e.key, lead_name: people.get(e.lead_person_id)?.name || null, note: e.note })),
    away_names: [...people.values()].filter(p => away.get(p.id)?.has(s.date)).map(p => p.name),
  };
}
const sorted = () => [...services.values()].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
const today = () => new Date().toISOString().slice(0, 10);
const nextFrom = (from, n) => sorted().filter(s => s.date >= from).slice(0, n);

// ---- server ----
const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const stale = (res, row) => send(res, 409, { error: "Someone changed this just now. Here's the latest.", current: view(row) });

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname, m = req.method;
  let body = ''; for await (const c of req) body += c;
  const json = body ? JSON.parse(body) : {};
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const isLeader = token && token === LEADER;
  const me = isLeader ? null : [...people.values()].find(x => x.token === token) || null;
  const auth = () => (isLeader || me) ? true : (send(res, 401, { error: 'That link does not work any more.' }), false);
  const leaderOnly = () => isLeader ? true : (send(res, 403, { error: 'Only the leader can do that.' }), false);
  let mm;

  if (p === '/health') return send(res, 200, { ok: true });
  if (p === '/public/next') { const n = nextFrom(today(), 1)[0]; return n ? send(res, 200, view(n, true)) : send(res, 404, { error: 'No service is planned yet.' }); }
  if (p === '/me' && m === 'GET') {
    if (!me) return send(res, 401, { error: 'That link does not work any more.' });
    const up = nextFrom(today(), 4).map(s => view(s));
    return send(res, 200, { person: { id: me.id, name: me.name, roles: me.roles }, next: up[0] || null, upcoming: up, away: [...(away.get(me.id) || [])].sort() });
  }
  if (p === '/services' && m === 'GET') return send(res, 200, nextFrom(url.searchParams.get('from') || today(), Number(url.searchParams.get('limit') || 8)).map(s => view(s)));
  if (p === '/services' && m === 'POST') { if (!leaderOnly()) return; const s = { id: nid('s'), date: json.date, time: json.time || '', kind: json.kind, title: json.title || '', notes: '', rev: 1, slots: {}, set: [] }; services.set(s.id, s); return send(res, 200, view(s)); }
  if ((mm = p.match(/^\/services\/([^/]+)$/)) && m === 'PATCH') {
    if (!leaderOnly()) return; const s = services.get(mm[1]); if (!s) return send(res, 404, { error: 'No such service.' });
    if (BREAK !== 'rev' && json.rev !== s.rev) return stale(res, s);
    for (const k of ['title', 'notes', 'date', 'time']) if (k in json) s[k] = json[k];
    s.rev++; return send(res, 200, view(s));
  }
  if ((mm = p.match(/^\/services\/([^/]+)\/slots\/(.+)$/)) && m === 'PUT') {
    if (!leaderOnly()) return; const s = services.get(mm[1]); const role = decodeURIComponent(mm[2]);
    if (!s) return send(res, 404, { error: 'No such service.' });
    if (json.rev !== s.rev && BREAK !== 'rev') return stale(res, s);
    if (json.person_id) {
      const who = people.get(json.person_id); if (!who) return send(res, 404, { error: 'No such person.' });
      if (BREAK !== 'away' && away.get(who.id)?.has(s.date)) return send(res, 409, { error: `${who.name} is away that day.` });
      s.slots[role] = who.id;
    } else delete s.slots[role];
    s.rev++; return send(res, 200, view(s));
  }
  if ((mm = p.match(/^\/me\/away\/(\d{4}-\d{2}-\d{2})$/)) && (m === 'PUT' || m === 'DELETE')) {
    if (!auth()) return;
    const pid = isLeader ? url.searchParams.get('person') : me.id; if (!people.has(pid)) return send(res, 404, { error: 'No such person.' });
    if (!away.has(pid)) away.set(pid, new Set());
    const unassigned = [];
    if (m === 'PUT') { away.get(pid).add(mm[1]); for (const s of services.values()) if (s.date === mm[1]) for (const [r, who] of Object.entries(s.slots)) if (who === pid) { delete s.slots[r]; s.rev++; unassigned.push(`${r} on ${s.date}`); } }
    else away.get(pid).delete(mm[1]);
    return send(res, 200, { away: [...away.get(pid)].sort(), ...(unassigned.length ? { unassigned } : {}) });
  }
  if (p === '/songs' && m === 'GET') return send(res, 200, [...songs.values()]);
  if (p === '/channels' && m === 'GET') return send(res, 200, { rev: channels.rev, channels: channels.list });
  if (p === '/desk' && m === 'GET') return send(res, 200, desk);
  if (p === '/desk' && m === 'POST') { if (!auth()) return; const n = { id: nid('n'), person_id: me?.id || null, text: json.text, created: new Date().toISOString(), resolved: false }; desk.push(n); return send(res, 200, n); }
  if (p === '/people' && m === 'GET') { if (!auth()) return; return send(res, 200, [...people.values()].map(x => isLeader ? x : { id: x.id, name: x.name, roles: x.roles })); }
  if (p === '/people' && m === 'POST') { if (!leaderOnly()) return; const x = { id: nid('p'), name: json.name, roles: json.roles || [], phone: json.phone || '', token: tok(), is_leader: false }; people.set(x.id, x); return send(res, 200, x); }
  if ((mm = p.match(/^\/people\/([^/]+)$/)) && m === 'DELETE') {
    if (!leaderOnly()) return; people.delete(mm[1]); away.delete(mm[1]);
    for (const s of services.values()) for (const [r, who] of Object.entries(s.slots)) if (who === mm[1]) { delete s.slots[r]; s.rev++; }
    return send(res, 200, { ok: true });
  }
  send(res, 404, { error: 'Nothing here.' });
}).listen(PORT, () => {
  console.log(`fake api on http://localhost:${PORT}${BREAK ? ` (broken: ${BREAK})` : ''}`);
  console.log(`leader token: ${LEADER}`);
});
