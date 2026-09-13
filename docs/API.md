# Rota — API contract (app ↔ Worker)

Base: the Worker (`rota`). All JSON. Errors: `{ "error": "<plain sentence>" }`. Auth: `Authorization: Bearer <token>` (a person's token, or the leader's). No token = public read of the next service only.

Every mutable row carries `rev` (integer). Writes send `rev`; a stale one → 409 `{ error: "Someone changed this just now. Here's the latest.", current: <row> }`.

`GET /health` → `{ ok: true }`

**Who is editing (2026-09-13).** Building the rota is done by worship leaders and pastors. `GET /editors` (leader link) → `[{ id, name, title: "worship leader" | "pastor" }]`; `POST /editors { name, title }` adds a name (or gives an existing person that title). The app sends `X-Editor: <person id>` on every write; the Worker stamps each change into `edits` and onto the service: `<service view>` carries `last_edit: { by, title, at } | null` and `edits: [{ what, by, title, at }]` (latest five). `GET /edits` (any link) → the latest 50 changes.
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

Roles: `worship leader, lead guitar, rhythm guitar, acoustic guitar 1, acoustic guitar 2, acoustic guitar 3, bass, drums, keys, piano, vocals 1, vocals 2, vocals 3, sound, projection` (added worship leader, piano and the three acoustic slots 2026-09-13 at Alexander's request).
