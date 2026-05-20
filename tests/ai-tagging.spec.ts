import { test, expect } from "./fixtures";

test.use({ mockAI: true });

test.describe("AI auto-tagging", () => {
  test("AI Evaluate button assigns mocked tags, marks new ones unconfirmed, and sets ai_evaluated", async ({
    page,
    request,
    connectAndRefreshHome,
  }) => {
    const table = await connectAndRefreshHome();

    // Open first transaction modal; capture its id.
    const firstRow = table.locator("[data-testid^='tx-row-']").first();
    const testId = await firstRow.getAttribute("data-testid");
    const txId = Number(testId?.replace("tx-row-", ""));
    expect(txId).toBeGreaterThan(0);

    await firstRow.click();
    const dialog = page.getByTestId("transaction-dialog");
    await expect(dialog).toBeVisible();

    // Click AI Evaluate
    await dialog.getByTestId("ai-evaluate-button").click();

    // Mocked tag "ai-mock/new-parent/new-leaf" should appear on the transaction
    await expect(
      dialog.getByTestId("tag-badge-ai-mock/new-parent/new-leaf"),
    ).toBeVisible({ timeout: 5_000 });

    // The new tag should be unconfirmed in the DB
    const tagsRes = await request.get("/api/tags?status=unconfirmed");
    const tagsData = (await tagsRes.json()) as {
      tags: Array<{
        path: string;
        status: string;
        source: string;
        reasoning: string | null;
      }>;
    };
    const leafTag = tagsData.tags.find(
      (t) => t.path === "ai-mock/new-parent/new-leaf",
    );
    expect(leafTag).toBeDefined();
    expect(leafTag?.status).toBe("unconfirmed");
    expect(leafTag?.source).toBe("llm");
    // Leaf carries the LLM's root reasoning string.
    expect(leafTag?.reasoning).toBe(
      "Deterministic mock reasoning for E2E tests.",
    );

    // The auto-created ancestor tag must exist with reasoning = null.
    const parentTag = tagsData.tags.find(
      (t) => t.path === "ai-mock/new-parent",
    );
    expect(parentTag).toBeDefined();
    expect(parentTag?.source).toBe("llm");
    expect(parentTag?.status).toBe("unconfirmed");
    expect(parentTag?.reasoning).toBeNull();

    // ai_evaluated should be set — pending count must have decreased by exactly 1.
    const allTxRes = await request.get("/api/bank/transactions");
    const allTxData = (await allTxRes.json()) as { transactions: unknown[] };
    const totalTxCount = allTxData.transactions.length;

    const countRes = await request.get("/api/transactions/pending-count");
    const countData = (await countRes.json()) as { count: number };
    expect(countData.count).toBe(totalTxCount - 1);
  });

  test("Tags page: unconfirmed appears at top, confirming moves it down", async ({
    page,
    connectAndRefreshHome,
  }) => {
    const table = await connectAndRefreshHome();

    // Trigger AI Evaluate to create an unconfirmed tag
    await table.locator("[data-testid^='tx-row-']").first().click();
    await page
      .getByTestId("transaction-dialog")
      .getByTestId("ai-evaluate-button")
      .click();
    await expect(
      page
        .getByTestId("transaction-dialog")
        .getByTestId("tag-badge-ai-mock/new-parent/new-leaf"),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    // Navigate to Trends page
    await page.getByTestId("nav-trends").click();
    await expect(page).toHaveURL(/\/trends$/);

    const unconfirmed = page.getByTestId("unconfirmed-section");
    const confirmed = page.getByTestId("confirmed-section");
    await expect(
      unconfirmed.getByTestId("tag-row-ai-mock/new-parent/new-leaf"),
    ).toBeVisible();
    await expect(
      confirmed.getByTestId("tag-row-ai-mock/new-parent/new-leaf"),
    ).toHaveCount(0);

    // Click the tag → detail dialog → Confirm
    await unconfirmed
      .getByTestId("tag-row-ai-mock/new-parent/new-leaf")
      .click();
    const detail = page.getByTestId("tag-detail-dialog");
    await expect(detail).toBeVisible();
    await detail.getByTestId("tag-confirm-button").click();

    // Now it should be in the confirmed section
    await expect(
      confirmed.getByTestId("tag-row-ai-mock/new-parent/new-leaf"),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      unconfirmed.getByTestId("tag-row-ai-mock/new-parent/new-leaf"),
    ).toHaveCount(0);
  });

  test("Editing an unconfirmed tag's name keeps it unconfirmed and renames its path", async ({
    page,
    request,
    connectAndRefreshHome,
  }) => {
    const table = await connectAndRefreshHome();
    await table.locator("[data-testid^='tx-row-']").first().click();
    await page
      .getByTestId("transaction-dialog")
      .getByTestId("ai-evaluate-button")
      .click();
    await expect(
      page
        .getByTestId("transaction-dialog")
        .getByTestId("tag-badge-ai-mock/new-parent/new-leaf"),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByTestId("nav-trends").click();
    await page
      .getByTestId("unconfirmed-section")
      .getByTestId("tag-row-ai-mock/new-parent/new-leaf")
      .click();

    const detail = page.getByTestId("tag-detail-dialog");
    await detail.getByTestId("tag-edit-button").click();
    const input = detail.getByTestId("tag-edit-input");
    await input.fill("renamed-leaf");
    await detail.getByTestId("tag-edit-save").click();

    // Detail dialog closes; new path should appear in unconfirmed section
    await expect(
      page
        .getByTestId("unconfirmed-section")
        .getByTestId("tag-row-ai-mock/new-parent/renamed-leaf"),
    ).toBeVisible({ timeout: 5_000 });

    // DB check: still unconfirmed
    const tagsRes = await request.get("/api/tags?status=unconfirmed");
    const tagsData = (await tagsRes.json()) as {
      tags: Array<{ path: string; status: string }>;
    };
    expect(
      tagsData.tags.some((t) => t.path === "ai-mock/new-parent/renamed-leaf"),
    ).toBe(true);
  });

  test("Rejecting a tag unlinks it from transactions and shows it in Rejected modal", async ({
    page,
    request,
    connectAndRefreshHome,
  }) => {
    const table = await connectAndRefreshHome();

    // Click the first row, capture its tx id from the data-testid attribute
    const firstRow = table.locator("[data-testid^='tx-row-']").first();
    const testId = await firstRow.getAttribute("data-testid");
    const txId = Number(testId?.replace("tx-row-", ""));
    expect(txId).toBeGreaterThan(0);

    await firstRow.click();
    await page
      .getByTestId("transaction-dialog")
      .getByTestId("ai-evaluate-button")
      .click();
    await expect(
      page
        .getByTestId("transaction-dialog")
        .getByTestId("tag-badge-ai-mock/new-parent/new-leaf"),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    // Navigate to Trends, reject the unconfirmed tag
    await page.getByTestId("nav-trends").click();
    await page
      .getByTestId("unconfirmed-section")
      .getByTestId("tag-row-ai-mock/new-parent/new-leaf")
      .click();
    await page
      .getByTestId("tag-detail-dialog")
      .getByTestId("tag-reject-button")
      .click();

    // Tag should disappear from both unconfirmed and confirmed sections
    await expect(
      page.getByTestId("tag-row-ai-mock/new-parent/new-leaf"),
    ).toHaveCount(0, { timeout: 5_000 });

    // Transaction should no longer have the rejected tag linked
    const txTagsRes = await request.get(`/api/transactions/${txId}/tags`);
    const txTagsData = (await txTagsRes.json()) as {
      tags: Array<{ path: string }>;
    };
    expect(
      txTagsData.tags.some((t) => t.path === "ai-mock/new-parent/new-leaf"),
    ).toBe(false);

    // Open Rejected Tags modal — rejected tag should be listed
    await page.getByTestId("view-rejected-button").click();
    const rejectedDialog = page.getByTestId("rejected-dialog");
    await expect(rejectedDialog).toBeVisible();
    await expect(
      rejectedDialog.getByTestId("rejected-badge-ai-mock/new-parent/new-leaf"),
    ).toBeVisible();
  });

  test("Historical RAG: prompt includes tag frequencies and filters out <=10% tags", async ({
    page,
    request,
    connectAndRefreshHome,
  }) => {
    const table = await connectAndRefreshHome();

    // Switch to All Accounts so the current-account transactions are visible
    // regardless of which account the switcher defaults to.
    const switcher = page.getByTestId("account-switcher");
    await switcher.click();
    await page.getByTestId("account-option-all").click();
    await expect(
      table
        .locator("[data-testid^='tx-row-']")
        .filter({ hasText: "Albert Heijn" })
        .first(),
    ).toBeVisible({ timeout: 10_000 });

    // Find the "Albert Heijn" / Groceries transaction (MOCK-TX-002)
    const groceriesRow = table
      .locator("[data-testid^='tx-row-']")
      .filter({ hasText: "Albert Heijn" })
      .first();
    const testId = await groceriesRow.getAttribute("data-testid");
    const transactionId = Number(testId?.replace("tx-row-", ""));
    expect(transactionId).toBeGreaterThan(0);

    // Seed 9 historical transactions with food/groceries + 1 with noise (10% → filtered)
    await request.post("/mock-enable-banking/seed-historical", {
      data: {
        transactions: [
          ...Array.from({ length: 9 }, () => ({
            remittance_info: "Groceries",
            counterparty_name: "Albert Heijn",
            tag_paths: ["food/groceries"],
          })),
          {
            remittance_info: "Groceries",
            counterparty_name: "Albert Heijn",
            tag_paths: ["noise"],
          },
        ],
      },
    });

    // Call evaluate in mock mode and request the built prompt back
    const evalRes = await request.post(
      `/api/transactions/${transactionId}/evaluate`,
      { headers: { "X-Test-Return-Prompt": "1" } },
    );
    expect(evalRes.ok()).toBe(true);
    const evalData = (await evalRes.json()) as { prompt?: string };
    const prompt = evalData.prompt ?? "";

    // Description block: food/groceries appears in 9/10 = 90% → included
    expect(prompt).toContain("food/groceries (90%)");
    // Counterparty block: same distribution → also 90%
    expect(prompt).toContain(
      "Tags of previous transactions with the exact same counterparty name:",
    );
    // noise appears in exactly 10% → NOT strictly > 10%, must be absent from historical sections
    expect(prompt).not.toMatch(/noise \(\d+%\)/);
  });

  test("Batch evaluate: processes transactions, assigns tags, and sets ai_evaluated epoch timestamp", async ({
    page,
    request,
    connectAndRefreshHome,
  }) => {
    // Connect and refresh to populate transactions.
    await connectAndRefreshHome();

    // Confirm all transactions start as pending.
    const beforeCount = (
      (await request
        .get("/api/transactions/pending-count")
        .then((r) => r.json())) as { count: number }
    ).count;
    expect(beforeCount).toBeGreaterThan(0);

    // Click the batch evaluate button on Trends page.
    await page.getByTestId("nav-trends").click();
    const batchBtn = page.getByTestId("batch-evaluate-button");
    await expect(batchBtn).toBeVisible();
    await batchBtn.click();

    // Wait for batch processing to finish (button re-enables).
    await expect(batchBtn).not.toBeDisabled({ timeout: 15_000 });

    // All transactions should now be evaluated → pending count = 0.
    const afterCount = (
      (await request
        .get("/api/transactions/pending-count")
        .then((r) => r.json())) as { count: number }
    ).count;
    expect(afterCount).toBe(0);

    // The mock tags should have been assigned to at least the first transaction.
    const tagsRes = await request.get("/api/tags?status=unconfirmed");
    const tagsData = (await tagsRes.json()) as {
      tags: Array<{ path: string }>;
    };
    expect(
      tagsData.tags.some((t) => t.path === "ai-mock/new-parent/new-leaf"),
    ).toBe(true);

    // Clicking batch evaluate again should be a no-op (0 processed).
    await batchBtn.click();
    await expect(batchBtn).not.toBeDisabled({ timeout: 10_000 });
    const finalCount = (
      (await request
        .get("/api/transactions/pending-count")
        .then((r) => r.json())) as { count: number }
    ).count;
    expect(finalCount).toBe(0);
  });
});
