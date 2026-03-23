import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: process.env.CI ? 'https://staging.jaw-finance.pages.dev' : 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry' /* https://playwright.dev/docs/trace-viewer */,
    video: 'retain-on-failure',
  },
});
