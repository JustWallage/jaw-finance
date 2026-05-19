import { test, expect } from "@playwright/test";

const isCi = !!process.env.CI;

const userEmailHeader = isCi
  ? "X-Test-User-Email"
  : "Cf-Access-Authenticated-User-Email";

test.use({
  extraHTTPHeaders: async ({}, use, testInfo) => {
    const slug = testInfo.title
      .replace(/[^a-z0-9]+/gi, "-")
      .toLowerCase()
      .slice(0, 30);
    const email = `${slug}-${testInfo.workerIndex}-${Date.now()}@jaw-finance.local`;
    (testInfo as unknown as { _userEmail: string })._userEmail = email;
    await use({ [userEmailHeader]: email });
  },
});

/** Helper: connect a bank and do first refresh so the user has transactions. */
async function connectAndRefresh(
  page: ReturnType<typeof test["info"]> extends never ? never : Parameters<Parameters<typeof test>[1]>[0]["page"],
  request: Parameters<Parameters<typeof test>[1]>[0]["request"],
) {
  await page.goto("/settings");
  await page.getByTestId("connect-button").click();
  await page.getByTestId("bank-option-bunq").click();
  await page.waitForURL("**/mock-enable-banking/consent**");
  await page.getByTestId("simulate-success").click();
  await page.waitForURL("**/?connected=true");

  await page.goto("/settings");
  const refreshBtn = page.getByTestId("refresh-button");
  await expect(refreshBtn).toBeVisible({ timeout: 5_000 });
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/bank/refresh") && r.status() === 200,
    ),
    refreshBtn.click(),
  ]);
}

test.describe("Auto-refresh on page load", () => {
  test.beforeEach(async ({ page, context, request }, testInfo) => {
    const email = (testInfo as unknown as { _userEmail: string })._userEmail;
    await context.addInitScript((e: string) => {
      (window as { __TEST_USER_EMAIL__?: string }).__TEST_USER_EMAIL__ = e;
    }, email);
    void page;
    await request.post("/mock-enable-banking/reset");
    await request.post("/api/consent", {
      headers: { [userEmailHeader]: email },
    });
  });

  test("auto-refresh fires when last_refreshed_at is stale (>2h)", async ({
    page,
    request,
  }, testInfo) => {
    const email = (testInfo as unknown as { _userEmail: string })._userEmail;
    await connectAndRefresh(page, request);

    // Set last_refreshed_at to 3 hours ago to make it stale
    const statusRes = await request.get("/api/bank/status", {
      headers: { [userEmailHeader]: email },
    });
    const statusData = (await statusRes.json()) as {
      connections: { id: number }[];
    };
    const connId = statusData.connections[0].id;

    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19);

    await request.post("/mock-enable-banking/set-last-refreshed", {
      headers: { [userEmailHeader]: email },
      data: { connectionId: connId, timestamp: threeHoursAgo },
    });

    // Navigate to homepage — auto-refresh should fire
    const refreshPromise = page.waitForResponse(
      (r) => r.url().includes("/api/bank/refresh") && r.status() === 200,
    );
    await page.goto("/");
    await refreshPromise;

    // Transactions should be visible
    await expect(page.getByTestId("transactions-table")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("no auto-refresh when last_refreshed_at is fresh (≤2h)", async ({
    page,
    request,
  }) => {
    await connectAndRefresh(page, request);

    // After connectAndRefresh, last_refreshed_at is now (fresh)
    // Navigate to homepage — NO auto-refresh should fire
    let refreshCalled = false;
    await page.route("**/api/bank/refresh", (route) => {
      refreshCalled = true;
      return route.continue();
    });

    await page.goto("/");
    await expect(page.getByTestId("transactions-table")).toBeVisible({
      timeout: 10_000,
    });

    // Wait a bit to ensure no refresh fires
    await page.waitForTimeout(1000);
    expect(refreshCalled).toBe(false);
  });

  test("manual refresh button always works regardless of staleness", async ({
    page,
    request,
  }) => {
    await connectAndRefresh(page, request);

    // Navigate to homepage (fresh, no auto-refresh)
    await page.goto("/");
    await expect(page.getByTestId("transactions-table")).toBeVisible({
      timeout: 10_000,
    });

    // Click the manual refresh button — should always trigger
    const refreshBtn = page.getByTestId("refresh-transactions-button");
    await expect(refreshBtn).toBeVisible();

    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/bank/refresh") && r.status() === 200,
      ),
      refreshBtn.click(),
    ]);

    // Transactions still visible
    await expect(page.getByTestId("transactions-table")).toBeVisible();
  });
});
