// Plain English on every screen. The users are a church worship team on their phones;
// they must never read a developer word. Sweeps every route of the mock app, plus two
// throwaway fixture pages that prove the sweep itself can go red.
import { test, expect } from '@playwright/test'
import { discover, pickPair, go } from './mock.js'
import { sweep, visibleText, BANNED_FOR_MEMBERS } from './check.js'

const FIXTURES = '/__qa/fixtures'

test('negative control: the sweep flags a planted "unassigned"', async ({ page }) => {
  await page.goto(`${FIXTURES}/planted.html`)
  const found = sweep(await visibleText(page))
  expect(found.map(f => f.word)).toEqual(['unassigned'])
})

test('positive control: a clean page is clean (word-boundary, not substring)', async ({ page }) => {
  await page.goto(`${FIXTURES}/clean.html`)
  expect(sweep(await visibleText(page))).toEqual([])
})

test('no developer words on any screen', async ({ page }) => {
  const { leaderToken, people } = await discover(page)
  const { member } = pickPair(people)
  const screens = [
    { name: 'public (no link)', hash: '#/', members: true },
    { name: 'member', hash: `#/me/${member.token}`, members: true },
    { name: 'leader', hash: `#/lead/${leaderToken}`, members: false },
    { name: 'sound', hash: '#/sound', members: true },
    { name: 'wall', hash: '#/wall', members: true },
    { name: 'wrong link', hash: '#/me/not-a-real-link', members: true }
  ]
  const problems = []
  for (const s of screens) {
    await go(page, s.hash)
    await page.waitForTimeout(400)
    const text = await visibleText(page)
    expect(text.trim().length, `${s.name} rendered nothing`).toBeGreaterThan(20)
    for (const f of sweep(text, s.members ? BANNED_FOR_MEMBERS : [])) problems.push(`${s.name}: "${f.word}" in …${f.at}…`)
  }
  expect(problems, 'developer words a church member would see').toEqual([])
})
