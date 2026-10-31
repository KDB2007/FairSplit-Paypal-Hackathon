import type { Member, Project } from "./types";

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Normalise percentages so they sum to exactly 100 (2 decimals). */
export function normalizePercentages(values: number[]): number[] {
  const safe = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = safe.reduce((sum, v) => sum + v, 0);
  if (total <= 0) {
    const equal = 100 / Math.max(1, values.length);
    return values.map(() => round2(equal));
  }
  const scaled = safe.map((v) => round2((v / total) * 100));
  const drift = round2(100 - scaled.reduce((s, v) => s + v, 0));
  if (Math.abs(drift) >= 0.01 && scaled.length > 0) {
    const maxIndex = scaled.indexOf(Math.max(...scaled));
    scaled[maxIndex] = round2(scaled[maxIndex] + drift);
  }
  return scaled;
}

export function amountFor(percentage: number, totalAmount: number): number {
  return round2((percentage / 100) * totalAmount);
}

export function equalSplit(members: Member[]): Array<{ person: string; pct: number }> {
  if (members.length === 0) return [];
  const base = round2(100 / members.length);
  const values = members.map(() => base);
  const drift = round2(100 - values.reduce((s, v) => s + v, 0));
  if (values.length > 0) values[0] = round2(values[0] + drift);
  return members.map((m, i) => ({ person: m.name, pct: values[i] }));
}

/** Hours-based split: logged hours per person, fallback to activity counts. */
export function hoursSplit(project: Project): Array<{ person: string; pct: number }> {
  const weights = project.members.map((member) => {
    const items = project.contributions.filter(
      (c) => c.person.toLowerCase() === member.name.toLowerCase()
    );
    const hours = items.reduce((sum, c) => sum + (c.hours ?? 0), 0);
    const fallback = items.length > 0 ? items.length * 0.5 : 0.1;
    return hours > 0 ? hours : fallback;
  });
  const pcts = normalizePercentages(weights);
  return project.members.map((m, i) => ({ person: m.name, pct: pcts[i] }));
}

/**
 * Rescale the remaining shares proportionally when one is edited, keeping 100.
 *
 * Shares flagged in `locked` (previously edited by a human) are left untouched,
 * so a lead can dial in exact numbers one field at a time instead of fighting
 * the automatic rescale. If every other row is locked, we fall back to
 * proportionally rescaling all of them so the total still hits 100.
 */
export function redistribute(
  values: number[],
  changedIndex: number,
  nextValue: number,
  locked: boolean[] = []
): number[] {
  const clamped = Math.max(0, Math.min(100, Number(nextValue) || 0));
  const remaining = Math.max(0, 100 - clamped);

  let eligible = values
    .map((_, i) => i)
    .filter((i) => i !== changedIndex && !locked[i]);
  if (eligible.length === 0) {
    eligible = values.map((_, i) => i).filter((i) => i !== changedIndex);
  }

  const eligibleTotal = eligible.reduce(
    (sum, i) => sum + Math.max(0, values[i]),
    0
  );

  const next = values.map((v, i) => {
    if (i === changedIndex) return round2(clamped);
    if (!eligible.includes(i)) return round2(Math.max(0, v));
    if (eligibleTotal <= 0) return round2(remaining / eligible.length);
    return round2((Math.max(0, v) / eligibleTotal) * remaining);
  });

  // Put rounding drift on the largest eligible (non-locked) row.
  const drift = round2(100 - next.reduce((s, v) => s + v, 0));
  if (Math.abs(drift) >= 0.01) {
    const candidates = eligible.length ? eligible : [changedIndex];
    const target = candidates.reduce(
      (best, i) => (next[i] > next[best] ? i : best),
      candidates[0]
    );
    next[target] = round2(next[target] + drift);
  }
  return next;
}
