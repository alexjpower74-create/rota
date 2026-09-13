// The one journey the plan says must work, end to end, with real taps:
//   member marks away → leader cannot assign them → leader fills the slot with someone else
//   → the member sees that name → the wall shows it.
import { test, expect } from '@playwright/test'
import { discover, pickPair, go } from './mock.js'
import { tapHittable, hitTest, control } from './check.js'

test.describe.configure({ mode: 'serial' })

test('member away → leader refused → filled by another → member and wall agree', async ({ page }, info) => {
  const { leaderToken, people } = await discover(page)
  const { role, member, other } = pickPair(people)
  const shot = name => page.screenshot({ path: `app/tests/qa/shots/${info.project.name}-${name}.png` })

  // 1. Member opens their link and sees the next service and the away button.
  await go(page, `#/me/${member.token}`)
  await expect(page.getByText(member.name, { exact: false }).first()).toBeVisible()
  const away = page.getByRole('button', { name: /away/i }).first()
  await expect(away).toBeVisible()
  await shot('1-member')

  // Nothing is pressed yet; tap it with a real pointer at its hit-tested centre.
  await expect(away).not.toHaveAttribute('aria-pressed', 'true')
  await tapHittable(page, away, "member's 'I'm away that day'")
  await expect(away, 'the away button must show it is on (aria-pressed=true)').toHaveAttribute('aria-pressed', 'true')
  await shot('2-member-away')

  // 2. Leader opens the slot for that role on the next service. The away member is not offered.
  await go(page, `#/lead/${leaderToken}`)
  const slot = page.getByRole('button', { name: new RegExp(role, 'i') }).first()
  await expect(slot).toBeVisible()
  await tapHittable(page, slot, `leader's '${role}' slot`)
  const offered = page.getByRole('option').or(page.getByRole('listbox').getByRole('button')).or(page.getByRole('dialog').getByRole('button'))
  await expect(offered.filter({ hasText: other.name }).first(), `${other.name} should be offered for ${role}`).toBeVisible()
  const memberOffered = offered.filter({ hasText: member.name })
  const n = await memberOffered.count()
  for (let i = 0; i < n; i++) {
    const o = memberOffered.nth(i)
    const enabled = await o.isEnabled() && (await o.getAttribute('aria-disabled')) !== 'true'
    expect(enabled, `${member.name} is away and must not be pickable for ${role}`).toBe(false)
  }
  await expect(page.getByText(new RegExp(`${escapeRe(member.name)}.{0,40}away|away.{0,40}${escapeRe(member.name)}`, 'i')).first(),
    'the leader should see the away person marked as away').toBeVisible()
  await shot('3-leader-picker')

  // 3. Leader picks the other person; the app says Saved and the chip shows the name.
  await tapHittable(page, offered.filter({ hasText: other.name }).first(), `pick ${other.name}`)
  await expect(page.getByText(/^saved\b/i).first()).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(`${escapeRe(role)}.*${escapeRe(other.name)}|${escapeRe(other.name)}.*${escapeRe(role)}`, 'i') }).first()).toBeVisible()
  await shot('4-leader-filled')

  // 4. The member's view shows who's on.
  await go(page, `#/me/${member.token}`)
  await expect(page.getByText(other.name, { exact: false }).first()).toBeVisible()
  await shot('5-member-sees-name')

  // 5. The wall shows the same name — and this assertion is proven live: blank the name and it must go red.
  await go(page, '#/wall')
  await control('wall shows the filled name', {
    assert: () => expect(page.getByText(other.name, { exact: false }).first()).toBeVisible({ timeout: 3000 }),
    breaks: async () => {
      const saved = await page.evaluate(() => document.body.innerHTML)
      await page.evaluate(name => { document.body.innerHTML = document.body.innerHTML.split(name).join('open') }, other.name)
      return () => page.evaluate(html => { document.body.innerHTML = html }, saved)
    }
  })
  await shot('6-wall')
})

test('every tap target on the member screen is really hittable', async ({ page }) => {
  const { people } = await discover(page)
  const { member } = pickPair(people)
  await go(page, `#/me/${member.token}`)
  await expect(page.getByRole('button', { name: /away/i }).first()).toBeVisible()
  const targets = page.getByRole('button').or(page.getByRole('link'))
  const n = await targets.count()
  expect(n, 'a member screen with no tap targets is not a member screen').toBeGreaterThan(0)
  const covered = []
  for (let i = 0; i < n; i++) {
    const t = targets.nth(i)
    if (!(await t.isVisible())) continue
    await t.scrollIntoViewIfNeeded()
    const r = await hitTest(t)
    if (!r.ok) covered.push(`${(await t.innerText()).trim().slice(0, 30) || '(no text)'} → hits <${r.hit}>`)
  }
  expect(covered, 'these targets are covered or clipped').toEqual([])
})

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
