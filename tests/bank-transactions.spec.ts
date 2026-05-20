import { test, expect } from "./fixtures";

test.describe("Bank connection flow via mock", () => {
  test("user connects bank successfully and sees transactions", async ({
    page,
  }) => {
    await page.goto("/settings");

    // Should show Connect Bank button when no connection exists
    const connectBtn = page.getByTestId("connect-button");
    await expect(connectBtn).toBeVisible();

    // Click connect
    await connectBtn.click();

    // Select a bank from the dialog
    await page.getByTestId("bank-option-bunq").click();

    // Should be redirected to mock consent page
    await page.waitForURL("**/mock-enable-banking/consent**");
    await expect(page.locator("h1")).toContainText("Mock Bank Authentication");

    // Click "Simulate Success"
    await page.getByTestId("simulate-success").click();

    // Should redirect back to app with connected=true
    await page.waitForURL("**/?connected=true");
    // App clears the query param on load
    await expect(page.locator("h1")).toContainText("JAW Finance");

    // Refresh transactions from settings
    await page.goto("/settings");
    const refreshBtn = page.getByTestId("refresh-button");
    await expect(refreshBtn).toBeVisible({ timeout: 5_000 });
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/bank/refresh") && r.status() === 200,
      ),
      refreshBtn.click(),
    ]);

    // Navigate to home and verify transactions
    await page.goto("/");
    const feed = page.getByTestId("transactions-table");
    await expect(feed).toBeVisible({ timeout: 10_000 });
    await expect(feed).toContainText("Employer BV");
    await expect(feed).toContainText("1250.00");
    await expect(feed).toContainText("Albert Heijn");
    await expect(feed).toContainText("42.50");
  });

  test("bank selection dialog shows banks and supports search", async ({
    page,
  }) => {
    await page.goto("/settings");

    await page.getByTestId("connect-button").click();

    // Dialog should open with bank list
    const searchInput = page.getByTestId("bank-search-input");
    await expect(searchInput).toBeVisible();
    await expect(page.getByTestId("bank-option-bunq")).toBeVisible();
    await expect(page.getByTestId("bank-option-ING")).toBeVisible();
    await expect(page.getByTestId("bank-option-Revolut")).toBeVisible();

    // Search should filter the list
    await searchInput.fill("Rabo");
    await expect(page.getByTestId("bank-option-Rabobank")).toBeVisible();
    await expect(page.getByTestId("bank-option-bunq")).toBeHidden();
    await expect(page.getByTestId("bank-option-ING")).toBeHidden();
  });

  test("user cancels bank connection and sees error", async ({ page }) => {
    await page.goto("/settings");

    const connectBtn = page.getByTestId("connect-button");
    await expect(connectBtn).toBeVisible();
    await connectBtn.click();
    await page.getByTestId("bank-option-bunq").click();

    await page.waitForURL("**/mock-enable-banking/consent**");
    await page.getByTestId("simulate-cancel").click();

    // Should redirect back with error — navigate to settings to see it
    await page.waitForURL("**/?bank_error=**");
    await page.getByTestId("nav-settings").click();
    const errorAlert = page.getByTestId("error-alert");
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText("Denied data sharing consent");
  });

  test("user sees failure error when bank connection fails", async ({
    page,
  }) => {
    await page.goto("/settings");

    const connectBtn = page.getByTestId("connect-button");
    await expect(connectBtn).toBeVisible();
    await connectBtn.click();
    await page.getByTestId("bank-option-bunq").click();

    await page.waitForURL("**/mock-enable-banking/consent**");
    await page.getByTestId("simulate-failure").click();

    // Should redirect back with ASPSP failure error — navigate to settings to see it
    await page.waitForURL("**/?bank_error=**");
    await page.getByTestId("nav-settings").click();
    const errorAlert = page.getByTestId("error-alert");
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText("ASPSP connection failed");
  });

  test("user sees expiry warning when connection is about to expire", async ({
    page,
  }) => {
    const expiringDate = new Date(
      Date.now() + 5 * 24 * 60 * 60 * 1000,
    ).toISOString();

    await page.route("**/api/bank/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          connections: [
            {
              id: 1,
              aspsp_name: "Mock ASPSP",
              aspsp_country: "NL",
              iban: "NL00MOCK0123456789",
              valid_until: expiringDate,
            },
          ],
        }),
      }),
    );

    await page.goto("/settings");

    const warning = page.getByTestId("expiry-warning");
    await expect(warning).toBeVisible({ timeout: 5_000 });
    await expect(warning).toContainText("Connection expiring soon");
    await expect(warning).toContainText(
      new Date(expiringDate).toLocaleDateString(),
    );
  });

  test("homepage shows expired connection warning and reconnects to settings", async ({
    page,
  }) => {
    const expiredDate = new Date(
      Date.now() - 24 * 60 * 60 * 1000,
    ).toISOString();

    await page.route("**/api/bank/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          connections: [
            {
              id: 1,
              account_uid: "acc-expired",
              aspsp_name: "Mock ASPSP",
              aspsp_country: "NL",
              iban: "NL00MOCK0123456789",
              valid_until: expiredDate,
            },
          ],
        }),
      }),
    );

    await page.goto("/");

    const expiredAlert = page.getByTestId("expired-connection-alert");
    await expect(expiredAlert).toBeVisible({ timeout: 5_000 });
    await expect(expiredAlert).toContainText("Bank connection expired");

    await page.getByTestId("expired-connection-reconnect-button").click();
    await page.waitForURL("**/settings");

    const reconnectButton = page.getByTestId("reconnect-button");
    await expect(reconnectButton).toBeVisible();
    await expect(reconnectButton).toHaveClass(/bg-destructive\/10/);
  });

  test("duplicate transactions are not inserted on reconnect", async ({
    page,
  }) => {
    await page.goto("/settings");

    // First connection: connect and refresh
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

    await page.goto("/");
    const feed = page.getByTestId("transactions-table");
    await expect(feed).toBeVisible({ timeout: 10_000 });

    const firstCount = await feed.locator("[data-testid^='tx-row-']").count();
    expect(firstCount).toBeGreaterThan(0);

    // Second connection: reconnect from settings
    await page.goto("/settings");
    await page.getByTestId("reconnect-button").click();
    await page.getByTestId("bank-option-bunq").click();
    await page.waitForURL("**/mock-enable-banking/consent**");
    await page.getByTestId("simulate-success").click();
    await page.waitForURL("**/?connected=true");

    await page.goto("/settings");
    const refreshBtn2 = page.getByTestId("refresh-button");
    await expect(refreshBtn2).toBeVisible({ timeout: 5_000 });
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/bank/refresh") && r.status() === 200,
      ),
      refreshBtn2.click(),
    ]);

    await page.goto("/");
    // Wait for feed to re-render with fresh data
    await expect(feed).toBeVisible({ timeout: 10_000 });

    const secondCount = await feed.locator("[data-testid^='tx-row-']").count();
    expect(secondCount).toBe(firstCount);
  });

  test("user imports historical transactions and sees progress", async ({
    page,
  }) => {
    test.slow(); // import flow processes multiple date ranges via API
    await page.goto("/settings");

    // Connect bank first
    await page.getByTestId("connect-button").click();
    await page.getByTestId("bank-option-bunq").click();
    await page.waitForURL("**/mock-enable-banking/consent**");
    await page.getByTestId("simulate-success").click();
    await page.waitForURL("**/?connected=true");

    // Navigate to settings for import
    await page.goto("/settings");
    const importBtn = page.getByTestId("import-history-button");
    await expect(importBtn).toBeVisible({ timeout: 5_000 });

    // Open dropdown and select "1 Year"
    await importBtn.click();
    await page.getByTestId("import-1y").click();

    // Progress indicator should appear
    const progress = page.getByTestId("import-progress");
    await expect(progress).toBeVisible({ timeout: 5_000 });
    await expect(progress).toContainText("Importing:");

    // Wait for import to finish
    await expect(progress).toBeHidden({ timeout: 60_000 });

    // Navigate to home and check transactions
    await page.goto("/");
    const feed = page.getByTestId("transactions-table");
    await expect(feed).toBeVisible({ timeout: 10_000 });

    // Should have transactions from the historical import
    const rowCount = await feed.locator("[data-testid^='tx-row-']").count();
    expect(rowCount).toBeGreaterThan(0);

    // App should remain responsive — verify settings is reachable
    await page.goto("/settings");
    await expect(page.getByTestId("refresh-button")).toBeEnabled();
  });

  test("refresh only fetches transactions since latest in db", async ({
    page,
    request,
  }) => {
    await page.goto("/settings");

    // Connect bank
    await page.getByTestId("connect-button").click();
    await page.getByTestId("bank-option-bunq").click();
    await page.waitForURL("**/mock-enable-banking/consent**");
    await page.getByTestId("simulate-success").click();
    await page.waitForURL("**/?connected=true");

    // Set last_refreshed_at to now to prevent auto-refresh from firing on page load
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

    // Navigate to settings to verify connection is active
    await page.goto("/settings");

    // First refresh: no transactions in DB, falls back to 90 days ago →
    // current account: 5 recent txns + savings account: 3 recent txns = 8
    const refreshBtn = page.getByTestId("refresh-button");
    await expect(refreshBtn).toBeVisible({ timeout: 5_000 });

    const firstRefresh = await request.post("/api/bank/refresh");
    const firstBody = await firstRefresh.json();
    expect(firstBody.synced).toBe(8);

    // Second refresh: latest booking_date per account is yesterday (daysAgo(1)) →
    // current account: 1 txn (daysAgo(1)) + savings account: 1 txn (daysAgo(1)) = 2
    const secondRefresh = await request.post("/api/bank/refresh");
    const secondBody = await secondRefresh.json();
    expect(secondBody.synced).toBe(2);
  });
});
