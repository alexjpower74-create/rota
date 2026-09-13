import { test, expect } from '@playwright/test'
import { open, tap, hitTestAll, expectToast, ALEX, LEADER, RUTH, NOAH, TOM, NEXT_DATE } from './helpers.js'

test.describe('Rota against the mock', () => {
  test('member marks away and sees it, and it sticks after a reload', async ({ page }) => {
    await open(page, `/me/${ALEX}`, { reset: true })
    await expect(page.getByRole('heading', { name: 'Hello Alexander' })).toBeVisible()
    await expect(page.locator('.card.next .when')).toHaveText(NEXT_DATE)
    const btn = page.getByTestId('away-toggle')
    await expect(btn).toHaveText("I'm away that day")
    await expect(page.getByTestId('away-note')).toHaveCount(0)
    await expectToast(page, 'Saved', () => tap(page, btn))
    await expect(page.getByTestId('away-note')).toHaveText("You're away that day.")
    await expect(page.getByTestId('away-toggle')).toHaveText("You're away that day. Tap if you can make it after all")
    await page.reload()
    await expect(page.getByTestId('away-note')).toHaveText("You're away that day.")
    // and back again
    await tap(page, page.getByTestId('away-toggle'))
    await expect(page.getByTestId('away-toggle')).toHaveText("I'm away that day")
  })

  test('leader opens a slot: the away person is not offered, someone else fills it, member and wall show the name', async ({ page }) => {
    await open(page, `/me/${NOAH}`, { reset: true })
    await tap(page, page.getByTestId('away-toggle'))
    await expect(page.getByTestId('away-note')).toBeVisible()

    await open(page, `/lead/${LEADER}`)
    const card = page.locator(`.card[data-service]`).first()
    await expect(card.locator('.when')).toHaveText(NEXT_DATE)
    await expect(card).toContainText('Away that day: SAMPLE Noah')
    await tap(page, card.locator('.chip[data-role="lead guitar"]'))
    const sheet = page.getByRole('dialog')
    await expect(sheet).toContainText("Who's on lead guitar?")
    await expect(sheet.getByRole('button', { name: /SAMPLE Noah/ })).toHaveCount(0)
    await expect(sheet.locator('[data-away="SAMPLE Noah"]')).toContainText('away that day')
    await expect(sheet.getByRole('button', { name: /Alexander Power/ })).toBeVisible()
    await tap(page, sheet.getByRole('button', { name: 'Cancel' }))
    await expect(sheet).toHaveCount(0)

    await tap(page, card.locator('.chip[data-role="bass"]'))
    await expectToast(page, 'Saved', () => tap(page, page.getByRole('dialog').getByRole('button', { name: /SAMPLE Ruth/ })))
    await expect(page.locator('.card[data-service]').first().locator('.chip[data-role="bass"]')).toContainText('SAMPLE Ruth')

    await open(page, `/me/${RUTH}`)
    await expect(page.getByTestId('your-part')).toHaveText("You're on bass.")
    await expect(page.locator('.card.next li[data-role="bass"] .name')).toHaveText('SAMPLE Ruth (you)')

    await open(page, `/me/${ALEX}`)
    await expect(page.locator('.card.next li[data-role="bass"] .name')).toHaveText('SAMPLE Ruth')

    await open(page, '/wall')
    await expect(page.locator('.wall h1')).toHaveText(NEXT_DATE)
    await expect(page.locator('.wall li[data-role="bass"] .name')).toHaveText('SAMPLE Ruth')
    await expect(page.locator('.wall li[data-role="lead guitar"] .name')).toHaveText('open')
  })

  test('assigning someone who is away is refused with a plain sentence', async ({ page }) => {
    // Leader picks Ruth in one tab while another tab already has the sheet open with her still offered.
    await open(page, `/lead/${LEADER}`, { reset: true })
    const card = page.locator('.card[data-service]').first()
    await tap(page, card.locator('.chip[data-role="bass"]'))
    const other = await page.context().newPage()
    await open(other, `/me/${RUTH}`)
    await tap(other, other.getByTestId('away-toggle'))
    await expect(other.getByTestId('away-note')).toBeVisible()
    await expectToast(page, 'SAMPLE Ruth is away that day.', () => tap(page, page.getByRole('dialog').getByRole('button', { name: /SAMPLE Ruth/ })))
    await expect(page.locator('.card[data-service]').first().locator('.chip[data-role="bass"]')).toContainText('open')
  })

  test('a stale edit gets the 409 message and the fresh row', async ({ page }) => {
    await open(page, `/lead/${LEADER}`, { reset: true })
    const other = await page.context().newPage()
    await open(other, `/lead/${LEADER}`)
    await tap(other, other.locator('.card[data-service]').first().locator('.chip[data-role="drums"]'))
    await expectToast(other, 'Saved', () => tap(other, other.getByRole('dialog').getByRole('button', { name: /SAMPLE Dan/ })))
    // first tab still holds the old rev
    await tap(page, page.locator('.card[data-service]').first().locator('.chip[data-role="keys"]'))
    await expectToast(page, 'Someone changed this just now', () => tap(page, page.getByRole('dialog').getByRole('button', { name: /SAMPLE Kim/ })))
    await expect(page.locator('.card[data-service]').first().locator('.chip[data-role="drums"]')).toContainText('SAMPLE Dan')
    await expect(page.locator('.card[data-service]').first().locator('.chip[data-role="keys"]')).toContainText('open')
  })

  test('set list: add songs, change order and key, it persists and the member sees it', async ({ page }) => {
    await open(page, `/lead/${LEADER}`, { reset: true })
    const card = () => page.locator('.card[data-service]').first()
    await card().getByLabel('Add a song').selectOption({ label: 'Way Maker (E)' })
    await expectToast(page, 'Saved', () => tap(page, card().getByRole('button', { name: 'Add', exact: true })))
    await card().getByLabel('Add a song').selectOption({ label: 'Living Hope (D)' })
    await tap(page, card().getByRole('button', { name: 'Add', exact: true }))
    await expect(card().locator('.set li .title')).toHaveText(['Way Maker', 'Living Hope'])
    await tap(page, card().getByRole('button', { name: 'Move Living Hope up' }))
    await expect(card().locator('.set li .title')).toHaveText(['Living Hope', 'Way Maker'])
    await expectToast(page, 'Saved', () => card().getByLabel('Key for Living Hope').selectOption('C'))
    await page.reload()
    await expect(card().locator('.set li .title')).toHaveText(['Living Hope', 'Way Maker'])
    await expect(card().getByLabel('Key for Living Hope')).toHaveValue('C')
    await open(page, `/me/${ALEX}`)
    await expect(page.locator('.card.next .set li .title')).toHaveText([/Living Hope/, /Way Maker/])
    await expect(page.locator('.card.next .set li .key')).toHaveText(['C', 'E'])
    await open(page, '/wall')
    await expect(page.locator('.wall .set li .key')).toHaveText(['C', 'E'])
  })

  test('sound: a member leaves a note, the sound person marks it sorted and edits a channel', async ({ page }) => {
    await open(page, `/me/${ALEX}`, { reset: true })
    await page.getByLabel('Note for the sound desk').fill('kick mic crackling')
    await expectToast(page, 'Saved', () => tap(page, page.getByRole('button', { name: 'Send to the sound desk' })))
    await open(page, `/sound/${TOM}`)
    const note = page.getByTestId('desk-notes').locator('li').filter({ hasText: 'kick mic crackling' })
    await expect(note).toContainText('Alexander Power')
    await expectToast(page, 'Saved', () => tap(page, note.getByRole('button', { name: 'Sorted' })))
    await expect(page.getByTestId('desk-notes').locator('li').filter({ hasText: 'kick mic crackling' })).toContainText('sorted')
    await page.getByLabel('Channel 1 note').fill('new head')
    await expectToast(page, 'Saved', () => tap(page, page.getByRole('button', { name: 'Save channels' })))
    await page.reload()
    await expect(page.getByLabel('Channel 1 note')).toHaveValue('new head')
    await expect(page.locator('table.channels tbody tr')).toHaveCount(16)
    // no token: read-only
    await open(page, '/sound')
    await expect(page.getByRole('button', { name: 'Save channels' })).toHaveCount(0)
    await expect(page.locator('table.channels')).toContainText('new head')
  })

  test('no token shows the public next service without personal links; a bad link says so', async ({ page }) => {
    await open(page, '/', { reset: true })
    await expect(page.getByRole('heading', { name: "Who's on next" })).toBeVisible()
    await expect(page.locator('.card.next .when')).toHaveText(NEXT_DATE)
    await expect(page.locator('#app')).not.toContainText('07700')
    await open(page, '/me/not-a-real-link')
    await expect(page.getByRole('heading', { name: "That link didn't work" })).toBeVisible()
  })

  test('plain English: no developer words on any screen', async ({ page }) => {
    for (const r of [`/me/${ALEX}`, `/lead/${LEADER}`, `/sound/${TOM}`, '/wall', '/']) {
      await open(page, r, { reset: r.includes('alex') })
      const text = await page.locator('body').innerText()
      expect(text, r).not.toMatch(/\b(null|undefined|unassigned|sync|API|NaN)\b/)
    }
  })

  test('every tap target on every screen is hittable', async ({ page }) => {
    for (const r of [`/me/${ALEX}`, `/lead/${LEADER}`, `/sound/${TOM}`, '/wall', '/']) {
      await open(page, r, { reset: r.includes('alex') })
      await hitTestAll(page)
    }
    await open(page, `/lead/${LEADER}`)
    await tap(page, page.locator('.card[data-service]').first().locator('.chip[data-role="vocals 1"]'))
    await expect(page.getByRole('dialog')).toBeVisible()
    await hitTestAll(page, '[role=dialog]')
  })
})
