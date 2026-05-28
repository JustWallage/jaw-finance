import { test, expect, userEmailHeader } from "./fixtures";

test.describe("Ambiguous transactions", () => {
  test.use({ mockAI: true });

  test("banner shows count, explanation then manual tag with finished button", async ({
    page,
    connectAndRefreshHome,
  }) => {
    await connectAndRefreshHome();

    // Banner should show 2 ambiguous transactions
    const banner = page.getByTestId("ambiguous-banner");
    await expect(banner).toBeVisible({ timeout: 5_000 });
    await expect(banner).toContainText("2");

    // Open clarify modal
    await banner.click();
    const modal = page.getByTestId("clarify-modal");
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await expect(modal).toContainText("1 of 2");

    // First transaction: use explanation input (AI mock will assign tags)
    await page
      .getByTestId("clarify-explanation")
      .fill("Monthly salary payment");
    await page.getByTestId("clarify-submit").click();

    // Should auto-advance to second transaction
    await expect(modal).toContainText("2 of 2");

    // Wait for async tag/count fetches to settle before interacting
    await page.waitForLoadState("networkidle");

    // Second transaction: manually assign a tag
    await page.getByTestId("tag-add-button").click();
    const tagInput = page.getByTestId("tag-search-input");
    await expect(tagInput).toBeVisible();
    await tagInput.fill("rent");
    await expect(page.getByTestId("tag-create-new")).toBeVisible();
    await page.getByTestId("tag-create-new").dispatchEvent("click");

    // Wait for badge to confirm tag was created
    await expect(modal.getByTestId("tag-badge-rent")).toBeVisible({
      timeout: 5_000,
    });

    // Close tag dropdown by clicking outside it
    await modal.locator("h2").click();

    // Last transaction with tags assigned — should show "Finished" button
    await expect(page.getByTestId("clarify-finished")).toBeVisible({
      timeout: 5_000,
    });
    await page.getByTestId("clarify-finished").click();

    // Modal should close
    await expect(modal).not.toBeVisible({ timeout: 5_000 });

    // Verify banner is gone after resolving both
    await page.goto("/app");
    await expect(page.getByTestId("transactions-table")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("ambiguous-banner")).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test("removing a tag shows banner and modal is re-openable", async ({
    page,
    request,
    userEmail,
    connectAndRefreshHome,
  }) => {
    const table = await connectAndRefreshHome();

    // Resolve existing ambiguous transactions via batch evaluate
    await request.post("/api/transactions/evaluate-batch", {
      headers: {
        [userEmailHeader]: userEmail,
        "X-Test-Mock-AI": "1",
      },
    });

    // Verify no banner
    await page.reload();
    await expect(page.getByTestId("transactions-table")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("ambiguous-banner")).not.toBeVisible({
      timeout: 3_000,
    });

    // Open a merchant-tagged transaction (Albert Heijn) and remove all tags
    const ahRow = table.locator("[data-testid^='tx-row-']", {
      hasText: "Albert Heijn",
    });
    await ahRow.click();
    const dialog = page.getByTestId("transaction-dialog");
    await expect(dialog).toBeVisible();

    // Remove all tags one by one
    const removeBtns = dialog.locator("[data-testid^='tag-remove-']");
    while ((await removeBtns.count()) > 0) {
      await removeBtns.first().click();
      await page.waitForTimeout(200);
    }

    // Wait for tag removal API calls to complete
    await page.waitForLoadState("networkidle");

    // Close transaction dialog
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    // Banner should now show 1
    await expect(page.getByTestId("ambiguous-banner")).toContainText("1", {
      timeout: 5_000,
    });

    // Click banner — modal should open
    await page.getByTestId("ambiguous-banner").click();
    const modal = page.getByTestId("clarify-modal");
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await expect(modal).toContainText("1 of 1");

    // Close modal via X button
    await modal.locator("[data-slot='dialog-close']").click();
    await expect(modal).not.toBeVisible({ timeout: 5_000 });
  });
});
