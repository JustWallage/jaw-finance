import { test, expect, userEmailHeader } from "./fixtures";

test.describe("Auto-refresh on page load", () => {
  test("auto-refresh fires when last_refreshed_at is stale (>2h)", async ({
    page,
    request,
    userEmail,
    connectAndRefresh,
  }) => {
    await connectAndRefresh();

    // Set last_refreshed_at to 3 hours ago to make it stale
    const statusRes = await request.get("/api/bank/status", {
      headers: { [userEmailHeader]: userEmail },
    });
    const statusData = (await statusRes.json()) as {
      connections: { id: number }[];
    };
    const connId = statusData.connections[0].id;

    const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;

    await request.post("/mock-enable-banking/set-last-refreshed", {
      headers: { [userEmailHeader]: userEmail },
      data: { connectionId: connId, timestamp: threeHoursAgo },
    });

    // Navigate to homepage — auto-refresh should fire
    const refreshPromise = page.waitForResponse(
      (r) => r.url().includes("/api/bank/refresh") && r.status() === 200,
    );
    await page.goto("/app");
    await refreshPromise;

    // Transactions should be visible
    await expect(page.getByTestId("transactions-table")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("no auto-refresh when last_refreshed_at is fresh (≤2h)", async ({
    page,
    connectAndRefresh,
  }) => {
    await connectAndRefresh();

    // After connectAndRefresh, last_refreshed_at is now (fresh)
    // Navigate to homepage — NO auto-refresh should fire
    let refreshCalled = false;
    await page.route("**/api/bank/refresh", (route) => {
      refreshCalled = true;
      return route.continue();
    });

    await page.goto("/app");
    await expect(page.getByTestId("transactions-table")).toBeVisible({
      timeout: 10_000,
    });

    // Wait a bit to ensure no refresh fires
    await page.waitForTimeout(1000);
    expect(refreshCalled).toBe(false);
  });

  test("manual refresh button always works regardless of staleness", async ({
    page,
    connectAndRefresh,
  }) => {
    await connectAndRefresh();

    // Navigate to homepage (fresh, no auto-refresh)
    await page.goto("/app");
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
