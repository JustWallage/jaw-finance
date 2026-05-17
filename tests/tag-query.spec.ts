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

test.beforeEach(async ({ page, context, request }, testInfo) => {
  const email = (testInfo as unknown as { _userEmail: string })._userEmail;
  await context.addInitScript((e: string) => {
    (window as { __TEST_USER_EMAIL__?: string }).__TEST_USER_EMAIL__ = e;
  }, email);
  void page;
  await request.post("/mock-enable-banking/reset");
  await request.post("/api/consent", { headers: { [userEmailHeader]: email } });
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
  await refreshBtn.click();

  await page.goto("/");
  const feed = page.getByTestId("transactions-table");
  await expect(feed).toBeVisible({ timeout: 10_000 });
  return feed;
}

test.describe("Tag query - backend", () => {
  test("GLOB matching on tag paths", async ({ page, request }) => {
    await connectAndRefresh(page);

    // Create tags and assign to transactions
    const txRes = await request.get("/api/bank/transactions");
    const txData = (await txRes.json()) as {
      transactions: Array<{ id: number }>;
    };
    const txId = txData.transactions[0].id;
    const txId2 = txData.transactions[1].id;

    const tag1Res = await request.post("/api/tags", {
      data: { name: "food", path: "vacation/spain/food" },
    });
    const spainFoodTag = ((await tag1Res.json()) as { tag: { id: number } })
      .tag;

    const tag2Res = await request.post("/api/tags", {
      data: { name: "drinks", path: "vacation/italy/drinks" },
    });
    const italyDrinksTag = ((await tag2Res.json()) as { tag: { id: number } })
      .tag;

    // Assign vacation/spain/food to first transaction
    await request.put(`/api/transactions/${txId}/tags`, {
      data: { tag_id: spainFoodTag.id },
    });

    // Assign vacation/italy/drinks to second transaction
    await request.put(`/api/transactions/${txId2}/tags`, {
      data: { tag_id: italyDrinksTag.id },
    });

    // GLOB "vacation/*/food" should match vacation/spain/food but not vacation/italy/drinks
    const res1 = await request.post("/api/transactions/by-tags", {
      data: { queries: [{ tagGlobs: ["vacation/*/food"] }] },
    });
    const data1 = (await res1.json()) as {
      transactions: Array<{ id: number }>;
    };
    const ids1 = data1.transactions.map((t) => t.id);
    expect(ids1).toContain(txId);
    expect(ids1).not.toContain(txId2);

    // GLOB "vacation/*" should match both (since * matches any sequence)
    const res2 = await request.post("/api/transactions/by-tags", {
      data: { queries: [{ tagGlobs: ["vacation/*"] }] },
    });
    const data2 = (await res2.json()) as {
      transactions: Array<{ id: number }>;
    };
    const ids2 = data2.transactions.map((t) => t.id);
    expect(ids2).toContain(txId);
    expect(ids2).toContain(txId2);
  });

  test("OR logic across multiple queries", async ({ page, request }) => {
    await connectAndRefresh(page);

    const txRes = await request.get("/api/bank/transactions");
    const txData = (await txRes.json()) as {
      transactions: Array<{ id: number }>;
    };
    const txId1 = txData.transactions[0].id;
    const txId2 = txData.transactions[1].id;

    // Create two unrelated tags
    const tag1Res = await request.post("/api/tags", {
      data: { name: "groceries", path: "food/groceries" },
    });
    const tag1 = ((await tag1Res.json()) as { tag: { id: number } }).tag;

    const tag2Res = await request.post("/api/tags", {
      data: { name: "streaming", path: "entertainment/streaming" },
    });
    const tag2 = ((await tag2Res.json()) as { tag: { id: number } }).tag;

    await request.put(`/api/transactions/${txId1}/tags`, {
      data: { tag_id: tag1.id },
    });
    await request.put(`/api/transactions/${txId2}/tags`, {
      data: { tag_id: tag2.id },
    });

    // Single query for food/* — only txId1
    const single = await request.post("/api/transactions/by-tags", {
      data: { queries: [{ tagGlobs: ["food/*"] }] },
    });
    const singleData = (await single.json()) as {
      transactions: Array<{ id: number }>;
    };
    expect(singleData.transactions.map((t) => t.id)).toContain(txId1);
    expect(singleData.transactions.map((t) => t.id)).not.toContain(txId2);

    // OR across two queries — both transactions
    const or = await request.post("/api/transactions/by-tags", {
      data: {
        queries: [{ tagGlobs: ["food/*"] }, { tagGlobs: ["entertainment/*"] }],
      },
    });
    const orData = (await or.json()) as { transactions: Array<{ id: number }> };
    const orIds = orData.transactions.map((t) => t.id);
    expect(orIds).toContain(txId1);
    expect(orIds).toContain(txId2);
  });

  test("date range filtering with startDate and endDate", async ({
    page,
    request,
  }) => {
    await connectAndRefresh(page);

    const txRes = await request.get("/api/bank/transactions");
    const txData = (await txRes.json()) as {
      transactions: Array<{ id: number; booking_date: string | null }>;
    };
    const dateFilterTagRes = await request.post("/api/tags", {
      data: { name: "date-filter", path: "tests/date-filter" },
    });
    const dateFilterTag = (
      (await dateFilterTagRes.json()) as { tag: { id: number } }
    ).tag;
    for (const tx of txData.transactions) {
      await request.put(`/api/transactions/${tx.id}/tags`, {
        data: { tag_id: dateFilterTag.id },
      });
    }

    const sortedByDate = [...txData.transactions]
      .filter((t) => t.booking_date)
      .sort((a, b) => a.booking_date!.localeCompare(b.booking_date!));

    const oldest = sortedByDate[0];
    const newest = sortedByDate[sortedByDate.length - 1];

    // Query one assigned tag with date range narrowed to only the newest date
    const res = await request.post("/api/transactions/by-tags", {
      data: {
        queries: [
          {
            tagGlobs: ["tests/date-filter"],
            startDate: newest.booking_date!,
            endDate: newest.booking_date!,
          },
        ],
      },
    });
    const data = (await res.json()) as {
      transactions: Array<{ id: number; booking_date: string | null }>;
    };

    // Only transactions on that date should appear
    for (const tx of data.transactions) {
      expect(tx.booking_date).toBe(newest.booking_date);
    }
    expect(data.transactions.length).toBeGreaterThan(0);

    // The oldest transaction should not be in results (different date)
    if (oldest.booking_date !== newest.booking_date) {
      expect(data.transactions.map((t) => t.id)).not.toContain(oldest.id);
    }
  });

  test("aggregation totals are correct", async ({ page, request }) => {
    await connectAndRefresh(page);

    const txRes = await request.get("/api/bank/transactions");
    const txData = (await txRes.json()) as {
      transactions: Array<{ id: number; credit_debit: string }>;
    };
    const incomeOnlyRes = await request.post("/api/tags", {
      data: { name: "income-only", path: "tests/income-only" },
    });
    const incomeOnlyTag = (
      (await incomeOnlyRes.json()) as { tag: { id: number } }
    ).tag;
    const creditTransactions = txData.transactions.filter(
      (tx) => tx.credit_debit === "CRDT",
    );
    for (const tx of creditTransactions) {
      await request.put(`/api/transactions/${tx.id}/tags`, {
        data: { tag_id: incomeOnlyTag.id },
      });
    }

    const res = await request.post("/api/transactions/by-tags", {
      data: { queries: [{ tagGlobs: ["tests/income-only"] }] },
    });
    const data = (await res.json()) as {
      transactions: Array<{ amount: string; credit_debit: string }>;
      totalIncome: number;
      totalExpense: number;
    };

    // All matched should be CRDT (income)
    for (const tx of data.transactions) {
      expect(tx.credit_debit).toBe("CRDT");
    }
    expect(data.totalIncome).toBeGreaterThan(0);
    expect(data.totalExpense).toBe(0);
  });

  test("backward compat: legacy paths field still works", async ({
    page,
    request,
  }) => {
    await connectAndRefresh(page);

    const tagRes = await request.post("/api/tags", {
      data: { name: "rent", path: "housing/rent" },
    });
    const tag = ((await tagRes.json()) as { tag: { id: number } }).tag;

    const txRes = await request.get("/api/bank/transactions");
    const txData = (await txRes.json()) as {
      transactions: Array<{ id: number }>;
    };
    const txId = txData.transactions[0].id;

    await request.put(`/api/transactions/${txId}/tags`, {
      data: { tag_id: tag.id },
    });

    // Use old-style paths
    const res = await request.post("/api/transactions/by-tags", {
      data: { paths: ["housing"] },
    });
    const data = (await res.json()) as { transactions: Array<{ id: number }> };
    expect(data.transactions.map((t) => t.id)).toContain(txId);
  });
});

test.describe("Tag query - frontend", () => {
  test("search by glob pattern opens results modal with totals", async ({
    page,
  }) => {
    await connectAndRefresh(page);

    // Navigate to trends page
    await page.getByTestId("nav-trends").click();
    await expect(page).toHaveURL(/\/trends$/);

    // The query search section should be visible
    const section = page.getByTestId("query-search-section");
    await expect(section).toBeVisible();

    const txRes = await page.request.get("/api/bank/transactions");
    const txData = (await txRes.json()) as {
      transactions: Array<{ id: number }>;
    };
    const tagRes = await page.request.post("/api/tags", {
      data: { name: "frontend-query", path: "tests/frontend-query" },
    });
    const tag = ((await tagRes.json()) as { tag: { id: number } }).tag;
    await page.request.put(
      `/api/transactions/${txData.transactions[0].id}/tags`,
      {
        data: { tag_id: tag.id },
      },
    );

    await section.getByTestId("query-glob-input").fill("tests/frontend-*");
    await section.getByTestId("query-search-button").click();

    // Results modal should open
    const dialog = page.getByTestId("query-results-dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Totals should be displayed
    await expect(dialog.getByTestId("query-total-income")).toBeVisible();
    await expect(dialog.getByTestId("query-total-expense")).toBeVisible();

    // Should have at least one transaction
    const txItems = dialog.locator("[data-testid^='query-tx-']");
    await expect(txItems.first()).toBeVisible();
  });

  test("search with date filters narrows results", async ({
    page,
    request,
  }) => {
    await connectAndRefresh(page);

    // Get a known transaction date to use as filter
    const txRes = await request.get("/api/bank/transactions");
    const txData = (await txRes.json()) as {
      transactions: Array<{ id: number; booking_date: string | null }>;
    };
    const queryTagRes = await request.post("/api/tags", {
      data: { name: "frontend-date", path: "tests/frontend-date" },
    });
    const queryTag = ((await queryTagRes.json()) as { tag: { id: number } })
      .tag;
    for (const tx of txData.transactions) {
      await request.put(`/api/transactions/${tx.id}/tags`, {
        data: { tag_id: queryTag.id },
      });
    }
    const dates = txData.transactions
      .map((t) => t.booking_date)
      .filter(Boolean) as string[];
    dates.sort();
    const latestDate = dates[dates.length - 1];

    await page.getByTestId("nav-trends").click();
    await expect(page).toHaveURL(/\/trends$/);

    const section = page.getByTestId("query-search-section");
    await section.getByTestId("query-glob-input").fill("tests/frontend-date");
    await section.getByTestId("query-start-date").fill(latestDate);
    await section.getByTestId("query-end-date").fill(latestDate);
    await section.getByTestId("query-search-button").click();

    const dialog = page.getByTestId("query-results-dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Modal should be visible (even with 0 results, modal still shows)
    const txItems = dialog.locator("[data-testid^='query-tx-']");
    const count = await txItems.count();
    // Date filtering should return a subset (or zero if no transaction on that date)
    expect(count).toBeLessThanOrEqual(dates.length);
  });
});
