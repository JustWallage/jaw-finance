import { describe, it, expect } from "vitest";
import { sanitizePath, filterSuggestedTags } from "./ai-prompt-building";

describe("sanitizePath", () => {
  it("lowercases, trims, and collapses slashes", () => {
    expect(sanitizePath(" Food//Groceries/ ")).toBe("food/groceries");
  });

  it("replaces disallowed characters with dashes", () => {
    expect(sanitizePath("café & bar")).toBe("caf----bar");
    expect(sanitizePath("a b/c.d")).toBe("a-b/c-d");
  });

  it("returns null for empty input", () => {
    expect(sanitizePath("")).toBeNull();
    expect(sanitizePath("///")).toBeNull();
  });

  it("returns null for reserved auto paths", () => {
    expect(sanitizePath("income")).toBeNull();
    expect(sanitizePath("expense")).toBeNull();
    expect(sanitizePath("year-2026/month-2026-01")).toBeNull();
  });

  it("keeps valid nested kebab-case paths unchanged", () => {
    expect(sanitizePath("home/utilities/energy")).toBe("home/utilities/energy");
  });
});

describe("filterSuggestedTags", () => {
  const none = new Set<string>();

  it("drops rejected paths and their descendants", () => {
    const out = filterSuggestedTags(
      ["gambling", "gambling/poker", "food"],
      new Set(["gambling"]),
      none,
      none,
      5,
    );
    expect(out).toEqual(["food"]);
  });

  it("drops ancestors when a deeper suggestion exists", () => {
    const out = filterSuggestedTags(["food", "food/groceries"], none, none, none, 5);
    expect(out).toEqual(["food/groceries"]);
  });

  it("drops ancestors of already-assigned deeper paths", () => {
    const out = filterSuggestedTags(
      ["food"],
      none,
      none,
      new Set(["food/groceries"]),
      5,
    );
    expect(out).toEqual([]);
  });

  it("drops exact duplicates of already-assigned tags", () => {
    const out = filterSuggestedTags(["food"], none, none, new Set(["food"]), 5);
    expect(out).toEqual([]);
  });

  it("caps brand-new tags but not reused existing tags", () => {
    const out = filterSuggestedTags(
      ["new-1", "new-2", "new-3", "known-1", "known-2"],
      none,
      new Set(["known-1", "known-2"]),
      none,
      2,
    );
    expect(out).toEqual(["new-1", "new-2", "known-1", "known-2"]);
  });
});
