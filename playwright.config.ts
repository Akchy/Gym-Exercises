import { defineConfig, devices } from '@playwright/test';
import { basePath } from './vite.config';

// Same BASE_PATH as the build, so the deploy workflow tests the exact subfolder build it ships.
const url = `http://localhost:4173${basePath()}`;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  use: {
    baseURL: url,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
