# QA — how Rota is checked

Two layers. The Playwright suite runs every spec in the repo against the **mock app** on port 6009.
The live round-trip runs against the **real Worker** after main deploys it. Numbers only count from a
QA worktree pinned to a commit (`rig qa --ref <sha> --port 6009 --run "npm test"`), never a shared tree.

## Run

```
npm install                 # once; browsers come from ~/Library/Caches/ms-playwright
npm test                    # every *.spec.js, chromium + webkit, 390x844 and 1280x800
npm run test:qa             # only app/tests/qa
npx playwright test --project=webkit-phone app/tests/qa/journey.spec.js
API=https://rota.<acct>.workers.dev LEADER=<leader token> npm run test:live
```

`playwright.config.js` starts `app/tests/qa/serve.mjs` on 6009, a dependency-free static server for
`app/`. Fixture pages live at `/__qa/fixtures/`. Results go to `test-results/` (git-ignored);
screenshots of the journey to `app/tests/qa/shots/<project>-<step>.png`.

## What is checked

| Spec | Proves | How it goes red |
|---|---|---|
| `app/tests/qa/journey.spec.js` | member taps "I'm away that day" → leader's picker does not offer them and shows them as away → leader fills with another SAMPLE person → "Saved" → member sees the name → wall shows it | every tap is a real pointer tap at a hit-tested centre (`document.elementFromPoint`); the wall assertion is run again with the name blanked out and must fail, else VOID |
| `app/tests/qa/journey.spec.js` (tap targets) | every button and link on the member screen is actually hittable, not covered or clipped | lists what stole the hit |
| `app/tests/qa/plain-english.spec.js` | no developer words on public, member, leader, sound, wall, and wrong-link screens | fixture `planted.html` carries "unassigned" and must be flagged; `clean.html` must not (word boundaries: "Synchronised" is fine, "sync" is not) |
| `tests/live-roundtrip.mjs` | real Worker: health · public view has no phones or tokens · member away → leader refused with a plain sentence · leader fills · member view agrees · stale rev 409 with the current row · a member cannot mark another member away | each predicate is re-run against a doctored input and must fail, else VOID; whole script proven red against `app/tests/qa/fake-worker.mjs --no-away-rule` |

Banned words (whole word, any case): null, undefined, NaN, sync/synced/syncing, unassigned, API,
JSON, [object Object], lorem, TODO. "token" is banned on every screen a member sees (all but the
leader's). Edit `BANNED` in `app/tests/qa/check.js`.

## What the specs need from the mock app (`?mock=1`) — r2

The QA specs must not hard-code r2's DOM, so they lean on a small hook and on accessible roles:

1. `window.rotaMock = { leaderToken, people: [{ id, name, roles, token }] }` set by `api.mock.js`.
   At least **two SAMPLE people with tokens share one non-vocal role** (say drums), so one can be
   away and the other can fill. Without the hook the specs read `QA_LEADER_TOKEN`,
   `QA_MEMBER_TOKEN`, `QA_MEMBER_ROLE`, `QA_OTHER_NAME`; with neither they **fail**, never skip.
2. Mock state lives for the page (hash navigation must not reset it). Persistence across reloads
   is optional.
3. The member's away control is a `<button>` whose accessible name contains "away" and which
   carries `aria-pressed="true"` once the person is away.
4. Leader slots are `<button>`s whose accessible name contains the role ("lead guitar", "drums"…)
   and, once filled, the person's name. Tapping one opens a picker whose choices are
   `role=option`, or buttons inside a `role=listbox` or `role=dialog`. An away person is either
   not offered or offered disabled (`disabled` or `aria-disabled="true"`), and the leader screen
   says somewhere that "<name> … away".
5. After a write the screen shows text starting "Saved".
6. `#/wall` shows the names on the next service as plain text.

## Live round-trip safety

It only ever touches people whose name contains "SAMPLE" (creating "SAMPLE QA round-trip" and
"SAMPLE QA stand-in" if none exist, and deleting them after), and it restores the slot and away
date it used. It never edits Alexander's row. Exit codes: 0 all good, 1 any FAIL or VOID, 2 not
configured. Needs a service dated today or later.

## Rules kept

- A check that cannot fail measured nothing: `control()` in `check.js` and `check()` in the
  round-trip mark an assertion VOID when its negative control also passes.
- Hit-test, don't measure rectangles: `hitTest()` asks `elementFromPoint`.
- Real input: `page.touchscreen.tap` / `page.mouse.click`, never `dispatchEvent`.
- Own port: 6009. Nothing here talks to 6001 or 6002.
