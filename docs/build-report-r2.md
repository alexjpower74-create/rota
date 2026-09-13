# Build report — r2 · App: member, leader, sound, wall

Branch `rig/r2`. Files: `app/**` only. Brief said "(none stated)" for the task; PLAN.md §r2 states it, so I built that.

## What I built — DONE
- `app/index.html`, `app/styles.css`, `app/app.js`, `app/api.js`, `app/api.mock.js`, `app/mock-data.js` (generated from the snapshot, PIN removed, `node app/tests/gen-mock-data.mjs`).
- Routes by hash: `#/me/<token>` member · `#/lead/<token>` leader · `#/sound[/<token>]` · `#/wall` · anything else = public next service.
- Member: next service (date, who's on with "(you)", set with keys and chart/video links), big "I'm away that day" toggle (becomes "I can do that day after all"), next four services each with an away toggle, note box for the sound desk. Marking away on a day you're on shows "You've been taken off lead guitar".
- Leader: next four services; each role a chip ("open" or a name); tap opens a sheet listing only people who play that role — away people are listed as plain text "away that day", not as buttons; "Leave it open" clears. Set builder: add from the song list, key select per song, up/down taps plus HTML5 drag, remove; every change saves the whole list with `rev`. Add a service (date/time/kind/title). Songs card (list + add). Team card (people, roles, copy personal link, add, remove).
- Sound: 16-channel table, editable inputs when the token is the leader's or a sound-role member's (`#/sound/<token>` or the last personal link opened in this browser), Save with `rev`, add a channel; desk notes with "Sorted"; read-only with no token.
- Wall: next service in big type, print button, `@media print` strips chrome. No token needed.
- Every write: "Saved" toast, or the server's plain sentence in a red toast (409 "Someone changed this just now…" / "<name> is away that day."), then the row is reloaded.
- `api.js` base URL: `?api=<url>` (remembered) → `localStorage.rotaApiBase` → `http://localhost:6002` on localhost → `/api`. **Main:** set the deployed Worker URL one of those ways (or serve the app under the Worker so `/api` works).
- Mock (`?mock=1`): implements every route in docs/API.md with the same rules (rev/409, away → refused, away unassigns, member can only edit own away, no-token public view without phones). State in localStorage, re-read on every request so two tabs behave like two phones. `?today=YYYY-MM-DD` pins today; `?reset=1` reseeds once. Seed = snapshot + 6 generated Sunday-morning services after the last snapshot date + 11 SAMPLE people (tokens `sample-<name>`, leader `lead-demo`, Alexander `alex-demo`). Snapshot's 13 Sept service has nobody assigned; that's the real data, not a bug.

## Verified — how
`NODE_PATH=/opt/homebrew/lib/node_modules npx playwright test -c app/tests/playwright.config.js` → **36 passed** (9 tests × chromium-phone 390x844, webkit-phone iPhone 14, chromium-desktop 1280x800, webkit-desktop). Every tap is a hit-tested real pointer/touch event (`app/tests/helpers.js` `tap`: `elementFromPoint` at the centre must be the target, then `touchscreen.tap` or `mouse.click`).
1. Member marks away → note, button state, survives reload, toggles back.
2. Noah marks away → leader's lead-guitar sheet has no Noah button, shows him as "away that day" → leader fills bass with Ruth → Ruth's page says "You're on bass.", Alexander's page and the wall show "SAMPLE Ruth".
3. Sheet open in tab A, Ruth marks away in tab B, tab A picks her → "SAMPLE Ruth is away that day.", slot stays open.
4. Stale rev: tab B assigns drums, tab A (old rev) assigns keys → 409 message, card reloads showing Dan on drums and keys still open.
5. Set list: add two songs, move one up, change key, reload, member and wall show the new order and keys.
6. Desk note from a member appears on the sound page with their name; sound person marks it sorted; channel note edit persists; no token = read-only.
7. Public view shows no phone numbers; bad link shows "That link didn't work".
8. Plain-English sweep for null/undefined/unassigned/sync/API/NaN on all five screens.
9. Every visible button/link/input on every screen (and inside the picker sheet) is hittable at its centre and ≥32px.

What would make them red: the wrong name/state on screen, a covered button, a write that doesn't persist. Checks 3, 4 and 5 went red during development for real reasons (mock cached state in memory so tab B's write was invisible; `reset=1` stuck in the URL and reseeded on reload; "Saved" toast shown before re-render). All fixed in the app/mock, not the tests.

**Negative control** (`app/tests/shots/negative-control.txt`): with the "I'm away that day" handler replaced by `() => {}`, chromium-phone went 3 failed / 6 passed (tests 1, 2, 3). Restored → 36 passed.

Screenshots `app/tests/shots/`: member (chromium + webkit phone), leader 1280, sound (webkit phone), wall 1280, public.

## Left undone / notes for others
- **r4:** `@playwright/test` isn't installed at the repo root, so my config needs `NODE_PATH=/opt/homebrew/lib/node_modules` until root `package.json` adds it. My tests use port 6001 with `reuseExistingServer`; the root config on 6009 can just include `app/tests/*.spec.js` (they read `baseURL`).
- **r1:** the mock assumes `GET /channels` returns `{ rev, channels }` (API.md says `PUT` takes `rev` but doesn't say where it comes from), `GET /desk` notes carry `name`, and `GET /me` for the leader token returns 403 (the sound page uses that to detect the leader). If you differ, tell me and I'll match.
- Not built: editing a song's key/BPM after adding it (add + use is there), song "lead" person per set entry (API field kept, UI not exposed), service notes editing. None were in the plan's list for r2.
- No emoji; the only glyphs are ↑ ↓ × on the set builder, with aria-labels.
