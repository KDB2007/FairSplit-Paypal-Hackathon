/**
 * Integer-only money maths.
 *
 * Everything downstream of the model works in integer cents. Percentages are
 * distributed in basis points (1/100 of a percent) so the displayed shares also
 * sum to exactly 100.00. The largest-remainder method is used for both, which
 * guarantees the parts add up to the whole — no floating-point cents drift.
 */

export function toCents(amount: number): number {
  return Math.round((Number.isFinite(amount) ? amount : 0) * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * Split `totalUnits` integer units across `shares`, proportionally, so the
 * result sums to exactly `totalUnits`.
 *
 * - Non-finite or negative shares count as 0.
 * - If every share is 0, units are spread as evenly as possible.
 * - Ties break towards the larger share, then the earlier index (stable).
 */
export function largestRemainder(shares: number[], totalUnits: number): number[] {
  const count = shares.length;
  if (count === 0) return [];

  const total = Math.max(0, Math.round(Number.isFinite(totalUnits) ? totalUnits : 0));
  const safe = shares.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const sum = safe.reduce((acc, v) => acc + v, 0);

  if (sum <= 0) {
    const base = Math.floor(total / count);
    const result = new Array<number>(count).fill(base);
    let spare = total - base * count;
    for (let i = 0; i < count && spare > 0; i += 1) {
      result[i] += 1;
      spare -= 1;
    }
    return result;
  }

  const exact = safe.map((v) => (v / sum) * total);
  const floors = exact.map((v) => Math.floor(v));
  const assigned = floors.reduce((acc, v) => acc + v, 0);
  let spare = total - assigned;

  const order = exact
    .map((v, index) => ({
      index,
      fraction: v - Math.floor(v),
      weight: safe[index],
    }))
    .sort((a, b) => {
      if (b.fraction !== a.fraction) return b.fraction - a.fraction;
      if (b.weight !== a.weight) return b.weight - a.weight;
      return a.index - b.index;
    });

  const result = floors.slice();
  let cursor = 0;
  while (spare > 0 && order.length > 0) {
    result[order[cursor % order.length].index] += 1;
    cursor += 1;
    spare -= 1;
  }
  // Guard against a negative spare caused by float epsilon on `exact`.
  while (spare < 0) {
    const target = order[order.length - 1 - (cursor % order.length)];
    if (result[target.index] === 0) break;
    result[target.index] -= 1;
    spare += 1;
  }

  return result;
}

/** Percent shares in basis points that always sum to 10_000 (100.00%). */
export function sharesToBasisPoints(shares: number[]): number[] {
  return largestRemainder(shares, 10_000);
}

/** Distribute integer cents so the line items sum exactly to `totalCents`. */
export function sharesToCents(shares: number[], totalCents: number): number[] {
  return largestRemainder(shares, totalCents);
}
