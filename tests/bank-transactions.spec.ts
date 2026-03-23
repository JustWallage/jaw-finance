import { test, expect } from "@playwright/test";

test.describe("Bank connection and transactions", () => {
  test("shows connect button when no active connection", async ({ page }) => {
    await page.route("**/api/bank/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ connections: [] }),
      }),
    );
    await page.route("**/api/bank/transactions", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ transactions: [] }),
      }),
    );

    await page.goto("/");
    const connectBtn = page.getByTestId("connect-button");
    await expect(connectBtn).toBeVisible();
    await expect(connectBtn).toContainText("Connect Bank");
  });

  test("shows transactions table with connected bank", async ({ page }) => {
    const futureDate = new Date(
      Date.now() + 60 * 24 * 60 * 60 * 1000,
    ).toISOString();

    await page.route("**/api/bank/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          connections: [
            {
              id: 1,
              session_id: "sess-1",
              account_uid: "acc-1",
              aspsp_name: "bunq",
              aspsp_country: "NL",
              iban: "NL00BUNQ0123456789",
              valid_until: futureDate,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        }),
      }),
    );

    await page.route("**/api/bank/transactions", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          transactions: [
            {
              id: 1,
              entry_reference: "ref-001",
              account_uid: "acc-1",
              amount: "42.50",
              currency: "EUR",
              credit_debit: "DBIT",
              status: "BOOK",
              booking_date: "2025-01-15",
              transaction_date: "2025-01-15",
              counterparty_name: "Albert Heijn",
              remittance_info: "Groceries",
              created_at: new Date().toISOString(),
            },
            {
              id: 2,
              entry_reference: "ref-002",
              account_uid: "acc-1",
              amount: "2500.00",
              currency: "EUR",
              credit_debit: "CRDT",
              status: "BOOK",
              booking_date: "2025-01-14",
              transaction_date: "2025-01-14",
              counterparty_name: "Employer BV",
              remittance_info: "Salary January",
              created_at: new Date().toISOString(),
            },
          ],
        }),
      }),
    );

    await page.goto("/");

    // Should show refresh button instead of connect
    const refreshBtn = page.getByTestId("refresh-button");
    await expect(refreshBtn).toBeVisible();

    // Should display transaction table
    const table = page.getByTestId("transactions-table");
    await expect(table).toBeVisible();

    // Verify transaction data renders
    await expect(table).toContainText("Albert Heijn");
    await expect(table).toContainText("42.50");
    await expect(table).toContainText("Employer BV");
    await expect(table).toContainText("2500.00");
  });

  test("shows expiry warning when connection expires within 14 days", async ({
    page,
  }) => {
    const soonDate = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    await page.route("**/api/bank/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          connections: [
            {
              id: 1,
              session_id: "sess-1",
              account_uid: "acc-1",
              aspsp_name: "bunq",
              aspsp_country: "NL",
              iban: null,
              valid_until: soonDate,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        }),
      }),
    );
    await page.route("**/api/bank/transactions", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ transactions: [] }),
      }),
    );

    await page.goto("/");

    const warning = page.getByTestId("expiry-warning");
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("Connection expiring soon");
  });

  test("displays bank_error from callback redirect", async ({ page }) => {
    await page.route("**/api/bank/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ connections: [] }),
      }),
    );
    await page.route("**/api/bank/transactions", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ transactions: [] }),
      }),
    );

    await page.goto("/?bank_error=Denied%20data%20sharing%20consent");

    const errorAlert = page.getByTestId("error-alert");
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText("Denied data sharing consent");
  });
});
