import { describe, it, expect } from "vitest";
import { getUserEmail } from "./enable-banking";

function req(headers: Record<string, string>) {
  return new Request("http://localhost/api/test", { headers });
}

describe("getUserEmail", () => {
  it("returns the Cloudflare Access email when present", () => {
    const r = req({ "Cf-Access-Authenticated-User-Email": "real@x.nl" });
    expect(getUserEmail(r, { ENVIRONMENT: "production" })).toBe("real@x.nl");
  });

  it("prefers the Access email over the test header", () => {
    const r = req({
      "Cf-Access-Authenticated-User-Email": "real@x.nl",
      "X-Test-User-Email": "fake@x.nl",
      "X-Test-Auth": "tok",
    });
    expect(
      getUserEmail(r, { ENVIRONMENT: "staging", TEST_AUTH_TOKEN: "tok" }),
    ).toBe("real@x.nl");
  });

  it("accepts the test header in staging with the correct token", () => {
    const r = req({ "X-Test-User-Email": "test@x.nl", "X-Test-Auth": "tok" });
    expect(
      getUserEmail(r, { ENVIRONMENT: "staging", TEST_AUTH_TOKEN: "tok" }),
    ).toBe("test@x.nl");
  });

  it("rejects the test header with a wrong or missing token", () => {
    const env = { ENVIRONMENT: "staging", TEST_AUTH_TOKEN: "tok" };
    expect(() =>
      getUserEmail(req({ "X-Test-User-Email": "t@x.nl", "X-Test-Auth": "no" }), env),
    ).toThrow();
    expect(() =>
      getUserEmail(req({ "X-Test-User-Email": "t@x.nl" }), env),
    ).toThrow();
  });

  it("rejects the test header outside staging even with the token", () => {
    const r = req({ "X-Test-User-Email": "t@x.nl", "X-Test-Auth": "tok" });
    expect(() =>
      getUserEmail(r, { ENVIRONMENT: "production", TEST_AUTH_TOKEN: "tok" }),
    ).toThrow();
    expect(() => getUserEmail(r, { TEST_AUTH_TOKEN: "tok" })).toThrow();
  });

  it("rejects the test header when no token is configured", () => {
    const r = req({ "X-Test-User-Email": "t@x.nl", "X-Test-Auth": "" });
    expect(() => getUserEmail(r, { ENVIRONMENT: "staging" })).toThrow();
    expect(() =>
      getUserEmail(r, { ENVIRONMENT: "staging", TEST_AUTH_TOKEN: "" }),
    ).toThrow();
  });
});
