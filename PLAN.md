# Rota — build contract

One plan file. It is the contract, at the repo root, and every agent reads the same copy.

## The brief (Alexander, 2026-09-13)
**Rota: who's on this Sunday.** A worship team app for Springdale Pentecostal Church (SPC), where Alexander plays lead guitar and the pastor asked him to organise the musicians and sound crew. Real weekly users from the first week. It replaces the single-file prototype at https://spc-worship.alexjpower74.workers.dev (its live data is in `data/spc-state-2026-09-13.json`, PIN redacted) with a proper app: each person gets their own link (no passwords), marks when they're away, sees what they're playing and the set list with keys; the leader builds the rota and the set; the sound desk has its channel list and a place to leave notes. A portfolio showpiece (real users, personal links instead of accounts, conflict-safe edits, plain English).

**What must work, in this order.** (1) A member opens their link on a phone and sees the next service: date, who's on, the set with keys, and a big "I'm away that day" button. (2) The leader sees open slots for the next four services and fills them from people who play that role and aren't away; a person who marked away shows as such and can't be assigned. (3) Set lists: songs with key and BPM, drag or tap to order, chart and video links. (4) Sound: 16-channel list, editable, and notes anyone can post ("kick mic crackling"). (5) A wall/print view of the next service for the notice board.

**Design.** White ground, ink `#101418`, one accent: a warm gold `#9a6b12` (not green, not church-blue); muted `#5b6670`; rule `#d9dee3`. System fonts. Phone-first at 390 (members), leader screens fine at 1280. No emoji icons. Plain English: "away", "open", "who's on", never "unassigned", "null", "sync".

**Stack.** Static app in `app/` (plain HTML/JS/CSS, no build). Worker + D1 in `worker/`. People, roles (lead guitar, rhythm guitar, bass, drums, keys, vocals ×3, sound, projection), services (fully flexible: Sunday AM always, sometimes PM, practices, specials; nothing hard-coded weekly), assignments, away dates, songs, set entries, channels, desk notes. Auth: each person has a `token` (personal link `/#/me/<token>`); the leader has a leader token; no passwords. Conflict-safe: every write carries the row's `rev`, stale writes get 409 and the current row. Contract `docs/API.md`. Ports: r1 `wrangler dev --port 6002`; r2 static 6001; r3 talks to 6002; QA 6009. Main creates D1, imports the SPC data, deploys, hands Alexander the personal links.

## Rules
- You own the files under your id and nothing else; `rig guard` enforces it. Commit only your own paths. Verify → commit → report (`docs/build-report-<id>.md`).
- Never grade the shared tree. No visible Chrome; `pwshot` for screenshots into your own slice's `shots/` folder. Chromium + WebKit (members are on iPhones).
- A check that cannot fail measured nothing: say what would make it red, make it red once, record it.
- Real names only where the data already has them (Alexander Power); test people are labelled SAMPLE. No invented church details.

## Agents

### r1 — Worker: people, services, rota, songs, sound
Owns:
- worker/**

Report: docs/build-report-r1.md

Task: implement `docs/API.md` in `worker/src/index.js` (+ modules); `worker/wrangler.toml` name `rota`, D1 binding `DB` (`database_name rota`, `database_id = "TODO-main-fills"`); migrations for `people(id, name, roles JSON, token, is_leader, phone, created)`, `services(id, date, time, kind, title, notes, rev)`, `assignments(service_id, role, person_id)`, `away(person_id, date)`, `songs(id, title, artist, key, bpm, chart, video, notes, last_used)`, `set_entries(id, service_id, position, song_id, key, lead_person_id, note)`, `channels(id, ch, src, inp, note)`, `desk_notes(id, person_id, text, created, resolved)`. Rules in code, tested: a person marked away for a date cannot be assigned to a service on that date (409 with a plain sentence); a role slot holds one person; deleting a person clears their slots; stale `rev` → 409 with the current row. Token auth: member tokens can edit only their own away dates, post desk notes, and read everything; the leader token can edit everything; no token → read-only public view of the next service (no phone numbers). `worker/import.mjs` turns `data/spc-state-2026-09-13.json` into insert SQL (people with fresh tokens, services, songs, set entries, channels). Tests `worker/tests/api.test.mjs` with `node --test` against `wrangler dev --port 6002`: health, next service for a member, mark away then assignment refused, leader assigns and fills, set list order, desk note, stale rev 409, member cannot edit another member, no-token view hides phones. Negative control: remove the away check and show the test go red; restore.

### r2 — App: member, leader, sound, wall
Owns:
- app/**

Report: docs/build-report-r2.md

Task: `app/index.html` + `app.js` + `styles.css` + `api.js` + `api.mock.js` (`?mock=1`, seeded from `data/spc-state-2026-09-13.json` with SAMPLE people added so every role has someone). Routes by hash: `#/me/<token>` (member: next service card with date, "who's on", the set with keys, big "I'm away that day" toggle, the next four services below, a "Leave a note for the sound desk" box); `#/lead/<token>` (leader: next four services, each role slot as a chip "open" or a name, tap a slot to pick from people who play it and aren't away, set list builder with order, key per song, add/remove; add a service with date/time/kind); `#/sound` (channels list editable with a token, desk notes with resolve); `#/wall` (the next service big-type, for the notice board and printing, no tokens needed); no token → the public next-service view. Every write shows a plain "Saved" or the 409 message and reloads the row. Playwright `app/tests/` (chromium + webkit, 390x844 and 1280x800) against the mock with REAL taps: member marks away and sees it; leader opens a slot and the away person is not offered; leader fills a slot and the member's view shows their name; set order change persists; wall shows the same names; hit-test every tap target. Negative control: make "I'm away that day" do nothing and show the test go red; restore. Screenshots to `app/tests/shots/`.

### r3 — Import, seed and the "is it right" evals
Owns:
- data/**
- evals/**

Report: docs/build-report-r3.md

Task: `data/README.md` (what the snapshot is, PIN redacted); `data/sample-people.json` (SAMPLE people for every role so demos have a full band); `evals/run.mjs --api <url> --leader <token>`: after import, checks the data survived: every song in the snapshot exists with the same key and BPM; every service on its date with its set in order; the 16 channels in order; then the rota rules live: mark a SAMPLE person away → assign refused; assign someone else → member view shows them; stale rev → 409; prints a table, exit 1 on any miss, exit 2 if the snapshot is missing. Negative control: change one expected BPM and show it go red; restore.

### r4 — QA harness, whole-suite runner, live round-trip
Owns:
- app/tests/qa/**
- playwright.config.js
- package.json
- docs/QA.md
- tests/live-roundtrip.mjs

Report: docs/build-report-r4.md

Task: root `package.json` + `playwright.config.js` running every spec in the repo on chromium + webkit at 390x844 and 1280x800, static server on 6009; `app/tests/qa/journey.spec.js`: member → away → leader can't assign them → leader fills with someone else → member sees the name → wall shows it, real taps, hit-tested; `app/tests/qa/plain-english.spec.js`: banned developer words on every screen ("null", "undefined", "sync", "unassigned", "token" visible to members, "API"); `tests/live-roundtrip.mjs` against the real Worker (`API=`, `LEADER=`): health, public view shows no phone numbers, member away then refused, leader fills, stale rev 409. Negative control: plant "unassigned" on a throwaway page and show the sweep go red; restore. `docs/QA.md`.

## Main (Onyx, not a slice)
Owns PLAN.md, docs/API.md, data/spc-state-2026-09-13.json. Creates D1 `rota`, fills ids, imports the SPC snapshot, deploys Worker + app (static-assets Worker `rota-app`), runs r3's evals and r4's round-trip against the real thing, writes the README, gives Alexander the personal links, and only cuts the old URL over when he says.
