import { test, expect } from "./fixtures";
import type { APIRequestContext } from "@playwright/test";

test.use({ mockAI: true });

async function seedFoodTag(request: APIRequestContext) {
  // Create a "food" tag and assign to first transaction so the mock NL query returns results
  const txRes = await request.get("/api/bank/transactions");
  const txData = (await txRes.json()) as {
    transactions: Array<{ id: number }>;
  };
  const txId = txData.transactions[0].id;

  const tagRes = await request.post("/api/tags", {
    data: { name: "food", path: "food" },
  });
  const tag = ((await tagRes.json()) as { tag: { id: number } }).tag;
  await request.put(`/api/transactions/${txId}/tags`, {
    data: { tag_id: tag.id },
  });
  return { txId, tagId: tag.id };
}

test.describe("Natural language chat", () => {
  test("chat input is visible after connecting bank", async ({
    page,
    connectAndRefreshHome,
  }) => {
    await page.goto("/");
    // Chat should be visible but disabled without a connection
    await expect(page.getByTestId("chat-form")).toBeVisible();
    await expect(page.getByTestId("chat-input")).toBeDisabled();

    await connectAndRefreshHome();
    await expect(page.getByTestId("chat-form")).toBeVisible();
    await expect(page.getByTestId("chat-input")).toBeEnabled();
    await expect(page.getByTestId("chat-submit")).toBeVisible();
  });

  test("submitting a question shows summary card with results", async ({
    page,
    request,
    connectAndRefreshHome,
  }) => {
    await connectAndRefreshHome();
    await seedFoodTag(request);

    // Type question and submit (navigates to /chat)
    await page.getByTestId("chat-input").fill("How much did I spend on food?");
    await page.getByTestId("chat-submit").click();

    // Should navigate to chat page
    await page.waitForURL("**/chat**");

    // Wait for result card
    const card = page.getByTestId("chat-result-card");
    await expect(card).toBeVisible({ timeout: 15_000 });

    // Summary text should be present
    const summary = card.getByTestId("chat-summary");
    await expect(summary).toBeVisible();
    await expect(summary).not.toHaveText("");

    // Totals should be visible
    await expect(card.getByTestId("chat-total-income")).toBeVisible();
    await expect(card.getByTestId("chat-total-expense")).toBeVisible();
  });

  test("clicking 'View all X transactions' expands transaction list", async ({
    page,
    request,
    connectAndRefreshHome,
  }) => {
    await connectAndRefreshHome();
    await seedFoodTag(request);

    await page.getByTestId("chat-input").fill("Show my food transactions");
    await page.getByTestId("chat-submit").click();

    // Navigate to chat page
    await page.waitForURL("**/chat**");

    const card = page.getByTestId("chat-result-card");
    await expect(card).toBeVisible({ timeout: 15_000 });

    // Toggle button should reference transaction count
    const toggleBtn = card.getByTestId("chat-toggle-transactions");
    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn).toContainText("View all");
    await expect(toggleBtn).toContainText("transaction");

    // Transaction table should not be visible yet
    await expect(card.getByTestId("chat-transactions-table")).not.toBeVisible();

    // Click to expand
    await toggleBtn.click();
    await expect(card.getByTestId("chat-transactions-table")).toBeVisible();

    // Should have at least 1 transaction row
    const rows = card.locator("[data-testid^='chat-tx-']");
    await expect(rows.first()).toBeVisible();

    // Click again to collapse
    await toggleBtn.click();
    await expect(card.getByTestId("chat-transactions-table")).not.toBeVisible();
  });

  test("empty question cannot be submitted", async ({
    page,
    connectAndRefreshHome,
  }) => {
    await connectAndRefreshHome();

    const submitBtn = page.getByTestId("chat-submit");
    await expect(submitBtn).toBeDisabled();

    // Type spaces only
    await page.getByTestId("chat-input").fill("   ");
    await expect(submitBtn).toBeDisabled();
  });

  test("chat endpoint returns structured data via API", async ({
    request,
    connectAndRefreshHome,
  }) => {
    await connectAndRefreshHome();
    await seedFoodTag(request);

    const res = await request.post("/api/chat", {
      data: { question: "How much did I spend on food?" },
    });
    expect(res.ok()).toBe(true);

    const data = (await res.json()) as {
      summary: string;
      transactions: Array<{ id: number }>;
      totalIncome: number;
      totalExpense: number;
      byPath: Array<{
        path: string;
        totalIncome: number;
        totalExpense: number;
        count: number;
      }>;
    };

    expect(data.summary).toBeTruthy();
    expect(typeof data.summary).toBe("string");
    expect(Array.isArray(data.transactions)).toBe(true);
    expect(typeof data.totalIncome).toBe("number");
    expect(typeof data.totalExpense).toBe("number");
    expect(Array.isArray(data.byPath)).toBe(true);
    if (data.transactions.length > 0) {
      expect(data.byPath.length).toBeGreaterThan(0);
      const first = data.byPath[0];
      expect(typeof first.path).toBe("string");
      expect(typeof first.totalIncome).toBe("number");
      expect(typeof first.totalExpense).toBe("number");
      expect(typeof first.count).toBe("number");
    }
  });

  test("chat endpoint rejects empty question", async ({
    request,
    connectAndRefreshHome,
  }) => {
    await connectAndRefreshHome();

    const res = await request.post("/api/chat", {
      data: { question: "" },
    });
    expect(res.status()).toBe(400);
  });
});
