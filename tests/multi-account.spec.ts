import { test, expect, type Page } from "@playwright/test";

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

test.describe("Multi-account support", () => {
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

  async function connectAndRefresh(page: Page) {
    await page.goto("/settings");
    await page.getByTestId("connect-button").click();
    await page.getByTestId("bank-option-bunq").click();
    await page.waitForURL("**/mock-enable-banking/consent**");
    await page.getByTestId("simulate-success").click();
    await page.waitForURL("**/?connected=true");

    await page.goto("/settings");
    const refreshBtn = page.getByTestId("refresh-button");
    await expect(refreshBtn).toBeVisible({ timeout: 5_000 });
    await refreshBtn.click();

    await page.goto("/");
    const feed = page.getByTestId("transactions-table");
    await expect(feed).toBeVisible({ timeout: 10_000 });
    return feed;
  }

  test("mock API returns multiple accounts after connection", async ({
    page,
    request,
  }) => {
    await page.goto("/settings");
    await page.getByTestId("connect-button").click();
    await page.getByTestId("bank-option-bunq").click();
    await page.waitForURL("**/mock-enable-banking/consent**");
    await page.getByTestId("simulate-success").click();
    await page.waitForURL("**/?connected=true");

    const res = await request.get("/api/bank/status");
    const data = await res.json();
    expect(data.connections).toHaveLength(2);
    expect(data.connections[0].iban).toBe("NL00MOCK0123456789");
    expect(data.connections[1].iban).toBeNull();
  });

  test("account switcher defaults to first account on fresh load", async ({
    page,
  }) => {
    await connectAndRefresh(page);

    const switcher = page.getByTestId("account-switcher");
    await expect(switcher).toBeVisible();
    // First account has IBAN, so it should display the IBAN
    await expect(switcher).toContainText("NL00MOCK0123456789");
  });

  test("account switcher displays IBAN and falls back to account_uid", async ({
    page,
  }) => {
    await connectAndRefresh(page);

    // Open the account switcher
    const switcher = page.getByTestId("account-switcher");
    await switcher.click();

    // Check that "All Accounts" option is visible
    await expect(page.getByTestId("account-option-all")).toBeVisible();

    // First account should show IBAN
    const options = page.locator("[data-slot='select-item']");
    // "All Accounts" + 2 accounts = 3 items
    await expect(options).toHaveCount(3);

    // The IBAN account should display the IBAN
    await expect(options.nth(1)).toContainText("NL00MOCK0123456789");

    // The non-IBAN account should display the account_uid
    await expect(options.nth(2)).toContainText("mock-account-uid-");
    // It should NOT contain an IBAN pattern
    const savingsText = await options.nth(2).textContent();
    expect(savingsText).toContain("-savings");
  });

  test("selecting an account filters the transaction list", async ({
    page,
  }) => {
    await connectAndRefresh(page);

    const table = page.getByTestId("transactions-table");

    // Default: first account (current account with IBAN)
    // Should show current account transactions (Employer BV, Albert Heijn, etc.)
    await expect(table).toContainText("Employer BV");
    const firstAccountRows = await table
      .locator("[data-testid^='tx-row-']")
      .count();
    expect(firstAccountRows).toBe(5);

    // Switch to the savings account (second option)
    const switcher = page.getByTestId("account-switcher");
    await switcher.click();
    const options = page.locator("[data-slot='select-item']");
    await options.nth(2).click();

    // Wait for new transactions to load
    await expect(table).toContainText("Savings transfer", { timeout: 10_000 });
    const savingsRows = await table.locator("[data-testid^='tx-row-']").count();
    expect(savingsRows).toBe(3);

    // Should NOT contain current account transactions
    await expect(table).not.toContainText("Employer BV");
  });

  test("selecting All Accounts shows all transactions", async ({ page }) => {
    await connectAndRefresh(page);

    const table = page.getByTestId("transactions-table");

    // Get count for first account
    const firstAccountRows = await table
      .locator("[data-testid^='tx-row-']")
      .count();
    expect(firstAccountRows).toBe(5);

    // Switch to All Accounts
    const switcher = page.getByTestId("account-switcher");
    await switcher.click();
    await page.getByTestId("account-option-all").click();

    // Wait for all transactions to load
    await expect(table).toContainText("Savings transfer", { timeout: 10_000 });
    await expect(table).toContainText("Employer BV");

    // Should have both current (5) and savings (3) transactions
    const allRows = await table.locator("[data-testid^='tx-row-']").count();
    expect(allRows).toBe(8);
  });

  test("can set a nickname and switcher shows it instead of IBAN", async ({
    page,
  }) => {
    await connectAndRefresh(page);

    // Navigate to settings to edit nicknames
    await page.getByTestId("nav-settings").click();
    await page.getByTestId("edit-nicknames-button").click();

    // Dialog should show an input for the IBAN account (placeholder = IBAN)
    const ibanInput = page.locator('[placeholder="NL00MOCK0123456789"]');
    await expect(ibanInput).toBeVisible();

    // Type a nickname for the IBAN account
    await ibanInput.fill("My Checking");
    await page.getByTestId("save-nicknames-button").click();

    // After save, switcher should show the nickname instead of the IBAN
    const switcher = page.getByTestId("account-switcher");
    await expect(switcher).toContainText("My Checking", { timeout: 5_000 });
    await expect(switcher).not.toContainText("NL00MOCK0123456789");

    // The dropdown option should also reflect the nickname
    await switcher.click();
    const options = page.locator("[data-slot='select-item']");
    await expect(options.nth(1)).toContainText("My Checking");
    await expect(options.nth(1)).not.toContainText("NL00MOCK0123456789");
  });

  test("clearing a nickname reverts switcher to IBAN", async ({ page }) => {
    await connectAndRefresh(page);

    const switcher = page.getByTestId("account-switcher");

    // Set a nickname first via settings
    await page.getByTestId("nav-settings").click();
    await page.getByTestId("edit-nicknames-button").click();
    await page.locator('[placeholder="NL00MOCK0123456789"]').fill("Temp Name");
    await page.getByTestId("save-nicknames-button").click();
    await expect(switcher).toContainText("Temp Name", { timeout: 5_000 });

    // Now clear it
    await page.getByTestId("edit-nicknames-button").click();
    await page.locator('[placeholder="NL00MOCK0123456789"]').fill("");
    await page.getByTestId("save-nicknames-button").click();

    // Should revert to IBAN
    await expect(switcher).toContainText("NL00MOCK0123456789", {
      timeout: 5_000,
    });
    await expect(switcher).not.toContainText("Temp Name");
  });

  test("refreshing page preserves selected account via local storage", async ({
    page,
  }) => {
    await connectAndRefresh(page);

    const table = page.getByTestId("transactions-table");

    // Switch to savings account
    const switcher = page.getByTestId("account-switcher");
    await switcher.click();
    const options = page.locator("[data-slot='select-item']");
    await options.nth(2).click();

    // Wait for savings transactions
    await expect(table).toContainText("Savings transfer", { timeout: 10_000 });

    // Reload page
    await page.reload();

    // Account switcher should still show savings account (not IBAN)
    const switcherAfterReload = page.getByTestId("account-switcher");
    await expect(switcherAfterReload).toBeVisible({ timeout: 5_000 });
    // Should show the savings account uid (not the IBAN)
    await expect(switcherAfterReload).toContainText("-savings");

    // Transactions should be savings account transactions
    const tableAfterReload = page.getByTestId("transactions-table");
    await expect(tableAfterReload).toBeVisible({ timeout: 10_000 });
    await expect(tableAfterReload).toContainText("Savings transfer");
    await expect(tableAfterReload).not.toContainText("Employer BV");
  });
});
