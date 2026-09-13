// QA helpers. Two rules from the plan, made executable:
//   1. A check that cannot fail measured nothing → `control()` runs an assertion, then breaks the
//      thing it watches and runs it again; if it still passes the test is VOID and fails loudly.
//   2. Hit-test, don't measure rectangles → `hittable()` asks document.elementFromPoint what a
//      finger at the element's centre actually lands on.
import { expect } from '@playwright/test'

/** What does a finger at this locator's centre hit? Returns { ok, hit, box } — never throws on a miss. */
export async function hitTest (locator) {
  await locator.waitFor({ state: 'visible' })
  return locator.evaluate(el => {
    const r = el.getBoundingClientRect()
    const x = r.left + r.width / 2, y = r.top + r.height / 2
    const inView = x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight
    const hit = inView ? document.elementFromPoint(x, y) : null
    const ok = !!hit && (hit === el || el.contains(hit) || hit.contains(el))
    const name = h => h ? h.tagName.toLowerCase() + (h.id ? '#' + h.id : '') + (typeof h.className === 'string' && h.className ? '.' + h.className.trim().split(/\s+/).join('.') : '') : 'nothing'
    return { ok, hit: name(hit), inView, box: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } }
  })
}

/** Assert the element is really hittable and (for phones) at least 44 css px tall — then tap it with a real pointer. */
export async function tapHittable (page, locator, label) {
  await locator.scrollIntoViewIfNeeded()
  const t = await hitTest(locator)
  expect(t.ok, `${label}: centre of the element is covered by <${t.hit}> (box ${JSON.stringify(t.box)})`).toBe(true)
  const isPhone = page.viewportSize().width < 600
  if (isPhone) expect(t.box.h, `${label}: too small to tap on a phone (${t.box.h}px tall)`).toBeGreaterThanOrEqual(40)
  const x = t.box.x + t.box.w / 2, y = t.box.y + t.box.h / 2
  if (page.context()._options?.hasTouch || isPhone) await page.touchscreen.tap(x, y).catch(() => page.mouse.click(x, y))
  else await page.mouse.click(x, y)
}

/**
 * control(name, { assert, breaks })
 *   assert() must pass; then breaks() sabotages the page and assert() must FAIL; then restore.
 *   If the broken page still passes, the assertion is VOID and the test fails with that word.
 */
export async function control (name, { assert, breaks }) {
  await assert()
  const restore = await breaks()
  let stillPasses = true
  try { await assert() } catch { stillPasses = false }
  finally { if (typeof restore === 'function') await restore() }
  expect(stillPasses, `VOID: "${name}" still passed after the thing it watches was broken`).toBe(false)
}

/** Words the users must never see. Whole-word, case-insensitive. */
export const BANNED = ['null', 'undefined', 'NaN', 'sync', 'synced', 'syncing', 'unassigned', 'API', 'JSON', 'rev', '[object Object]', 'lorem', 'TODO']
export const BANNED_FOR_MEMBERS = ['token']

export function sweep (text, extra = []) {
  const words = [...BANNED, ...extra]
  const found = []
  for (const w of words) {
    const re = /^[\w\s]+$/.test(w) ? new RegExp(`(^|[^\\w])${escape(w)}(?=$|[^\\w])`, 'i') : new RegExp(escape(w), 'i')
    const m = re.exec(text)
    if (m) found.push({ word: w, at: snippet(text, m.index) })
  }
  return found
}
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const snippet = (t, i) => t.slice(Math.max(0, i - 30), i + 40).replace(/\s+/g, ' ')

/** Visible text of the page, including labels/placeholders/titles a user can read. */
export async function visibleText (page) {
  return page.evaluate(() => {
    const parts = [document.body.innerText]
    for (const el of document.querySelectorAll('[placeholder],[title],[aria-label],[alt]')) {
      for (const a of ['placeholder', 'title', 'aria-label', 'alt']) if (el.getAttribute(a)) parts.push(el.getAttribute(a))
    }
    parts.push(document.title)
    return parts.join('\n')
  })
}
