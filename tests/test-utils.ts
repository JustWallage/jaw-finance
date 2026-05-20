import {
  expect,
  type Page,
  type APIRequestContext,
  type Locator,
} from "@playwright/test";

export async function connectAndRefresh(
  page: Page,
  request: APIRequestContext,
): Promise<void> {
  await page.goto("/settings");
  await page.getByTestId("connect-button").click();
  await page.getByTestId("bank-option-bunq").click();
  await page.waitForURL("**/mock-enable-banking/consent**");
  await page.getByTestId("simulate-success").click();
  await page.waitForURL("**/?connected=true");

  // Set last_refreshed_at to now to prevent auto-refresh from firing on settings page load
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

export async function connectAndRefreshHome(
  page: Page,
  request: APIRequestContext,
): Promise<Locator> {
  await connectAndRefresh(page, request);
  await page.goto("/");
  const feed = page.getByTestId("transactions-table");
  await expect(feed).toBeVisible({ timeout: 10_000 });
  return feed;
}
