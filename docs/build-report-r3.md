# Build report — r3 · Import, seed and the "is it right" evals

Branch `rig/r3`. Everything below is inside `data/**` and `evals/**` except this file.

## Built
- **DONE** `data/README.md` — what the snapshot is (prototype export 2026-09-13, PIN redacted,
  one real person), counts, and the field/role map from the prototype's names to `docs/API.md`.
- **DONE** `data/sample-people.json` — ten SAMPLE people covering every role (three vocalists
  who can take any of vocals 1–3). No phones, no tokens, `sample: true`, names start `SAMPLE`.
- **DONE** `evals/run.mjs --api <url> --leader <token> [--snapshot <file>]` — health; every
  snapshot song present with the same key and BPM (matched by title, so fresh ids are fine);
  every service on its date/time/kind with its set in order and Alexander's lead-guitar slot;
  the 16 channels in order; then live: leader adds two SAMPLE people, marks one away on the next
  service → assigning them is 409 with "… is away that day" and the slot stays open; assigns the
  other → their own `/me` shows the name, `/public/next` shows it with no phones; a stale `rev`
  PATCH → 409 with the current row. Restores the borrowed slot and deletes the two people.
  Table output; exit 1 on any miss, exit 2 if the snapshot is missing.
- **DONE** `evals/fake-api.mjs` — in-memory stand-in for the contract, with `--break away|bpm|rev`.
  Exists only because r1's Worker did not exist yet when this was built. Not the real thing.
- **DONE** `evals/selfcheck.mjs` — runs the evals against the fake four ways plus the missing-snapshot case.

## Verified, and how it could have failed
`node evals/selfcheck.mjs` → all five controls behaved:

| Run | Wanted | Got |
|---|---|---|
| as-is | exit 0 | 0 (31 ok, 0 misses) |
| expected BPM of Goodness of God 63→64 in a copy of the snapshot (the plan's negative control) | exit 1 | 1 — `MISS songs Goodness of God expected B 64, got B 63` |
| away check removed from the api | exit 1 | 1 — `MISS away person → assign refused with 409 (status 200)` and `slot still not the away person` |
| stale revs accepted by the api | exit 1 | 1 — `MISS stale rev → 409 (status 200)` |
| snapshot file missing | exit 2 | 2 |

The canonical snapshot was never edited; the negative control uses a copy via `--snapshot`.
Red would have meant the assertion did not depend on the thing it claims to check; each one did.

## Not verified
- **Against the real Worker.** Port 6002 had nothing listening and `worker/` is not in this
  tree. The evals follow `docs/API.md` to the letter, but the contract leaves a few shapes open
  and I guessed: `GET /channels` may return a bare array or `{ rev, channels }` (both handled);
  `GET /people` for the leader includes `token` (only needed if r1 does not return the token from
  `POST /people`); the leader marks someone away with `PUT /me/away/:date?person=<id>`.
  Main should run `node evals/run.mjs --api <url> --leader <token>` after import; a miss in the
  `rules` group is as likely a contract mismatch as a Worker bug — check the DETAIL column.
- The evals pick the first service from today onward and borrow its **bass** slot. If that
  service already has a bass player, they are unassigned for a few seconds and put back.
  Do not run it during a service.
- `rig-harness` / `check()` mentioned in the brief is not installed here; `selfcheck.mjs` does the
  same job (a control that stays green marks the run VOID).

## Needs from other slices
- **r1:** confirm `POST /people` returns `token`, and that `PUT /me/away/:date?person=` is how the
  leader marks a member away. If either differs, the `rules` group will say so.
- **r2:** `data/sample-people.json` is there for `api.mock.js` to seed from; role names match the contract.
- **Main:** run the evals after import and paste the table into the README.
