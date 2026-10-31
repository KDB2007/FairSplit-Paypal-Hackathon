import { describe, expect, it } from "vitest";
import {
  largestRemainder,
  sharesToBasisPoints,
  sharesToCents,
  toCents,
  fromCents,
} from "../rounding";

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("largestRemainder", () => {
  it("always sums to the requested total (1000 random cases)", () => {
    const random = seededRandom(42);
    for (let caseIndex = 0; caseIndex < 1000; caseIndex += 1) {
      const count = 1 + Math.floor(random() * 6);
      const shares = Array.from({ length: count }, () => random() * 1000);
      const total = Math.floor(random() * 500_000);
      const parts = largestRemainder(shares, total);
      expect(parts).toHaveLength(count);
      expect(parts.reduce((sum, value) => sum + value, 0)).toBe(total);
      expect(parts.every((value) => value >= 0)).toBe(true);
      expect(parts.every((value) => Number.isInteger(value))).toBe(true);
    }
  });

  it("distributes evenly when every share is zero", () => {
    expect(largestRemainder([0, 0, 0], 100)).toEqual([34, 33, 33]);
  });

  it("ignores negative and non-finite shares", () => {
    expect(largestRemainder([-5, Number.NaN, 10], 100)).toEqual([0, 0, 100]);
  });

  it("breaks ties by larger share, then by index", () => {
    expect(largestRemainder([1, 1, 1], 100)).toEqual([34, 33, 33]);
  });

  it("returns an empty array for no shares", () => {
    expect(largestRemainder([], 100)).toEqual([]);
  });
});

describe("percent and cent helpers", () => {
  it("basis points always total 10_000", () => {
    const random = seededRandom(7);
    for (let i = 0; i < 250; i += 1) {
      const shares = Array.from({ length: 1 + Math.floor(random() * 8) }, () => random());
      const bps = sharesToBasisPoints(shares);
      expect(bps.reduce((sum, value) => sum + value, 0)).toBe(10_000);
    }
  });

  it("cents always total the project amount", () => {
    expect(sharesToCents([1, 1, 1], 300_000).reduce((s, v) => s + v, 0)).toBe(300_000);
    // $3,000 split three ways cannot be equal in cents: 100000 x3 is exact, so
    // use a prime-ish total to force the remainder path.
    const parts = sharesToCents([1, 1, 1], 10_001);
    expect(parts.reduce((s, v) => s + v, 0)).toBe(10_001);
    expect(new Set(parts).size).toBe(2);
  });

  it("converts dollars to integer cents without float dust", () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(1234.56)).toBe(123456);
    expect(toCents(19.99)).toBe(1999);
    expect(fromCents(123456)).toBe(1234.56);
  });
});
