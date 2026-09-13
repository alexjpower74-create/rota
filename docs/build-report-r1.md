# Build report — r1 · Worker: people, services, rota, songs, sound

Branch `rig/r1`. Files under `worker/**` only. The brief said "no task stated"; PLAN.md's r1 section states one, and PLAN.md is the contract, so that is what was built.

## Built — DONE
- `worker/wrangler.toml`: name `rota`, D1 binding `DB`, `database_name rota`, `database_id = "TODO-main-fills"`, `migrations_dir = "migrations"`.
- `worker/migrations/0001_init.sql`: the eight tables from the plan, plus `songs.rev` (API says PATCH /songs carries rev) and a tiny `meta` table holding `channels_rev` (the channel list is one row-set with one rev in the API).
- `worker/src/index.js` (+ `auth.js`, `views.js`, `util.js`): every route in `docs/API.md`, plus `GET /services/:id`, `DELETE /services/:id`, `DELETE /songs/:id`, `PATCH /people/:id`, CORS for the app on another origin.
- Rules in code: away person cannot be assigned (409 "`<name>` is away that day."); a slot holds one person (primary key + upsert); marking away un-assigns and reports `unassigned: ["drums on 2027-…"]`; moving a service's date drops anyone away on the new date; deleting a person clears their slots, away days, song leads and note authorship, and bumps affected service revs; stale rev → 409 with `current`.
- Auth: member token reads everything (people as names + roles only, no phones/tokens), edits only their own away days, posts desk notes; the sound role may edit channels and resolve notes; the leader token edits everything and may pass `?person=` on away; no token → `/health` and `/public/next` only (no phones, no tokens).
- `worker/import.mjs`: snapshot → insert SQL. Fresh tokens; Alexander Power (or anyone flagged `leader`) is the leader. Unknown role codes throw rather than guess. Personal links written to `worker/SECRETS.txt` (gitignored, matches the root `*/SECRETS.txt` rule).
- `worker/tests/run.mjs` + `worker/tests/api.test.mjs`: `npm test` in `worker/` wipes local D1 state, migrates, seeds, starts `wrangler dev --port 6002`, runs `node --test`.

## Verified — and how it could have failed
`npm test`: 11 tests, all pass (health; next service for a member; away then assignment refused; leader assigns/fills/replaces/clears and away un-assigns; set order + keys + lead + last_used; desk note post/resolve/permissions; stale rev 409 for service, slot and channels; member cannot edit another member or leader things; no-token view hides phones and everything else is 401; deleting a person clears slots; service create/edit/list/bad-input).

Negative controls, run and recorded:
- Removed the `if (away) throw …` line in the slot handler → "mark away, then assignment is refused" went red (`actual: 200, expected: 409`), every other test stayed green. Restored; suite green.
- Disabled the rev comparison in `requireRev` → "stale rev → 409" went red, nothing else. Restored; suite 11/11.

Not measured: real D1 (only wrangler's local SQLite), deploy, and the app talking to it (r2/r4/main).

## Choices another slice should know
- `/me.upcoming` is the next four services **including** `next` (`upcoming[0].id === next.id`). r2: render `next` big, then `upcoming.slice(1)` if you don't want it twice.
- "Today" is the UTC date. A Sunday 11:00 service is still "next" on the Sunday itself.
- `<service view>` also carries `away_ids` (for the leader's picker) and set entries carry `id`, `lead_person_id`, and `song.bpm/chart/video`; `/public/next` drops `away_ids`.
- `GET /channels` returns `{ rev, channels }`, not a bare array; `PUT /channels` sends the whole list back with that rev.
- Desk notes: `PATCH /desk/:id` with `{ resolved: true|false }`; `GET /desk` items carry `by_name`.
- `POST /people` returns `token` and `link` (`/#/me/<token>` or `/#/lead/<token>`). Leaders' `GET /people` includes the same.
- Roles in the snapshot are codes (`lg`); the importer maps them to the API's full names.

## Left undone / needs another slice
- `database_id` is the placeholder; main fills it, applies migrations `--remote`, seeds, deploys (steps in `worker/README.md`).
- The snapshot has one real person, so every test person is SAMPLE (created live by the tests, not seeded). r3's `sample-people.json` can be loaded via `POST /people`.
- No rate limiting on `POST /desk`; tokens are the only secret. Fine for a church team, noted for the showpiece write-up.
