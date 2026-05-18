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

test.beforeEach(async ({ page, context, request }, testInfo) => {
  const email = (testInfo as unknown as { _userEmail: string })._userEmail;
  await context.addInitScript((e: string) => {
    (window as { __TEST_USER_EMAIL__?: string }).__TEST_USER_EMAIL__ = e;
  }, email);
  void page;
  await request.post("/mock-enable-banking/reset");
  await request.post("/api/consent", { headers: { [userEmailHeader]: email } });
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
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/bank/refresh") && r.status() === 200,
    ),
    refreshBtn.click(),
  ]);
}

test.describe("Merchant Dictionary", () => {
  test("ingestion auto-tags matching transactions and sets merchant_db_evaluated", async ({
    page,
    request,
  }) => {
    await connectAndRefresh(page);

    // Fetch all transactions via API
    const res = await request.get("/api/bank/transactions");
    const data = (await res.json()) as {
      transactions: Array<{
        id: number;
        counterparty_name: string | null;
        remittance_info: string | null;
        merchant_db_evaluated: number;
        ai_evaluated: number;
      }>;
    };

    // Albert Heijn transaction should have been tagged
    const ah = data.transactions.find(
      (t) => t.counterparty_name === "Albert Heijn",
    );
    expect(ah).toBeDefined();
    expect(ah!.merchant_db_evaluated).toBeGreaterThan(0);
    expect(ah!.ai_evaluated).toBe(0);

    // Netflix should also be tagged
    const netflix = data.transactions.find(
      (t) => t.counterparty_name === "Netflix",
    );
    expect(netflix).toBeDefined();
    expect(netflix!.merchant_db_evaluated).toBeGreaterThan(0);

    // Verify actual tags were assigned
    const tagsRes = await request.get("/api/tags");
    const tagsData = (await tagsRes.json()) as {
      tags: Array<{ path: string; source: string; status: string }>;
    };
    const groceryTag = tagsData.tags.find(
      (t) => t.path === "food/groceries/albertheijn",
    );
    expect(groceryTag).toBeDefined();
    expect(groceryTag!.source).toBe("system");
    expect(groceryTag!.status).toBe("confirmed");

    const netflixTag = tagsData.tags.find(
      (t) => t.path === "subscriptions/streaming/netflix",
    );
    expect(netflixTag).toBeDefined();
    expect(netflixTag!.source).toBe("system");

    // Non-matching transaction (Employer BV / Salary) should also have merchant_db_evaluated set
    const salary = data.transactions.find(
      (t) => t.counterparty_name === "Employer BV",
    );
    expect(salary).toBeDefined();
    expect(salary!.merchant_db_evaluated).toBeGreaterThan(0);
  });

  test("settings page shows merchant dictionary controls", async ({ page }) => {
    await page.goto("/settings");
    await expect(
      page.getByTestId("merchant-evaluate-pending"),
    ).toBeVisible();
    await expect(
      page.getByTestId("merchant-evaluate-force"),
    ).toBeVisible();
  });

  test("evaluate-pending button processes unmatched transactions", async ({
    page,
    request,
  }) => {
    await connectAndRefresh(page);

    // Mark all transactions as not yet merchant-evaluated (simulate stale state)
    await request.post("/api/transactions/evaluate-merchant-all-force");

    // Now go to settings and trigger pending (should evaluate 0 since all are already done)
    await page.goto("/settings");
    await page.getByTestId("merchant-evaluate-pending").click();
    await expect(page.getByTestId("merchant-result")).toBeVisible({
      timeout: 10_000,
    });
    const text = await page.getByTestId("merchant-result").textContent();
    expect(text).toContain("Evaluated");
    expect(text).toContain("pending transactions");
  });

  test("re-evaluate all button processes all transactions", async ({
    page,
    request,
  }) => {
    await connectAndRefresh(page);

    await page.goto("/settings");
    await page.getByTestId("merchant-evaluate-force").click();
    await expect(page.getByTestId("merchant-result")).toBeVisible({
      timeout: 10_000,
    });
    const text = await page.getByTestId("merchant-result").textContent();
    expect(text).toContain("Re-evaluated");
    expect(text).toContain("transactions");
  });
});
