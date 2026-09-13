#!/usr/bin/env node
// Proves evals/run.mjs can actually fail. Runs it against the in-memory fake four times:
//   1. as-is                                  → must exit 0
//   2. expected BPM changed in a copy of the snapshot (the plan's negative control) → must exit 1
//   3. fake with the away check removed        → must exit 1
//   4. fake accepting stale revs               → must exit 1
// A control that stays green marks the whole self-check VOID and exits 1.
//
//   node evals/selfcheck.mjs

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';

const PORT = 6102;
const SCRATCH = 'evals/scratch';
mkdirSync(SCRATCH, { recursive: true });

function startFake(brk) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['evals/fake-api.mjs', '--port', String(PORT), ...(brk ? ['--break', brk] : [])], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', d => { out += d; const m = out.match(/leader token: (\S+)/); if (m) resolve({ child, leader: m[1] }); });
    child.on('exit', c => reject(new Error(`fake api exited ${c}`)));
  });
}
function runEvals(leader, snapshot, logName) {
  const r = spawnSync(process.execPath, ['evals/run.mjs', '--api', `http://localhost:${PORT}`, '--leader', leader, ...(snapshot ? ['--snapshot', snapshot] : [])], { encoding: 'utf8' });
  writeFileSync(`${SCRATCH}/${logName}.log`, r.stdout + r.stderr);
  return r.status;
}

const cases = [
  { name: 'as-is (must be green)', brk: null, snapshot: null, want: 0 },
  { name: 'expected BPM of Goodness of God changed 63→64 (must be red)', brk: null, snapshot: 'bpm', want: 1 },
  { name: 'away check removed from the api (must be red)', brk: 'away', snapshot: null, want: 1 },
  { name: 'stale revs accepted by the api (must be red)', brk: 'rev', snapshot: null, want: 1 },
];
let bad = 0;
for (const c of cases) {
  let snapshot = null;
  if (c.snapshot === 'bpm') {
    const s = JSON.parse(readFileSync('data/spc-state-2026-09-13.json', 'utf8'));
    s.songs.find(x => x.id === 'g1').bpm = 64;
    snapshot = `${SCRATCH}/snapshot-wrong-bpm.json`;
    writeFileSync(snapshot, JSON.stringify(s));
  }
  const { child, leader } = await startFake(c.brk);
  const got = runEvals(leader, snapshot, c.name.replace(/\W+/g, '-').toLowerCase());
  child.kill();
  await new Promise(r => child.on('exit', r));
  const ok = got === c.want;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'VOID'}  ${c.name}: exit ${got}, wanted ${c.want}`);
}

// snapshot missing → exit 2
{
  const { child, leader } = await startFake(null);
  const got = runEvals(leader, `${SCRATCH}/does-not-exist.json`, 'snapshot-missing');
  child.kill(); await new Promise(r => child.on('exit', r));
  const ok = got === 2; if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'VOID'}  snapshot missing (must exit 2): exit ${got}`);
}
rmSync(`${SCRATCH}/snapshot-wrong-bpm.json`, { force: true });
console.log(bad ? `\n${bad} control(s) did not behave — the evals measured nothing.` : '\nEvery control behaved: the evals can go red.');
process.exit(bad ? 1 : 0);
