/** Returns the headers needed to identify the user in local dev / Playwright / staging.
 *  In production, Cloudflare Access sets Cf-Access-Authenticated-User-Email automatically.
 *
 *  E2E tests can override the user email by setting `window.__TEST_USER_EMAIL__`
 *  via `page.addInitScript`, which takes precedence over VITE_DEV_USER_EMAIL.
 *  This lets each test use a unique user so tag state doesn't leak across tests. */
export function authHeaders(): HeadersInit {
  const override =
    typeof window !== "undefined"
      ? (window as { __TEST_USER_EMAIL__?: string }).__TEST_USER_EMAIL__
      : undefined;
  const email = override ?? import.meta.env.VITE_DEV_USER_EMAIL;
  return email ? { "Cf-Access-Authenticated-User-Email": email } : {};
}
