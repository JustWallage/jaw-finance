import { test, expect } from "@playwright/test";

test("fetch recent transactions button calls bunq sandbox and displays results", async ({
  page,
}) => {
  await page.goto("/");

  // The button must be present and enabled on load
  const button = page.getByRole("button", { name: "Fetch Recent Transactions" });
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();

  // Intercept the API call so we can assert the HTTP response status
  const responsePromise = page.waitForResponse(
    (res) => res.url().includes("/api/bunq/transactions"),
    { timeout: 30_000 },
  );

  await button.click();

  // Button should show loading state while request is in flight
  await expect(
    page.getByRole("button", { name: /Fetching/i }),
  ).toBeVisible();

  // Wait for the real network response (no mocking)
  const apiResponse = await responsePromise;
  expect(apiResponse.status()).toBe(200);

  // The transactions JSON should appear in the pre block
  const output = page.getByTestId("transactions-output");
  await expect(output).toBeVisible({ timeout: 30_000 });
  await expect(output).toContainText("transactions");
});
