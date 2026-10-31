import type { ScoredContribution, ScoredPerson, ScoredSplit } from "../types";
import { computeSplit } from "./compute";

const QUIET_CATEGORIES = new Set([
  "review",
  "unblocking",
  "client_comms",
  "admin",
  "planning",
]);

/**
 * Client-side re-run of Step 2 after the lead routes an unassigned item to a
 * person. No model call: the judgment already exists, so only the maths moves.
 */
export function recomputeWithAssignments(
  split: ScoredSplit,
  assignments: Record<string, string>,
  members: Array<{ id: string; name: string }>
): ScoredSplit {
  const moved = split.unassigned.filter((item) => assignments[item.id]);
  if (moved.length === 0) return split;

  const names = new Map(members.map((member) => [member.id, member.name]));

  const reassigned: ScoredContribution[] = moved.map((item) => ({
    id: item.id,
    memberId: assignments[item.id],
    person: names.get(assignments[item.id]) ?? item.person,
    title: item.title,
    sourceId: item.sourceId,
    type: item.type,
    category: item.category,
    impact: item.impact,
    complexity: item.complexity,
    isQuietWork: QUIET_CATEGORIES.has(item.category),
    rationale: "Reassigned from the unassigned tray after the initial scoring run.",
    value: 0,
    linesChanged: 0,
    hours: item.hours,
    timestamp: item.timestamp,
    evidenceUrl: item.evidenceUrl,
  }));

  const contributions = [...split.contributions, ...reassigned];

  const computed = computeSplit({
    totalAmountCents: split.totalAmountCents,
    members,
    contributions: contributions.map((contribution) => ({
      id: contribution.id,
      memberId: contribution.memberId,
      person: contribution.person,
      category: contribution.category,
      impact: contribution.impact,
      complexity: contribution.complexity,
      hours: contribution.hours,
    })),
    // Same charter fees as the server run, so browser and server agree to the cent.
    layers: split.layers,
  });

  const values = computed.values;
  const valued = contributions.map((contribution) => ({
    ...contribution,
    value: values[contribution.id] ?? 0,
  }));
  const known = new Set(valued.map((contribution) => contribution.id));

  const extras = new Map<string, string[]>();
  for (const item of moved) {
    const memberId = assignments[item.id];
    extras.set(memberId, [...(extras.get(memberId) ?? []), item.id]);
  }

  const people: ScoredPerson[] = computed.people.map((person) => {
    const base = split.people.find((entry) => entry.memberId === person.memberId);
    const extra = (extras.get(person.memberId) ?? []).sort(
      (a, b) => (computed.values[b] ?? 0) - (computed.values[a] ?? 0)
    );
    const existing = base?.evidenceIds ?? [];
    const evidenceIds = Array.from(new Set([...extra, ...existing]))
      .filter((id) => known.has(id))
      .slice(0, 4);

    return {
      ...person,
      reason:
        base?.reason ??
        `${person.person}'s share was recalculated after assigning additional work.`,
      evidenceIds,
      range: base?.range,
    };
  });

  return {
    ...split,
    people,
    contributions: valued,
    unassigned: split.unassigned.filter((item) => !assignments[item.id]),
    formula: {
      ...split.formula,
      notes: [
        ...split.formula.notes,
        `${moved.length} unassigned item${moved.length === 1 ? "" : "s"} reassigned locally — recomputed without calling the model.`,
      ],
    },
  };
}
