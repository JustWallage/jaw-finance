import { describe, it, expect } from "vitest";
import { signState, verifyState } from "./oauth-state";

const SECRET = "test-secret";

describe("signState / verifyState", () => {
  it("round-trips the email through a signed state", async () => {
    const state = await signState({ email: "user@example.com" }, SECRET);
    const payload = await verifyState(state, SECRET);
    expect(payload?.email).toBe("user@example.com");
  });

  it("produces a unique state per call (nonce)", async () => {
    const a = await signState({ email: "user@example.com" }, SECRET);
    const b = await signState({ email: "user@example.com" }, SECRET);
    expect(a).not.toBe(b);
  });

  it("rejects a tampered payload", async () => {
    const state = await signState({ email: "user@example.com" }, SECRET);
    const [body, sig] = state.split(".");
    const decoded = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
    decoded.email = "attacker@example.com";
    const forgedBody = btoa(JSON.stringify(decoded))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(await verifyState(`${forgedBody}.${sig}`, SECRET)).toBeNull();
  });

  it("rejects a state signed with a different secret", async () => {
    const state = await signState({ email: "user@example.com" }, "other-secret");
    expect(await verifyState(state, SECRET)).toBeNull();
  });

  it("rejects an expired state", async () => {
    const state = await signState({ email: "user@example.com" }, SECRET);
    expect(await verifyState(state, SECRET, -1)).toBeNull();
  });

  it("rejects garbage input", async () => {
    expect(await verifyState("not-a-state", SECRET)).toBeNull();
    expect(await verifyState("", SECRET)).toBeNull();
    expect(await verifyState("a.b.c", SECRET)).toBeNull();
  });
});
