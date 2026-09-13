# Rota Worker

Implements `docs/API.md` on Cloudflare Workers + D1.

- `src/index.js` routes and rules, `src/auth.js` tokens, `src/views.js` the `<service view>`, `src/util.js` helpers.
- `migrations/0001_init.sql` schema. `import.mjs` turns the SPC snapshot into `seed.sql` and writes personal links to `SECRETS.txt` (both gitignored).
- `npm test` resets the local D1, migrates, seeds, starts `wrangler dev --port 6002`, runs `tests/api.test.mjs`.
- `npm run dev` for a server on 6002 (run `npm run seed:local` first).

Production: main fills `database_id` in `wrangler.toml`, then `wrangler d1 migrations apply rota --remote`, `node import.mjs > seed.sql`, `wrangler d1 execute rota --remote --file seed.sql`, `wrangler deploy`. Hand out the links in `SECRETS.txt`.
