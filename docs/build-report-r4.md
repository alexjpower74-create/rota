# Build report — r4 · QA harness, whole-suite runner, live round-trip

Branch `rig/r4`. Files: `package.json`, `playwright.config.js`, `app/tests/qa/**`, `tests/live-roundtrip.mjs`, `docs/QA.md`.
The brief said "no task stated"; PLAN.md states one under r4, so I built that.

## Built
- **DONE** Root `package.json` (`npm test`, `test:qa`, `test:live`, `serve:qa`) and `playwright.config.js`: every `*.spec.js` in the repo, four projects (chromium/webkit × 390x844 phone with touch, 1280x800 desktop), static server `app/tests/qa/serve.mjs` on 6009 with a health URL, results under git-ignored `test-results/`.
- **DONE** `app/tests/qa/check.js`: `hitTest`/`tapHittable` (elementFromPoint, 40px minimum on phones, real touchscreen tap), `control()` (VOID if the assertion survives its own sabotage), the banned-word `sweep` with word boundaries, `visibleText` (innerText + placeholders/titles/aria-labels).
- **DONE** `app/tests/qa/plain-english.spec.js`: sweeps public, member, leader, sound, wall and a wrong-link screen; two fixture pages act as permanent controls.
- **DONE (unverified against a real app)** `app/tests/qa/journey.spec.js`: the full away → refused → filled → member → wall journey with real taps, plus a hittability audit of every member-screen target.
- **DONE** `tests/live-roundtrip.mjs`: health, public view free of phones/tokens, member away → 409 with a sentence naming them, slot stays empty, leader fills, member view agrees, stale rev 409 with current row, member cannot mark another member away. SAMPLE people only; restores what it touched.
- **DONE** `app/tests/qa/fake-worker.mjs`: an in-memory stand-in for `docs/API.md` (not r2's mock) so the round-trip could be exercised before r1 exists. Has `--no-away-rule` to break it deliberately.
- **DONE** `docs/QA.md`.

## Verified, and how each could have failed
- Static server + config: `npx playwright test --list` shows 20 tests over 4 projects. First attempt found **no tests** because the ignore glob `**/.worktrees/**` matched this worktree's own path; fixed, and HTML report folder clash fixed.
- Sweep negative control (the plan's "plant unassigned on a throwaway page"): `fixtures/planted.html` carries "unassigned"; the control test passes on chromium-phone and webkit-phone. Then I removed "unassigned" from `BANNED`: the control went **red** (`Expected ["unassigned"], Received []`). Restored; green again. `clean.html` (contains "Synchronised") stays clean, proving word boundaries.
- Live round-trip against the fake worker: 9 PASS, 0 VOID, exit 0. With `--no-away-rule`: the two away checks go **red**, exit 1. Unconfigured: exit 2, nothing run. Dead port: FAIL cleanly, exit 1.
- The round-trip's own negative controls are predicate-level (doctored responses), so they prove the assertions can discriminate but not that the Worker is wrong; the fake-worker run is what proves the script end to end.

## Not verified — needs other slices
- `journey.spec.js` and the screen sweep in `plain-english.spec.js` cannot run until r2's `app/index.html?mock=1` exists. They currently fail with the sentence "QA cannot find the mock people…" — a fail, not a skip. The selectors rest on accessible roles and a small hook; the exact list is **docs/QA.md § What the specs need from the mock app**. r2, please read it: `window.rotaMock`, two SAMPLE people sharing a non-vocal role, `aria-pressed` on the away button, role-named slot buttons, `role=option`/`listbox`/`dialog` picker, "Saved" text. If r2's DOM differs I will adapt the spec, but the hook is the part that cannot be guessed.
- The journey's VOID control is on the wall step only; the away and refused steps are guarded by ordering (aria-pressed must be false before the tap, the other person must be offered so the picker really opened).
- `tests/live-roundtrip.mjs` has not touched the real Worker. Main runs it after deploy with `API=` and `LEADER=`.
- r2's own specs under `app/tests/` will be picked up by the root config automatically; if r2 ships its own `playwright.config.js` inside `app/`, the root one still governs `npm test` from the repo root.

## Cross-slice asks
- **r2**: the mock hook and the six DOM conventions in docs/QA.md.
- **r1**: `GET /people` as leader must return `token` per person (the contract says so); the round-trip depends on it. `PUT /me/away/:date?person=` from a member token must not act on another person (it may 403 or silently act on the caller; the check accepts either).
- **Main**: nothing outside my slice was edited. `.gitignore` already covers `test-results/`.
