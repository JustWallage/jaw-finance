import { test, expect, type Page } from "@playwright/test";

const isCi = !!process.env.CI;

const userEmailHeader = isCi
  ? "X-Test-User-Email"
  : "Cf-Access-Authenticated-User-Email";

/** Each test gets its own user email so tag state can't leak between
 *  parallel tests (within this file or across files). */
test.use({
  extraHTTPHeaders: async ({}, use, testInfo) => {
    const slug = testInfo.title
      .replace(/[^a-z0-9]+/gi, "-")
      .toLowerCase()
      .slice(0, 30);
    const email = `${slug}-${testInfo.workerIndex}-${Date.now()}@jaw-finance.local`;
    // stash it on testInfo so beforeEach can use it for page init script
    (testInfo as unknown as { _userEmail: string })._userEmail = email;
    await use({
      [userEmailHeader]: email,
      "X-Test-Mock-AI": "1",
    });
  },
});

test.beforeEach(async ({ page, context, request }, testInfo) => {
  const email = (testInfo as unknown as { _userEmail: string })._userEmail;
  // Seed the browser so React's authHeaders() uses our unique user.
  await context.addInitScript((e: string) => {
    (window as { __TEST_USER_EMAIL__?: string }).__TEST_USER_EMAIL__ = e;
  }, email);
  void page;
  await request.post("/mock-enable-banking/reset");
});

async function connectAndRefresh(page: Page) {
  await page.goto("/");
  await page.getByTestId("connect-button").click();
  await page.waitForURL("**/mock-enable-banking/consent**");
  await page.getByTestId("simulate-success").click();
  await page.waitForURL("**/?connected=true");

  const refreshBtn = page.getByTestId("refresh-button");
  await expect(refreshBtn).toBeVisible({ timeout: 5_000 });
  await refreshBtn.click();

  const table = page.getByTestId("transactions-table");
  await expect(table).toBeVisible({ timeout: 10_000 });
  return table;
}

test.describe("AI auto-tagging", () => {
  test("AI Evaluate button assigns mocked tags and marks new ones unconfirmed", async ({
    page,
    request,
  }) => {
    const table = await connectAndRefresh(page);

    // Open first transaction modal
    await table.locator("tbody tr").first().click();
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
    expect(leafTag?.reasoning).toBe("Deterministic mock reasoning for E2E tests.");

    // The auto-created ancestor tag must exist with reasoning = null.
    const parentTag = tagsData.tags.find(
      (t) => t.path === "ai-mock/new-parent",
    );
    expect(parentTag).toBeDefined();
    expect(parentTag?.source).toBe("llm");
    expect(parentTag?.status).toBe("unconfirmed");
    expect(parentTag?.reasoning).toBeNull();
  });

  test("Tags page: unconfirmed appears at top, confirming moves it down", async ({
    page,
  }) => {
    const table = await connectAndRefresh(page);

    // Trigger AI Evaluate to create an unconfirmed tag
    await table.locator("tbody tr").first().click();
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

    // Navigate to Tags page
    await page.getByTestId("nav-tags").click();
    await expect(page).toHaveURL(/\/tags$/);

    const unconfirmed = page.getByTestId("unconfirmed-section");
    const confirmed = page.getByTestId("confirmed-section");
    await expect(
      unconfirmed.getByTestId("tag-row-ai-mock/new-parent/new-leaf"),
    ).toBeVisible();
    await expect(
      confirmed.getByTestId("tag-row-ai-mock/new-parent/new-leaf"),
    ).toHaveCount(0);

    // Click the tag → detail dialog → Confirm
    await unconfirmed.getByTestId("tag-row-ai-mock/new-parent/new-leaf").click();
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
  }) => {
    const table = await connectAndRefresh(page);
    await table.locator("tbody tr").first().click();
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

    await page.getByTestId("nav-tags").click();
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
  }) => {
    const table = await connectAndRefresh(page);

    // Click the first row, capture its tx id from the data-testid attribute
    const firstRow = table.locator("tbody tr").first();
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

    // Navigate to Tags, reject the unconfirmed tag
    await page.getByTestId("nav-tags").click();
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
  }) => {
    const table = await connectAndRefresh(page);

    // Find the "Albert Heijn" / Groceries transaction (MOCK-TX-002)
    const groceriesRow = table
      .locator("tbody tr")
      .filter({ hasText: "Albert Heijn" })
      .first();
    const testId = await groceriesRow.getAttribute("data-testid");
    const txId = Number(testId?.replace("tx-row-", ""));
    expect(txId).toBeGreaterThan(0);

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
      `/api/transactions/${txId}/evaluate`,
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
    // noise appears in exactly 10% → NOT strictly > 10%, must be absent
    expect(prompt).not.toContain("noise");
  });

});
