import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/original-e2e', outputDir: 'artifacts/character-fit-audit/original-browser', workers: 1, fullyParallel: false, retries: 0, timeout: 90000,
  reporter: [['list'], ['json', { outputFile: 'docs/evidence/character-fit-v3/browser-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:4175', launchOptions: { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] }, trace: 'retain-on-failure' },
  projects: [{ name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } }, { name: 'narrow', use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } }],
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4175 --strictPort', url: 'http://127.0.0.1:4175', reuseExistingServer: false },
});
