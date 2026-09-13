# data/

## `spc-state-2026-09-13.json` — the SPC snapshot

The live state of the single-file prototype at
https://spc-worship.alexjpower74.workers.dev as exported on 2026-09-13. It is the
only real church data in the repo and it is what the Worker imports on first
deploy (`worker/import.mjs`) and what the app mock and the evals are seeded from.

- **PIN is redacted.** The prototype was protected by one shared PIN; the field
  `pin` is the literal string `REDACTED`. The new app has no PIN at all: every
  person gets a personal link instead.
- **Owner:** main (Onyx). Nobody edits this file in a slice.
- **One real person:** Alexander Power (`p1`, lead guitar). No phone or email
  is recorded. Every other person in this repo is a SAMPLE person.

What is in it:

| Key        | Count | Notes |
|------------|------:|-------|
| `team`     | 1     | Alexander Power, role code `lg` |
| `services` | 5     | 23 Aug, 27 Aug (practice), 30 Aug, 6 Sep, 13 Sep 2026 |
| `songs`    | 12    | title, artist, key, bpm; `chart`/`video` all empty |
| `channels` | 16    | the desk's 16 inputs, `ch` 1–16 in order |
| `issues`   | 0     | the prototype's desk notes; none recorded |

Field names in the snapshot are the prototype's, not the new schema's:

| Snapshot            | New app (docs/API.md)             |
|---------------------|-----------------------------------|
| `team[].roles: "lg"`| `lead guitar` (see role map below) |
| `services[].type`   | `kind`: `am` → `am`, `pm` → `pm`, `prac` → `practice`, `special` → `special` |
| `services[].assign` | `slots`, keyed by full role name  |
| `services[].out`    | away dates (empty in the snapshot) |
| `services[].set[]`  | `set_entries`, in array order (`position` = index + 1) |
| `songs[].last`      | `last_used`                       |
| `issues`            | `desk_notes`                      |

Role codes used by the prototype: `lg` lead guitar, `rg` rhythm guitar, `ba` bass,
`dr` drums, `ke` keys, `v1`/`v2`/`v3` vocals 1–3, `so` sound, `pr` projection.
Only `lg` occurs in this snapshot.

## `sample-people.json` — SAMPLE people

Ten made-up people, one per role, so a demo or a test has a full band without
inventing church details. Every name starts with `SAMPLE` so nobody mistakes
them for a real member, and every record has `"sample": true`. They have no
phone numbers and no tokens; whoever seeds them (the app mock, the evals, or a
demo import) gets fresh tokens from the Worker.

Roles use the new app's full names. Alexander is **not** in this file; he comes
from the snapshot.
