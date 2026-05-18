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

  await page.goto("/");
  const feed = page.getByTestId("transactions-table");
  await expect(feed).toBeVisible({ timeout: 10_000 });
  return feed;
}

test.describe("Transaction tagging", () => {
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

  test("create a nested tag inline and assign it to a transaction", async ({
    page,
  }) => {
    const table = await connectAndRefresh(page);

    // Click the first transaction row to open dialog
    await table.locator("[data-testid^='tx-row-']").first().click();
    const dialog = page.getByTestId("transaction-dialog");
    await expect(dialog).toBeVisible();

    // Click "Add tag" and create a nested tag
    await dialog.getByTestId("tag-add-button").click();
    const searchInput = page.getByTestId("tag-search-input");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("food/groceries");
    await page.getByTestId("tag-create-new").click();

    // The tag badge should appear in the dialog
    await expect(dialog.getByTestId("tag-badge-food/groceries")).toBeVisible();
  });

  test("remove a tag from a transaction via X icon", async ({ page }) => {
    const table = await connectAndRefresh(page);

    // Open first transaction dialog and create a tag
    await table.locator("[data-testid^='tx-row-']").first().click();
    const dialog = page.getByTestId("transaction-dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByTestId("tag-add-button").click();
    await page.getByTestId("tag-search-input").fill("temp-tag");
    await page.getByTestId("tag-create-new").click();
    await expect(dialog.getByTestId("tag-badge-temp-tag")).toBeVisible();

    // Remove the tag via X
    await dialog.getByTestId("tag-remove-temp-tag").click();
    await expect(dialog.getByTestId("tag-badge-temp-tag")).toBeHidden();

    // The "Add tag" button should still be there
    await expect(dialog.getByTestId("tag-add-button")).toBeVisible();
  });

  test("delete a tag globally with confirmation dialog showing count", async ({
    page,
  }) => {
    const table = await connectAndRefresh(page);

    // Open first transaction and create a tag
    await table.locator("[data-testid^='tx-row-']").nth(0).click();
    let dialog = page.getByTestId("transaction-dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByTestId("tag-add-button").click();
    await page.getByTestId("tag-search-input").fill("to-delete");
    await page.getByTestId("tag-create-new").click();
    await expect(dialog.getByTestId("tag-badge-to-delete")).toBeVisible();

    // Close dialog by clicking outside
    await page.locator("body").click({ position: { x: 0, y: 0 } });
    await expect(dialog).toBeHidden();

    await table.locator("[data-testid^='tx-row-']").nth(1).click();
    dialog = page.getByTestId("transaction-dialog");
    await expect(dialog).toBeVisible();

    // Assign existing "to-delete" tag to second transaction
    await dialog.getByTestId("tag-add-button").click();
    await page.getByTestId("tag-option-to-delete").click();
    await expect(dialog.getByTestId("tag-badge-to-delete")).toBeVisible();

    // Delete the tag — should show confirmation with count
    await dialog.getByTestId("tag-delete-to-delete").click();

    const alertDialog = page.getByRole("alertdialog");
    await expect(alertDialog).toBeVisible();
    await expect(alertDialog).toContainText("to-delete");
    await expect(alertDialog).toContainText("2"); // used on 2 transactions

    // Confirm delete
    await page.getByTestId("tag-delete-confirm").click();

    // Tag should vanish from the dialog
    await expect(dialog.getByTestId("tag-badge-to-delete")).toBeHidden();
  });

  test("refresh does not auto-assign system flow or date tags", async ({
    page,
    request,
  }) => {
    await connectAndRefresh(page);

    // System flow/date tags should not be created.
    const tagsRes = await request.get("/api/tags");
    const tagsData = (await tagsRes.json()) as {
      tags: Array<{ path: string }>;
    };
    const allPaths = tagsData.tags.map((t) => t.path);

    const yearTags = allPaths.filter((p) => /^year-\d{4}$/.test(p));
    const monthTags = allPaths.filter((p) =>
      /^year-\d{4}\/month-\d{2}$/.test(p),
    );
    const dayTags = allPaths.filter((p) =>
      /^year-\d{4}\/month-\d{2}\/day-\d{2}$/.test(p),
    );
    expect(allPaths).not.toContain("income");
    expect(allPaths).not.toContain("expense");
    expect(yearTags.length).toBe(0);
    expect(monthTags.length).toBe(0);
    expect(dayTags.length).toBe(0);

    // And they should not be linked to transactions either.
    const txRes = await request.get("/api/bank/transactions");
    const txData = (await txRes.json()) as {
      transactions: Array<{ id: number }>;
    };
    const txId = txData.transactions[0].id;

    const txTagsRes = await request.get(`/api/transactions/${txId}/tags`);
    const txTagsData = (await txTagsRes.json()) as {
      tags: Array<{ path: string }>;
    };
    const linkedPaths = txTagsData.tags.map((t) => t.path);

    const hasSystemFlowTag = linkedPaths.some(
      (p) => p === "income" || p === "expense",
    );
    const linkedYearTags = linkedPaths.filter((p) => /^year-\d{4}$/.test(p));
    const linkedMonthTags = linkedPaths.filter((p) =>
      /^year-\d{4}\/month-\d{2}$/.test(p),
    );
    const linkedDayTags = linkedPaths.filter((p) =>
      /^year-\d{4}\/month-\d{2}\/day-\d{2}$/.test(p),
    );
    expect(hasSystemFlowTag).toBe(false);
    expect(linkedYearTags.length).toBe(0);
    expect(linkedMonthTags.length).toBe(0);
    expect(linkedDayTags.length).toBe(0);
  });

  test("assigning child tag removes parent tag link (consolidation)", async ({
    page,
    request,
  }) => {
    await connectAndRefresh(page);

    // Get a transaction
    const txRes = await request.get("/api/bank/transactions");
    const txData = (await txRes.json()) as {
      transactions: Array<{ id: number }>;
    };
    const txId = txData.transactions[0].id;

    // Create parent and child tags
    const parentRes = await request.post("/api/tags", {
      data: { name: "vacation", path: "vacation" },
    });
    const parentTag = ((await parentRes.json()) as { tag: { id: number } }).tag;

    const childRes = await request.post("/api/tags", {
      data: { name: "malaga-2026", path: "vacation/malaga-2026" },
    });
    const childTag = ((await childRes.json()) as { tag: { id: number } }).tag;

    // Assign parent tag first
    await request.put(`/api/transactions/${txId}/tags`, {
      data: { tag_id: parentTag.id },
    });

    // Verify parent is linked
    let linkedRes = await request.get(`/api/transactions/${txId}/tags`);
    let linkedData = (await linkedRes.json()) as {
      tags: Array<{ path: string }>;
    };
    let linkedPaths = linkedData.tags.map((t) => t.path);
    expect(linkedPaths).toContain("vacation");

    // Now assign child tag — parent should be removed
    await request.put(`/api/transactions/${txId}/tags`, {
      data: { tag_id: childTag.id },
    });

    linkedRes = await request.get(`/api/transactions/${txId}/tags`);
    linkedData = (await linkedRes.json()) as { tags: Array<{ path: string }> };
    linkedPaths = linkedData.tags.map((t) => t.path);
    expect(linkedPaths).toContain("vacation/malaga-2026");
    expect(linkedPaths).not.toContain("vacation");
  });

  test("by-tags aggregation includes child-tagged transactions", async ({
    page,
    request,
  }) => {
    await connectAndRefresh(page);

    // Create parent tag "living" and child "living/rent"
    await request.post("/api/tags", {
      data: { name: "living", path: "living" },
    });
    const childRes = await request.post("/api/tags", {
      data: { name: "rent", path: "living/rent" },
    });
    const childTag = ((await childRes.json()) as { tag: { id: number } }).tag;

    // Get a transaction ID
    const txRes = await request.get("/api/bank/transactions");
    const txData = (await txRes.json()) as {
      transactions: Array<{ id: number }>;
    };
    const txId = txData.transactions[0].id;

    // Assign child tag to the transaction
    await request.put(`/api/transactions/${txId}/tags`, {
      data: { tag_id: childTag.id },
    });

    // Query by parent path — should include the transaction tagged with the child
    const aggRes = await request.post("/api/transactions/by-tags", {
      data: { paths: ["living"] },
    });
    const aggData = (await aggRes.json()) as {
      transactions: Array<{ id: number }>;
    };
    const ids = aggData.transactions.map((t) => t.id);
    expect(ids).toContain(txId);
  });
});
