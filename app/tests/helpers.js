import { expect } from '@playwright/test'
export const BASE = '/index.html?mock=1&today=2026-09-12'
export const ALEX = 'alex-demo', LEADER = 'lead-demo', RUTH = 'sample-ruth', NOAH = 'sample-noah', TOM = 'sample-tom'
export const NEXT_DATE = 'Sunday 13 September'

export async function open(page, route, { reset = false } = {}) {
  await page.goto(`${BASE}${reset ? '&reset=1' : ''}#${route}`)
  await expect(page.locator('#app')).not.toContainText('Loading…')
}

// Hit-test then tap with a real pointer. Fails if anything covers the target's centre.
export async function tap(page, locator) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  if (!box) throw new Error('tap target has no box')
  const x = box.x + box.width / 2, y = box.y + box.height / 2
  const hit = await locator.evaluate((el, [x, y]) => { const h = document.elementFromPoint(x, y); return h ? (el === h || el.contains(h)) : false }, [x, y])
  if (!hit) throw new Error(`hit-test failed: something covers the centre of ${await locator.evaluate(e => e.outerHTML.slice(0, 80))}`)
  if (page.context()._options.hasTouch) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
}

// Run an action, then wait for the toast it raises (not one still on screen from an earlier write).
export async function expectToast(page, text, action) {
  const before = await page.locator('#toast').getAttribute('data-n')
  await action()
  await expect.poll(async () => (await page.locator('#toast').getAttribute('data-n')) !== before, { message: 'a new toast' }).toBe(true)
  await expect(page.locator('#toast')).toContainText(text)
}

// Every visible button/link/input (inside root) must be hittable at its centre.
export async function hitTestAll(page, root = 'body') {
  const bad = await page.evaluate((root) => {
    const out = []
    for (const el of document.querySelector(root).querySelectorAll('button, a[href], input, select, textarea, summary')) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height || el.disabled) continue
      if (el.closest('details:not([open])') && el.tagName !== 'SUMMARY') continue
      el.scrollIntoView({ block: 'center' })
      const b = el.getBoundingClientRect()
      const h = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)
      if (!h || !(h === el || el.contains(h))) out.push((el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40) + ' <- ' + (h ? h.tagName + '.' + h.className : 'nothing'))
      if (Math.min(b.width, b.height) < 32) out.push('too small: ' + (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 40))
    }
    return out
  }, root)
  expect(bad, 'uncovered, big-enough tap targets').toEqual([])
}
