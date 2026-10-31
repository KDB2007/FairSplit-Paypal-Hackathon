import type { ContributionCategory, ContributionJudgment } from "../types";
import type { NormalizedContribution } from "../types";
import { isQuietCategory } from "./compute";
import { normalizeKey } from "./normalize";

/**
 * DEMO_MODE fixtures.
 *
 * These are *judgments only* — category, impact, complexity and a one-line
 * rationale per item. No percentages, no amounts, no member totals: the exact
 * same Step 2 maths that runs for a real model call produces the split from
 * these numbers. That is the whole point of the demo.
 */

interface CannedJudgment {
  category: ContributionCategory;
  impact: number;
  complexity: number;
  rationale: string;
}

/** Keyed by normalized sourceId (PR number, SHA, card id, manual id). */
export const CANNED_JUDGMENTS: Record<string, CannedJudgment> = {
  /* ---- Priya (lead) ---- */
  "p-01": {
    category: "code",
    impact: 3,
    complexity: 3,
    rationale: "Stood up the repo, CI and deploy pipeline the whole project shipped on.",
  },
  "p-02": {
    category: "planning",
    impact: 4,
    complexity: 4,
    rationale: "Charter and milestone plan set scope and sequencing for every later task.",
  },
  "#42": {
    category: "code",
    impact: 5,
    complexity: 5,
    rationale: "Built the PayPal payout integration, the core deliverable the client paid for.",
  },
  "m-01": {
    category: "client_comms",
    impact: 5,
    complexity: 4,
    rationale: "Ran the kickoff and pinned scope, budget and success criteria with the client.",
  },
  "card-77": {
    category: "planning",
    impact: 3,
    complexity: 3,
    rationale: "Estimated and sequenced milestone two so work never stalled.",
  },
  "m-02": {
    category: "admin",
    impact: 3,
    complexity: 2,
    rationale: "Handled contractor onboarding and invoicing without pulling others in.",
  },

  /* ---- Leo (developer) ---- */
  "l-01": {
    category: "code",
    impact: 4,
    complexity: 4,
    rationale: "Auth and session handling unlocked every authenticated screen.",
  },
  "l-02": {
    category: "code",
    impact: 4,
    complexity: 4,
    rationale: "Checkout state machine carried the highest-risk user journey.",
  },
  "l-03": {
    category: "code",
    impact: 2,
    complexity: 2,
    rationale: "Small null guard that prevented a cart crash.",
  },
  "l-04": {
    category: "code",
    impact: 3,
    complexity: 3,
    rationale: "Fixed invoice rounding so payouts matched the agreed amounts.",
  },
  "l-05": {
    category: "code",
    impact: 2,
    complexity: 2,
    rationale: "Loading states made the dashboard feel responsive.",
  },
  "l-06": {
    category: "code",
    impact: 3,
    complexity: 3,
    rationale: "Shipped receipt PDF export the client asked for by name.",
  },
  "l-07": {
    category: "code",
    impact: 3,
    complexity: 3,
    rationale: "Retry queue stopped transient payout failures from losing money.",
  },
  "l-08": {
    category: "code",
    impact: 3,
    complexity: 3,
    rationale: "End-to-end checkout test caught regressions before demo day.",
  },
  "#43": {
    category: "code",
    impact: 4,
    complexity: 4,
    rationale: "Diagnosed and fixed a checkout race that blocked the launch.",
  },
  "l-12": {
    category: "unblocking",
    impact: 4,
    complexity: 3,
    rationale: "Pair-debugged the payout webhook with Priya until it passed.",
  },

  /* ---- Maya (ops / design) ---- */
  "m-21": {
    category: "design",
    impact: 5,
    complexity: 5,
    rationale: "Built the design system and component library everything else reused.",
  },
  "m-22": {
    category: "code",
    impact: 3,
    complexity: 3,
    rationale: "Polished the landing page across breakpoints for the client demo.",
  },
  "m-23": {
    category: "review",
    impact: 5,
    complexity: 4,
    rationale: "Reviewed nearly every checkout PR and caught issues before merge.",
  },
  "m-24": {
    category: "unblocking",
    impact: 5,
    complexity: 4,
    rationale: "Walked Leo through the API contract, unblocking auth for days.",
  },
  "m-25": {
    category: "client_comms",
    impact: 4,
    complexity: 4,
    rationale: "Kept the client aligned with weekly notes and demo preparation.",
  },
  "m-26": {
    category: "review",
    impact: 4,
    complexity: 3,
    rationale: "Accessibility audit produced the QA checklist the team shipped against.",
  },
  "m-27": {
    category: "admin",
    impact: 3,
    complexity: 2,
    rationale: "Cleared invoice and contractor paperwork so payouts could run.",
  },

  /* ---- Unassigned (judged so the lead can assign without a model call) ---- */
  "card-99": {
    category: "review",
    impact: 2,
    complexity: 2,
    rationale: "QA checklist closed out, with no clear owner recorded in Trello.",
  },
  "x-01": {
    category: "code",
    impact: 3,
    complexity: 2,
    rationale: "Empty-state polish from an external contributor not on the roster.",
  },
};

/**
 * Tiny deterministic re-reads used as runs 2 and 3. Real pipeline runs the
 * model three times at temperature 0.2; the demo replays these instead. The
 * deltas are deliberately small: the demo should read as high confidence.
 */
const PERTURBATIONS: Array<Record<string, { impact?: number; complexity?: number }>> = [
  {},
  { "#42": { impact: 4 }, "l-01": { impact: 3 } },
  { "m-24": { impact: 4 }, "l-02": { impact: 5 } },
];

export function cannedJudgmentsForRun(
  items: NormalizedContribution[],
  runIndex: number
): ContributionJudgment[] {
  const perturbation = PERTURBATIONS[runIndex % PERTURBATIONS.length] ?? {};
  return items.map((item) => {
    const canned = CANNED_JUDGMENTS[normalizeKey(item.sourceId)];
    const tweak = perturbation[normalizeKey(item.sourceId)];
    const category = canned?.category ?? item.categoryHint ?? "code";
    const impact = clamp(tweak?.impact ?? canned?.impact ?? 3);
    const complexity = clamp(tweak?.complexity ?? canned?.complexity ?? 3);
    return {
      id: item.id,
      category,
      impact,
      complexity,
      isQuietWork: isQuietCategory(category),
      rationale: canned?.rationale ?? fallbackRationale(item.title, category),
    };
  });
}

function clamp(value: number): number {
  return Math.min(5, Math.max(1, Math.round(value)));
}

function fallbackRationale(title: string, category: ContributionCategory): string {
  const suffix = title ? `: ${title}` : "";
  return `Logged ${label(category)} work${suffix}`.slice(0, 140);
}

function label(category: ContributionCategory): string {
  return category.replace("_", " ");
}

/** Step 3 canned explanations. Keyed by member name, never by share. */
export const CANNED_REASONS: Record<string, string> = {
  Priya:
    "Priya set the technical direction, built the PayPal payout integration and ran scope with the client. Her share reflects the highest-impact code plus the coordination that kept the project on track.",
  Leo:
    "Leo shipped the largest volume of implementation work, including auth and checkout. His share balances that throughput against the depth of the harder fixes.",
  Maya:
    "Maya carried the quiet work: she reviewed nearly every PR, unblocked teammates and kept the client informed. That produced few commits but repeatedly kept the project moving.",
};

/** Deterministic, number-free explanation for projects outside the demo cast. */
export function generatedReason(
  person: string,
  contributions: Array<{ category: ContributionCategory; value: number }>
): string {
  if (contributions.length === 0) {
    return `${person} has no logged activity in this project yet, so they are shown at 0% until work is recorded.`;
  }
  const totals = new Map<ContributionCategory, number>();
  for (const contribution of contributions) {
    totals.set(contribution.category, (totals.get(contribution.category) ?? 0) + contribution.value);
  }
  const ranked = Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([category]) => label(category));
  const quiet = contributions.some((c) =>
    ["review", "unblocking", "client_comms", "admin", "planning"].includes(c.category)
  );
  const lead = `${person}'s share is driven mainly by ${ranked.join(" and ")} work`;
  return quiet
    ? `${lead}, including quiet work that does not show up as commits.`
    : `${lead}.`;
}
