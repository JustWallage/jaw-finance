import { test, expect } from "./fixtures";

test.describe("Merchant Dictionary", () => {
  test("ingestion auto-tags matching transactions and sets merchant_db_evaluated", async ({
    request,
    connectAndRefresh,
  }) => {
    await connectAndRefresh();

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
    await expect(page.getByTestId("merchant-evaluate-pending")).toBeVisible();
    await expect(page.getByTestId("merchant-evaluate-force")).toBeVisible();
  });

  test("evaluate-pending button processes unmatched transactions", async ({
    page,
    request,
    connectAndRefresh,
  }) => {
    await connectAndRefresh();

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
    connectAndRefresh,
  }) => {
    await connectAndRefresh();

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
