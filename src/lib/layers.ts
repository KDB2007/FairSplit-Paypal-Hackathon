import type { LayerAmounts, Member, PoolConfig } from "./types";
import { sharesToCents, toCents } from "./explain/rounding";

/**
 * Layered pool money — pure and client-safe.
 *
 * The charter carves fixed fees off the top (finder, then lead) and the rest
 * is the work pool. Fees are locked by the charter; only the work pool is
 * scored by the AI and adjustable in review. Everything is integer cents and
 * the parts always add back up to the total.
 */

export const MAX_FINDER_BPS = 1500;
export const MAX_LEAD_BPS = 1000;

export function defaultPoolConfig(workPhilosophy: PoolConfig["workPhilosophy"]): PoolConfig {
  return {
    version: 1,
    finderBps: 0,
    finderMemberId: null,
    leadBps: 0,
    leadMemberId: null,
    workPhilosophy,
  };
}

function bpsOf(totalCents: number, bps: number): number {
  return Math.round((totalCents * Math.max(0, bps)) / 10_000);
}

/** Split the total into finder fee, lead fee and work pool. No config ⇒ all work pool. */
export function layerAmounts(
  totalCents: number,
  config?: Pick<PoolConfig, "finderBps" | "finderMemberId" | "leadBps" | "leadMemberId"> | null
): LayerAmounts {
  const total = Math.max(0, Math.round(totalCents));
  // A fee with nobody to receive it stays in the work pool.
  const finderCents = config?.finderMemberId ? bpsOf(total, config.finderBps) : 0;
  const leadCents = config?.leadMemberId ? bpsOf(total, config.leadBps) : 0;
  return {
    finderCents,
    leadCents,
    workPoolCents: total - finderCents - leadCents,
    finderMemberId: config?.finderMemberId ?? null,
    leadMemberId: config?.leadMemberId ?? null,
  };
}

export function feesFor(memberId: string | undefined, layers: LayerAmounts) {
  const finderCents = memberId && memberId === layers.finderMemberId ? layers.finderCents : 0;
  const leadCents = memberId && memberId === layers.leadMemberId ? layers.leadCents : 0;
  return { finderCents, leadCents, feeCents: finderCents + leadCents };
}

export interface PersonAllocation {
  person: string;
  memberId?: string;
  /** Share of the work pool, in percent. */
  workPct: number;
  finderCents: number;
  leadCents: number;
  workCents: number;
  totalCents: number;
}

/**
 * Turn work-pool percentages into cents per person: charter fees plus their
 * slice of the work pool. Work-pool slices use largest remainder, so
 * fees + slices sum to exactly the project total.
 */
export function allocate(
  project: { totalAmount: number; poolConfig?: PoolConfig; members: Pick<Member, "id" | "name">[] },
  rows: Array<{ person: string; pct: number }>
): PersonAllocation[] {
  const layers = layerAmounts(toCents(project.totalAmount), project.poolConfig);
  const work = sharesToCents(
    rows.map((row) => row.pct),
    layers.workPoolCents
  );
  return rows.map((row, index) => {
    const memberId = project.members.find((m) => m.name === row.person)?.id;
    const fees = feesFor(memberId, layers);
    return {
      person: row.person,
      memberId,
      workPct: row.pct,
      finderCents: fees.finderCents,
      leadCents: fees.leadCents,
      workCents: work[index],
      totalCents: fees.feeCents + work[index],
    };
  });
}

/**
 * What each member is owed at payout. Approved members get charter fees plus
 * their work-pool slice. A disputed member's work slice is withheld, but their
 * charter fees were agreed up front and are still paid. Zero lines are dropped.
 */
export function payableAllocations(
  project: { totalAmount: number; poolConfig?: PoolConfig; members: Pick<Member, "id" | "name">[] },
  decisions: Array<{ person: string; finalPct: number; status: string }>
): PersonAllocation[] {
  const allocations = allocate(
    project,
    decisions.map((d) => ({ person: d.person, pct: d.finalPct }))
  );
  return allocations
    .map((a, index) => {
      if (decisions[index].status !== "disputed") return a;
      return { ...a, workCents: 0, totalCents: a.finderCents + a.leadCents };
    })
    .filter((a) => a.totalCents > 0);
}
