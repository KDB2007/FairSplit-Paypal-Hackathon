import { describe, expect, it, vi } from "vitest";
import { mapWithConcurrency } from "../llm";

describe("mapWithConcurrency", () => {
  it("preserves input order regardless of completion order", async () => {
    const delays = [30, 0, 20, 10];
    const results = await mapWithConcurrency(delays, 4, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return ms;
    });
    expect(results).toEqual(delays.map((ms) => ({ ok: true, value: ms })));
  });

  it("never runs more than `limit` tasks at once", async () => {
    let active = 0;
    let maxActive = 0;
    await mapWithConcurrency(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
    });
    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it("captures a task's rejection instead of aborting the others", async () => {
    const results = await mapWithConcurrency([1, 2, 3], 3, async (n) => {
      if (n === 2) throw new Error("boom");
      return n * 10;
    });
    expect(results).toEqual([
      { ok: true, value: 10 },
      { ok: false, error: expect.any(Error) },
      { ok: true, value: 30 },
    ]);
  });

  it("keeps working through a slot queue without losing later results", async () => {
    const run = vi.fn(async (n: number) => n);
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, run);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(run).toHaveBeenCalledTimes(5);
  });
});
