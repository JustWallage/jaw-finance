import { test, expect } from "@playwright/test";

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
    const email = `consent-${slug}-${testInfo.workerIndex}-${Date.now()}@jaw-finance.local`;
    (testInfo as unknown as { _userEmail: string })._userEmail = email;
    await use({ [userEmailHeader]: email });
  },
});

test.describe("Consent flow", () => {
  test.beforeEach(async ({ context }, testInfo) => {
    const email = (testInfo as unknown as { _userEmail: string })._userEmail;
    await context.addInitScript((e: string) => {
      (window as { __TEST_USER_EMAIL__?: string }).__TEST_USER_EMAIL__ = e;
    }, email);
  });

  test("new user sees consent modal and API returns 403 before accepting", async ({
    page,
    request,
  }, testInfo) => {
    const email = (testInfo as unknown as { _userEmail: string })._userEmail;

    // API returns 403 for unconsented user
    const res = await request.get("/api/tags", {
      headers: { [userEmailHeader]: email },
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
  }, testInfo) => {
    const email = (testInfo as unknown as { _userEmail: string })._userEmail;

    await page.goto("/");
    const modal = page.getByTestId("consent-modal");
    await expect(modal).toBeVisible({ timeout: 10_000 });

    // Accept
    await page.getByTestId("accept-consent").click();
    await expect(modal).not.toBeVisible({ timeout: 5_000 });

    // API now works
    const res = await request.get("/api/tags", {
      headers: { [userEmailHeader]: email },
    });
    expect(res.status()).toBe(200);
  });

  test("consent GET endpoint returns correct status", async ({
    request,
  }, testInfo) => {
    const email = (testInfo as unknown as { _userEmail: string })._userEmail;
    const headers = { [userEmailHeader]: email };

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
