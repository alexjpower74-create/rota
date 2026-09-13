# r2 app tests

```
NODE_PATH=/opt/homebrew/lib/node_modules npx playwright test -c app/tests/playwright.config.js
```
Runs against the in-browser mock (`?mock=1&today=2026-09-12`) on port 6001, chromium + webkit, 390x844 and 1280x800.
`NODE_PATH` is only needed until the root `package.json` (r4) installs `@playwright/test` locally.
Screenshots in `shots/`; regenerate the embedded snapshot with `node app/tests/gen-mock-data.mjs`.
