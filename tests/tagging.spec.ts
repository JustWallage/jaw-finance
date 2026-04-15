import { test, expect, type Page } from "@playwright/test";

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

test.describe("Transaction tagging", () => {
  test.beforeEach(async ({ request }) => {
    await request.post("/mock-enable-banking/reset");
  });

  test("create a nested tag inline and assign it to a transaction", async ({
    page,
  }) => {
    const table = await connectAndRefresh(page);

    // Click the first transaction row to open dialog
    await table.locator("tbody tr").first().click();
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
    await table.locator("tbody tr").first().click();
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
    await table.locator("tbody tr").nth(0).click();
    let dialog = page.getByTestId("transaction-dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByTestId("tag-add-button").click();
    await page.getByTestId("tag-search-input").fill("to-delete");
    await page.getByTestId("tag-create-new").click();
    await expect(dialog.getByTestId("tag-badge-to-delete")).toBeVisible();

    // Close dialog by clicking outside
    await page.locator("body").click({ position: { x: 0, y: 0 } });
    await expect(dialog).toBeHidden();

    await table.locator("tbody tr").nth(1).click();
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

  test("auto-tags appear after sync (income/expense and date tags)", async ({
    page,
    request,
  }) => {
    await connectAndRefresh(page);

    // Check auto-tags via API — there should be income/expense and year-YYYY/month-MM/day-DD tags
    const res = await request.get("/api/tags");
    const data = (await res.json()) as { tags: Array<{ path: string }> };
    const paths = data.tags.map((t) => t.path);

    expect(paths).toContain("income");
    expect(paths).toContain("expense");

    // Should have year-level tags like year-2026
    const yearTags = paths.filter((p) => /^year-\d{4}$/.test(p));
    expect(yearTags.length).toBeGreaterThan(0);

    // Should have month-level tags like year-2026/month-04
    const monthTags = paths.filter((p) => /^year-\d{4}\/month-\d{2}$/.test(p));
    expect(monthTags.length).toBeGreaterThan(0);

    // Should have day-level tags like year-2026/month-04/day-08
    const dayTags = paths.filter((p) =>
      /^year-\d{4}\/month-\d{2}\/day-\d{2}$/.test(p),
    );
    expect(dayTags.length).toBeGreaterThan(0);
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
