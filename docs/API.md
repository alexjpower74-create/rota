# Rota — API contract (app ↔ Worker)

Base: the Worker (`rota`). All JSON. Errors: `{ "error": "<plain sentence>" }`. Auth: `Authorization: Bearer <token>` (a person's token, or the leader's). No token = public read of the next service only.

Every mutable row carries `rev` (integer). Writes send `rev`; a stale one → 409 `{ error: "Someone changed this just now. Here's the latest.", current: <row> }`.

`GET /health` → `{ ok: true }`
`GET /me` (member) → `{ person: { id, name, roles }, next: <service view>, upcoming: [<service view> ×4], away: ["2026-09-21", …] }`
`GET /public/next` (no token) → `<service view>` with names but no phones or tokens.
`GET /services?from=YYYY-MM-DD&limit=8` → `[<service view>]`
`POST /services` (leader) `{ date, time, kind: "am"|"pm"|"practice"|"special", title? }` → service
`PATCH /services/:id` (leader) `{ rev, title?, notes?, date?, time? }`
`PUT /services/:id/slots/:role` (leader) `{ rev, person_id | null }` → 200 service view; 409 `{ error: "<name> is away that day." }` if away; 409 stale.
`PUT /me/away/:date` / `DELETE /me/away/:date` (member; leader may pass `?person=<id>`) → `{ away: [...] }`; marking away a date they're assigned on unassigns them and returns `{ away, unassigned: ["lead guitar on 2026-09-21"] }`.
`GET /songs` / `POST /songs` (leader) / `PATCH /songs/:id` (leader)
`PUT /services/:id/set` (leader) `{ rev, entries: [{ song_id, key, lead_person_id?, note? }] }` (whole list, in order)
`GET /channels` / `PUT /channels` (leader or sound role) `{ rev, channels: [...] }`
`GET /desk` → notes; `POST /desk` (any token) `{ text }`; `PATCH /desk/:id` (leader or sound) `{ resolved: true }`
`GET /people` (leader; members get names and roles only) ; `POST /people` (leader) `{ name, roles, phone? }` → person with a fresh token; `DELETE /people/:id` (leader).

`<service view>` = `{ id, date, time, kind, title, notes, rev, slots: { "lead guitar": { person_id, name } | null, … }, set: [{ position, song: { id, title, artist }, key, lead_name, note }], away_names: [...] }`.

Roles: `lead guitar, rhythm guitar, bass, drums, keys, vocals 1, vocals 2, vocals 3, sound, projection`.
