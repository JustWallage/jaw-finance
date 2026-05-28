import { defineConfig } from "@playwright/test";

const isCi = !!process.env.CI;
const ciBaseUrl = process.env.BASE_URL;
if (isCi && !ciBaseUrl) throw new Error("BASE_URL env must be set in CI");

const extraHTTPHeaders: Record<string, string> = isCi
  ? { "X-Test-User-Email": "test@jaw-finance.local" }
  : { "Cf-Access-Authenticated-User-Email": "test@jaw-finance.local" };

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  timeout: 360_000,
  reporter: "list",
  use: {
    baseURL: isCi ? ciBaseUrl : "http://localhost:8788",
    extraHTTPHeaders,
    screenshot: "only-on-failure",
    trace: "on-first-retry" /* https://playwright.dev/docs/trace-viewer */,
    video: "retain-on-failure",
  },
});
