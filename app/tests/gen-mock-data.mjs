// Regenerates app/mock-data.js from the SPC snapshot (PIN removed).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const d = JSON.parse(fs.readFileSync(path.join(root, 'data/spc-state-2026-09-13.json'), 'utf8'))
delete d.pin
fs.writeFileSync(path.join(root, 'app/mock-data.js'),
  '// GENERATED from data/spc-state-2026-09-13.json (PIN removed). Regenerate: node app/tests/gen-mock-data.mjs\nexport const snapshot = ' + JSON.stringify(d, null, 1) + '\n')
console.log('wrote app/mock-data.js')
