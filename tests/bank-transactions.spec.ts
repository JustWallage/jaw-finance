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

  test("user sees failure error when bank connection fails", async ({ page }) => {
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
});
