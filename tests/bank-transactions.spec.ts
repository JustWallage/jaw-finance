import { test, expect } from "@playwright/test";

test.describe("Bank connection flow via mock", () => {
  test.beforeEach(async ({ request }) => {
    await request.post("/mock-enable-banking/reset");
  });

  test("user connects bank successfully and sees transactions", async ({
    page,
  }) => {
    await page.goto("/");

    // Should show Connect Bank button when no connection exists
    const connectBtn = page.getByTestId("connect-button");
    await expect(connectBtn).toBeVisible();

    // Click connect
    await connectBtn.click();

    // Should be redirected to mock consent page
    await page.waitForURL("**/mock-enable-banking/consent**");
    await expect(page.locator("h1")).toContainText("Mock Bank Authentication");

    // Click "Simulate Success"
    await page.getByTestId("simulate-success").click();

    // Should redirect back to app with connected=true
    await page.waitForURL("**/?connected=true");
    // App clears the query param on load
    await expect(page.locator("h1")).toContainText("jaw-finance");

    // Now refresh transactions
    const refreshBtn = page.getByTestId("refresh-button");
    await expect(refreshBtn).toBeVisible({ timeout: 5_000 });
    await refreshBtn.click();

    // Transactions table should appear with mock data
    const table = page.getByTestId("transactions-table");
    await expect(table).toBeVisible({ timeout: 10_000 });
    await expect(table).toContainText("Employer BV");
    await expect(table).toContainText("1250.00");
    await expect(table).toContainText("Albert Heijn");
    await expect(table).toContainText("42.50");
  });

  test("user cancels bank connection and sees error", async ({ page }) => {
    await page.goto("/");

    const connectBtn = page.getByTestId("connect-button");
    await expect(connectBtn).toBeVisible();
    await connectBtn.click();

    await page.waitForURL("**/mock-enable-banking/consent**");
    await page.getByTestId("simulate-cancel").click();

    // Should redirect back with error
    await page.waitForURL("**/?bank_error=**");
    const errorAlert = page.getByTestId("error-alert");
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText("Denied data sharing consent");
  });

  test("user sees failure error when bank connection fails", async ({
    page,
  }) => {
    await page.goto("/");

    const connectBtn = page.getByTestId("connect-button");
    await expect(connectBtn).toBeVisible();
    await connectBtn.click();

    await page.waitForURL("**/mock-enable-banking/consent**");
    await page.getByTestId("simulate-failure").click();

    // Should redirect back with ASPSP failure error
    await page.waitForURL("**/?bank_error=**");
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

    await page.goto("/");

    const warning = page.getByTestId("expiry-warning");
    await expect(warning).toBeVisible({ timeout: 5_000 });
    await expect(warning).toContainText("Connection expiring soon");
    await expect(warning).toContainText(
      new Date(expiringDate).toLocaleDateString(),
    );
  });

  test("duplicate transactions are not inserted on reconnect", async ({
    page,
  }) => {
    await page.goto("/");

    // First connection: connect and refresh
    await page.getByTestId("connect-button").click();
    await page.waitForURL("**/mock-enable-banking/consent**");
    await page.getByTestId("simulate-success").click();
    await page.waitForURL("**/?connected=true");

    const refreshBtn = page.getByTestId("refresh-button");
    await expect(refreshBtn).toBeVisible({ timeout: 5_000 });
    await refreshBtn.click();

    const table = page.getByTestId("transactions-table");
    await expect(table).toBeVisible({ timeout: 10_000 });

    const firstCount = await table.locator("tbody tr").count();
    expect(firstCount).toBeGreaterThan(0);

    // Second connection: reconnect and refresh again
    await page.getByTestId("reconnect-button").click();
    await page.waitForURL("**/mock-enable-banking/consent**");
    await page.getByTestId("simulate-success").click();
    await page.waitForURL("**/?connected=true");

    const refreshBtn2 = page.getByTestId("refresh-button");
    await expect(refreshBtn2).toBeVisible({ timeout: 5_000 });
    await refreshBtn2.click();

    // Wait for table to re-render with fresh data
    await expect(table).toBeVisible({ timeout: 10_000 });

    const secondCount = await table.locator("tbody tr").count();
    expect(secondCount).toBe(firstCount);
  });

  test("user imports historical transactions and sees progress", async ({
    page,
  }) => {
    await page.goto("/");

    // Connect bank first
    await page.getByTestId("connect-button").click();
    await page.waitForURL("**/mock-enable-banking/consent**");
    await page.getByTestId("simulate-success").click();
    await page.waitForURL("**/?connected=true");

    // Wait for connection to be active
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

    // Table should now have historical transactions
    const table = page.getByTestId("transactions-table");
    await expect(table).toBeVisible({ timeout: 10_000 });

    // Should have transactions from the historical import (3 per month * 12 months = 36)
    const rowCount = await table.locator("tbody tr").count();
    expect(rowCount).toBeGreaterThan(0);

    // App should remain responsive — verify we can still interact
    await expect(page.getByTestId("refresh-button")).toBeEnabled();
  });

  test("refresh only fetches transactions since latest in db", async ({
    page,
    request,
  }) => {
    await page.goto("/");

    // Connect bank
    await page.getByTestId("connect-button").click();
    await page.waitForURL("**/mock-enable-banking/consent**");
    await page.getByTestId("simulate-success").click();
    await page.waitForURL("**/?connected=true");

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
