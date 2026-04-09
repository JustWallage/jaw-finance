import { defineConfig } from "@playwright/test";

const extraHTTPHeaders: Record<string, string> = process.env.CI
  ? {
      "CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID ?? "",
      "CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET ?? "",
      "X-Test-User-Email": "test@jaw-finance.local",
    }
  : {
      "Cf-Access-Authenticated-User-Email": "test@jaw-finance.local",
    };

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: process.env.CI
      ? "https://staging.jaw-finance.pages.dev"
      : "http://localhost:8788",
    extraHTTPHeaders,
    screenshot: "only-on-failure",
    trace: "on-first-retry" /* https://playwright.dev/docs/trace-viewer */,
    video: "retain-on-failure",
  },
});
