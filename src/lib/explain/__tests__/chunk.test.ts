import { describe, expect, it } from "vitest";
import { JUDGE_CHUNK_SIZE, chunkItems } from "../llm";

describe("chunkItems", () => {
  it("keeps a small input as one call", () => {
    expect(chunkItems([1, 2, 3])).toEqual([[1, 2, 3]]);
  });

  it("splits a large input into bounded calls", () => {
    const items = Array.from({ length: JUDGE_CHUNK_SIZE * 2 + 3 }, (_, i) => i);
    const chunks = chunkItems(items);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(JUDGE_CHUNK_SIZE);
    expect(chunks[1]).toHaveLength(JUDGE_CHUNK_SIZE);
    expect(chunks[2]).toHaveLength(3);
    expect(chunks.flat()).toEqual(items);
  });

  it("handles an empty list", () => {
    expect(chunkItems([])).toEqual([]);
  });
});
