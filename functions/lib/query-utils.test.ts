import { describe, it, expect } from "vitest";
import { executeTagQuery, type QueryObject } from "./query-utils";

/** Fake D1 that records every prepared statement + bindings and returns
 *  empty result sets, so we can assert the generated SQL. */
function recordingDb() {
  const calls: { sql: string; bindings: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...bindings: unknown[]) {
          calls.push({ sql, bindings });
          return {
            async all() {
              return { results: [] };
            },
            async first() {
              return { total_income: 0, total_expense: 0 };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { db, calls };
}

describe("executeTagQuery", () => {
  it("returns an empty result without querying when no globs are given", async () => {
    const { db, calls } = recordingDb();
    const result = await executeTagQuery(db, "u@x.nl", [{ tagGlobs: [] }]);
    expect(result).toEqual({
      transactions: [],
      totalIncome: 0,
      totalExpense: 0,
      byPath: [],
    });
    expect(calls).toHaveLength(0);
  });

  it("binds the user email and passes globs through as bound parameters", async () => {
    const { db, calls } = recordingDb();
    await executeTagQuery(db, "u@x.nl", [{ tagGlobs: ["food/*", "food"] }]);
    const tx = calls[0];
    expect(tx.sql).toContain("t.path GLOB ? OR t.path GLOB ?");
    expect(tx.bindings).toEqual(["u@x.nl", "food/*", "food"]);
  });

  it("applies start and end dates inside the same query group", async () => {
    const { db, calls } = recordingDb();
    await executeTagQuery(db, "u@x.nl", [
      { tagGlobs: ["food"], startDate: "2026-01-01", endDate: "2026-01-31" },
    ]);
    const tx = calls[0];
    expect(tx.sql).toContain("tx.booking_date >= ?");
    expect(tx.sql).toContain("tx.booking_date <= ?");
    expect(tx.bindings).toEqual(["u@x.nl", "food", "2026-01-01", "2026-01-31"]);
  });

  it("combines multiple query objects with OR", async () => {
    const { db, calls } = recordingDb();
    const queries: QueryObject[] = [
      { tagGlobs: ["food"] },
      { tagGlobs: ["transport"], startDate: "2026-01-01" },
    ];
    await executeTagQuery(db, "u@x.nl", queries);
    const tx = calls[0];
    expect(tx.sql).toMatch(/\(\(t\.path GLOB \?\)\) OR \(\(t\.path GLOB \?\) AND tx\.booking_date >= \?\)/);
    expect(tx.bindings).toEqual(["u@x.nl", "food", "transport", "2026-01-01"]);
  });

  it("scopes to an account when one is given (and skips the 'all' sentinel)", async () => {
    const { db, calls } = recordingDb();
    await executeTagQuery(db, "u@x.nl", [{ tagGlobs: ["food"] }], "acc-1");
    expect(calls[0].sql).toContain("tx.account_uid = ?");
    expect(calls[0].bindings).toEqual(["u@x.nl", "acc-1", "food"]);

    const { db: db2, calls: calls2 } = recordingDb();
    await executeTagQuery(db2, "u@x.nl", [{ tagGlobs: ["food"] }], "all");
    expect(calls2[0].sql).not.toContain("tx.account_uid = ?");
  });

  it("runs the transaction, aggregate, and per-path queries with identical bindings", async () => {
    const { db, calls } = recordingDb();
    await executeTagQuery(db, "u@x.nl", [{ tagGlobs: ["food"] }]);
    expect(calls).toHaveLength(3);
    expect(calls[1].bindings).toEqual(calls[0].bindings);
    expect(calls[2].bindings).toEqual(calls[0].bindings);
  });
});
