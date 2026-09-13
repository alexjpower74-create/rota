// Whole-suite runner. Picks up every *.spec.js in the repo (r2's app/tests and r4's app/tests/qa),
// on Chromium and WebKit, at phone (390x844) and leader-desktop (1280x800) sizes.
// Static server on 6009 (the QA port from .rig/config.json) serving app/ — never another slice's port.
import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.QA_PORT || 6009)
export const baseURL = `http://127.0.0.1:${PORT}`

const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const desktop = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.js$/,
  testIgnore: ['**/.worktrees/**', '**/node_modules/**', '**/worker/**', '**/test-results/**'],
  outputDir: 'test-results/runs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never', outputFolder: 'test-results/report' }]],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000
  },
  projects: [
    { name: 'chromium-phone', use: { ...devices['Desktop Chrome'], ...phone } },
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], ...desktop } },
    { name: 'webkit-phone', use: { ...devices['Desktop Safari'], ...phone } },
    { name: 'webkit-desktop', use: { ...devices['Desktop Safari'], ...desktop } }
  ],
  webServer: {
    command: `node app/tests/qa/serve.mjs ${PORT}`,
    url: `${baseURL}/__qa/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 15_000
  }
})
