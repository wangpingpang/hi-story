import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/pixel-e2e', workers: 1, retries: 0, timeout: 90000,
  reporter: [['list'], ['json', { outputFile: 'docs/evidence/character-pixel-v1/browser-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:4174', launchOptions: { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] } },
  projects: [{ name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } }, { name: 'narrow', use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } }],
  webServer: { command: 'npx vite --host 127.0.0.1 --port 4174 --strictPort', url: 'http://127.0.0.1:4174/character-pixel.html', reuseExistingServer: false },
});
