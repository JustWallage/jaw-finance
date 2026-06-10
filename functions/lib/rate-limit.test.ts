import { describe, it, expect } from "vitest";
import { enforceRateLimit } from "./rate-limit";

/** In-memory fake of the single upsert+RETURNING statement rate-limit uses,
 *  plus a no-op for the cleanup DELETE. */
function fakeDb() {
  const counters = new Map<string, number>();
  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              if (!sql.includes("INSERT")) return null;
              const key = args.join("|");
              const count = (counters.get(key) ?? 0) + 1;
              counters.set(key, count);
              return { count };
            },
            async run() {
              return { success: true };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe("enforceRateLimit", () => {
  it("allows requests under the limit", async () => {
    const db = fakeDb();
    for (let i = 0; i < 3; i++) {
      expect(await enforceRateLimit(db, "u@x.nl", "chat", 3, 3600)).toBeNull();
    }
  });

  it("returns a 429 response once the limit is exceeded", async () => {
    const db = fakeDb();
    for (let i = 0; i < 3; i++) {
      await enforceRateLimit(db, "u@x.nl", "chat", 3, 3600);
    }
    const res = await enforceRateLimit(db, "u@x.nl", "chat", 3, 3600);
    expect(res).toBeInstanceOf(Response);
    expect(res?.status).toBe(429);
  });

  it("tracks users independently", async () => {
    const db = fakeDb();
    for (let i = 0; i < 3; i++) {
      await enforceRateLimit(db, "a@x.nl", "chat", 3, 3600);
    }
    expect(await enforceRateLimit(db, "b@x.nl", "chat", 3, 3600)).toBeNull();
  });

  it("tracks routes independently", async () => {
    const db = fakeDb();
    for (let i = 0; i < 3; i++) {
      await enforceRateLimit(db, "u@x.nl", "chat", 3, 3600);
    }
    expect(await enforceRateLimit(db, "u@x.nl", "evaluate", 3, 3600)).toBeNull();
  });
});
