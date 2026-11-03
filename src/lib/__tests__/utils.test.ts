import { describe, expect, it } from "vitest";
import { timeAgo, uniqueLines } from "../utils";

const NOW = Date.parse("2026-11-02T12:00:00.000Z");

describe("timeAgo", () => {
  it("reports just now for anything under a minute", () => {
    expect(timeAgo(new Date(NOW - 10_000).toISOString(), NOW)).toBe("just now");
  });

  it("uses minutes under an hour", () => {
    expect(timeAgo(new Date(NOW - 5 * 60_000).toISOString(), NOW)).toBe("5m ago");
  });

  it("uses hours under a day", () => {
    expect(timeAgo(new Date(NOW - 4 * 3_600_000).toISOString(), NOW)).toBe("4h ago");
  });

  it("uses days under a week", () => {
    expect(timeAgo(new Date(NOW - 3 * 86_400_000).toISOString(), NOW)).toBe("3d ago");
  });

  it("falls back to the date past a week", () => {
    const iso = new Date(NOW - 10 * 86_400_000).toISOString();
    expect(timeAgo(iso, NOW)).not.toMatch(/ago$/);
  });

  it("returns an empty string for an unparseable date", () => {
    expect(timeAgo("not-a-date", NOW)).toBe("");
  });
});

describe("uniqueLines", () => {
  it("drops blanks and exact duplicates while preserving order", () => {
    expect(uniqueLines(["first", " first ", "", "second", "first"])).toEqual(["first", "second"]);
  });

  it("keeps genuinely different lines that share a prefix", () => {
    expect(uniqueLines(["run 1: timeout", "run 2: timeout"])).toEqual([
      "run 1: timeout",
      "run 2: timeout",
    ]);
  });
});
