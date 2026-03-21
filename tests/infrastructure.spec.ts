import { test, expect } from "@playwright/test";

test("db-test endpoint returns ok with a live D1 binding", async ({
  request,
}) => {
  const response = await request.get("/api/db-test");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.status).toBe("ok");
  expect(body.db).toMatchObject({ status: 1 });
});
