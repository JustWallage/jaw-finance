import { test as base, expect, type Locator } from "@playwright/test";

const isCi = !!process.env.CI;
export const userEmailHeader = isCi
  ? "X-Test-User-Email"
  : "Cf-Access-Authenticated-User-Email";

type TestFixtures = {
  userEmail: string;
  mockAI: boolean;
  autoConsent: boolean;
  _setupUser: void;
  connectAndRefresh: () => Promise<void>;
  connectAndRefreshHome: () => Promise<Locator>;
};

export const test = base.extend<TestFixtures>({
  mockAI: [false, { option: true }],
  autoConsent: [true, { option: true }],

  userEmail: async ({}, use, testInfo) => {
    const slug = testInfo.title
      .replace(/[^a-z0-9]+/gi, "-")
      .toLowerCase()
      .slice(0, 30);
    await use(
      `${slug}-${testInfo.workerIndex}-${Date.now()}@jaw-finance.local`,
    );
  },

  extraHTTPHeaders: async ({ userEmail, mockAI }, use) => {
    const headers: Record<string, string> = { [userEmailHeader]: userEmail };
    if (mockAI) headers["X-Test-Mock-AI"] = "1";
    await use(headers);
  },

  // Auto-fixture: sets up init script + optional mock reset & consent
  _setupUser: [
    async ({ context, request, userEmail, autoConsent }, use) => {
      await context.addInitScript((e: string) => {
        (window as { __TEST_USER_EMAIL__?: string }).__TEST_USER_EMAIL__ = e;
      }, userEmail);
      if (autoConsent) {
        await request.post("/mock-enable-banking/reset");
        await request.post("/api/consent", {
          headers: { [userEmailHeader]: userEmail },
        });
      }
      await use();
    },
    { auto: true },
  ],

  connectAndRefresh: async ({ page, request }, use) => {
    await use(async () => {
      await page.goto("/app/settings");
      await page.getByTestId("connect-button").click();
      await page.getByTestId("bank-option-bunq").click();
      await page.waitForURL("**/mock-enable-banking/consent**");
      await page.getByTestId("simulate-success").click();
      await page.waitForURL("**/app?connected=true");

      const statusRes = await request.get("/api/bank/status");
      const statusData = (await statusRes.json()) as {
        connections: { id: number }[];
      };
      const now = Date.now();
      for (const conn of statusData.connections) {
        await request.post("/mock-enable-banking/set-last-refreshed", {
          data: { connectionId: conn.id, timestamp: now },
        });
      }

      await page.goto("/app/settings");
      const refreshBtn = page.getByTestId("refresh-button");
      await expect(refreshBtn).toBeVisible({ timeout: 5_000 });
      await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes("/api/bank/refresh") && r.status() === 200,
        ),
        refreshBtn.click(),
      ]);
    });
  },

  connectAndRefreshHome: async ({ page, connectAndRefresh }, use) => {
    await use(async () => {
      await connectAndRefresh();
      await page.goto("/app");
      const feed = page.getByTestId("transactions-table");
      await expect(feed).toBeVisible({ timeout: 10_000 });
      return feed;
    });
  },
});

export { expect };
