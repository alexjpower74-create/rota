// r2's own suite config (root playwright.config.js belongs to r4). Run:
//   npx playwright test -c app/tests/playwright.config.js
import { defineConfig, devices } from '@playwright/test'
const PORT = 6001
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.js/,
  timeout: 30000,
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'on-first-retry', screenshot: 'only-on-failure' },
  outputDir: './shots/failures',
  projects: [
    { name: 'chromium-phone', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'webkit-phone', use: { ...devices['iPhone 14'] } },
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'webkit-desktop', use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: { command: `python3 -m http.server ${PORT} -d app --bind 127.0.0.1`, url: `http://127.0.0.1:${PORT}/index.html`, reuseExistingServer: true, cwd: '../..' },
})
