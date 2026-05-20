import { test, expect, userEmailHeader } from "./fixtures";

test.use({ autoConsent: false });

test.describe("Consent flow", () => {
  test("new user sees consent modal and API returns 403 before accepting", async ({
    page,
    request,
    userEmail,
  }) => {
    // API returns 403 for unconsented user
    const res = await request.get("/api/tags", {
      headers: { [userEmailHeader]: userEmail },
    });
    expect(res.status()).toBe(403);

    // Visit app - consent modal should appear
    await page.goto("/");
    const modal = page.getByTestId("consent-modal");
    await expect(modal).toBeVisible({ timeout: 10_000 });

    // Links point to correct targets
    const termsLink = page.getByTestId("link-terms");
    await expect(termsLink).toHaveAttribute("href", "/terms");
    await expect(termsLink).toHaveAttribute("target", "_blank");

    const privacyLink = page.getByTestId("link-privacy");
    await expect(privacyLink).toHaveAttribute("href", "/privacy");
    await expect(privacyLink).toHaveAttribute("target", "_blank");
  });

  test("user accepts consent, modal disappears, API returns 200", async ({
    page,
    request,
    userEmail,
  }) => {
    await page.goto("/");
    const modal = page.getByTestId("consent-modal");
    await expect(modal).toBeVisible({ timeout: 10_000 });

    // Accept
    await page.getByTestId("accept-consent").click();
    await expect(modal).not.toBeVisible({ timeout: 5_000 });

    // API now works
    const res = await request.get("/api/tags", {
      headers: { [userEmailHeader]: userEmail },
    });
    expect(res.status()).toBe(200);
  });

  test("consent GET endpoint returns correct status", async ({
    request,
    userEmail,
  }) => {
    const headers = { [userEmailHeader]: userEmail };

    // Before consent
    const before = await request.get("/api/consent", { headers });
    expect(before.status()).toBe(200);
    expect((await before.json()).consented).toBe(false);

    // Give consent
    const post = await request.post("/api/consent", { headers });
    expect(post.status()).toBe(200);

    // After consent
    const after = await request.get("/api/consent", { headers });
    expect((await after.json()).consented).toBe(true);
  });
});
