"use client";

import { useEffect, useRef } from "react";
import type {
  ContributionCategory,
  ScoredContribution,
  ScoredPerson,
} from "@/lib/types";
import { cn, formatDate, money } from "@/lib/utils";
import { ContributorRadar } from "./contributor-radar";
import { cleanReason } from "./clean-reason";
import { Avatar, Badge, Button } from "@/components/ui";

/* -------------------------------------------------------------------------- */
/* Category presentation                                                      */
/* -------------------------------------------------------------------------- */

type Tone = "slate" | "blue" | "emerald" | "amber" | "rose" | "violet";

export const CATEGORY_LABEL: Record<ContributionCategory, string> = {
  code: "Code",
  design: "Design",
  review: "Review",
  unblocking: "Unblocking",
  client_comms: "Client",
  admin: "Admin",
  planning: "Planning",
};

const CATEGORY_ORDER: ContributionCategory[] = [
  "code",
  "design",
  "review",
  "unblocking",
  "client_comms",
  "admin",
  "planning",
];

const CATEGORY_TONE: Record<ContributionCategory, Tone> = {
  code: "blue",
  design: "violet",
  review: "emerald",
  unblocking: "amber",
  client_comms: "blue",
  admin: "slate",
  planning: "violet",
};

export function CategoryBadge({ category }: { category: ContributionCategory }) {
  return <Badge tone={CATEGORY_TONE[category]}>{CATEGORY_LABEL[category]}</Badge>;
}

function ScoreDots({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="flex items-center gap-0.5" aria-label={`${label} ${value} out of 5`}>
        {[1, 2, 3, 4, 5].map((step) => (
          <span
            key={step}
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              step <= value ? "bg-foreground/80" : "bg-muted"
            )}
          />
        ))}
      </span>
      <span className="text-[10px] font-medium tabular-nums text-muted-foreground">{value}/5</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Evidence chips                                                             */
/* -------------------------------------------------------------------------- */

export function EvidenceChips({
  person,
  contributionsById,
  onOpen,
}: {
  person: ScoredPerson;
  contributionsById: Map<string, ScoredContribution>;
  onOpen: (id: string) => void;
}) {
  const items = person.evidenceIds
    .map((id) => contributionsById.get(id))
    .filter((item): item is ScoredContribution => Boolean(item));

  if (items.length === 0) {
    return <Badge tone="slate">No linked evidence</Badge>;
  }

  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    items: items.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="space-y-1.5">
      {groups.map((group) => (
        <div key={group.category} className="flex flex-wrap items-center gap-1.5">
          <span className="w-[74px] shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {CATEGORY_LABEL[group.category]}
          </span>
          {group.items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpen(item.id)}
              title={item.title}
              className="inline-flex max-w-[190px] items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-foreground/80 transition-colors hover:border-primary/40 hover:bg-accent hover:text-primary/80"
            >
              <span className="truncate font-medium">{chipLabel(item)}</span>
              <span className="text-muted-foreground/60" aria-hidden>
                ↗
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function shortId(value: string): string {
  return value.length > 10 ? `${value.slice(0, 8)}…` : value;
}

/**
 * GitHub PRs keep their "#42" handle; auto-generated ids (e.g. `manual_4f2a`)
 * are meaningless to a reader, so the activity title is shown instead.
 */
function chipLabel(item: ScoredContribution): string {
  if (item.sourceId.startsWith("#")) return item.sourceId;
  if (/^(manual|con|src|cnt)[-_]/i.test(item.sourceId)) {
    return item.title.length > 22 ? `${item.title.slice(0, 22)}…` : item.title;
  }
  return shortId(item.sourceId);
}

/* -------------------------------------------------------------------------- */
/* Evidence drawer                                                            */
/* -------------------------------------------------------------------------- */

export function EvidenceSheet({
  open,
  onClose,
  person,
  modeLabel,
  sharePct,
  amountCents,
  contributionsById,
  focusId,
  color,
  peers,
}: {
  open: boolean;
  onClose: () => void;
  person: ScoredPerson | null;
  modeLabel: string;
  sharePct: number;
  amountCents: number;
  contributionsById: Map<string, ScoredContribution>;
  focusId: string | null;
  color: string;
  /** Everyone on the split, for the radar's team average. */
  peers?: ScoredPerson[];
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !focusId) return;
    const target = document.getElementById(`evidence-${focusId}`);
    if (!target) return;
    const timer = window.setTimeout(
      () => target.scrollIntoView({ block: "center", behavior: "smooth" }),
      120
    );
    return () => window.clearTimeout(timer);
  }, [open, focusId]);

  const items = person
    ? person.evidenceIds
        .map((id) => contributionsById.get(id))
        .filter((item): item is ScoredContribution => Boolean(item))
    : [];

  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    items: items.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);

  return (
    <div
      className={cn("fixed inset-0 z-50", open ? "visible" : "invisible")}
      aria-hidden={!open}
    >
      <button
        type="button"
        tabIndex={open ? 0 : -1}
        aria-label="Close evidence"
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-black/40 backdrop-blur-[1px] transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0"
        )}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={person ? `Evidence for ${person.person}` : "Evidence"}
        tabIndex={-1}
        className={cn(
          "absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-border bg-card shadow-2xl outline-none transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {person && (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="flex items-center gap-3">
                <Avatar name={person.person} />
                <div>
                  <p className="font-semibold text-foreground">{person.person}</p>
                  <p className="text-xs text-muted-foreground">
                    {sharePct.toFixed(2)}% under {modeLabel} · {money(amountCents / 100)}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close">
                ✕
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                <span className="text-xs text-muted-foreground">
                  Each item was judged by the model; every percentage is computed in code.
                </span>
              </div>

              <p className="mt-3 rounded-lg bg-muted/50 px-3 py-3 text-sm leading-relaxed text-foreground/80">
                {cleanReason(person.reason)}
              </p>

              {person.range && (
                <p className="mt-2 text-xs text-warning-foreground dark:text-warning">
                  Merit share ranged {person.range.minMeritPct.toFixed(1)}–
                  {person.range.maxMeritPct.toFixed(1)}% across runs.
                </p>
              )}

              {peers && !person.zeroActivity && (
                <div className="mt-4">
                  <ContributorRadar
                    person={person}
                    peers={peers}
                    contributions={[...contributionsById.values()]}
                    color={color}
                  />
                </div>
              )}

              <div className="mt-5 space-y-5">
                {groups.map((group) => (
                  <section key={group.category}>
                    <h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {CATEGORY_LABEL[group.category]}
                      <span className="font-normal normal-case text-muted-foreground/60">
                        {group.items.length} item{group.items.length === 1 ? "" : "s"}
                      </span>
                    </h3>
                    <ul className="space-y-2">
                      {group.items.map((item) => (
                        <li
                          key={item.id}
                          id={`evidence-${item.id}`}
                          className={cn(
                            "rounded-xl border p-3 transition-colors",
                            focusId === item.id
                              ? "border-primary/40 bg-accent/60 ring-1 ring-primary/25"
                              : "border-border bg-card"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium leading-snug text-foreground">
                              {item.title}
                            </p>
                            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {chipLabel(item)}
                            </span>
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                            <ScoreDots label="Impact" value={item.impact} />
                            <ScoreDots label="Complexity" value={item.complexity} />
                          </div>

                          <p className="mt-2 text-xs leading-relaxed text-foreground/80">
                            “{item.rationale}”
                          </p>

                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                            {item.hours > 0 && <span>{item.hours}h logged</span>}
                            {item.linesChanged > 0 && (
                              <span>{item.linesChanged} lines changed</span>
                            )}
                            <span>{formatDate(item.timestamp)}</span>
                            {item.isQuietWork && (
                              <span className="rounded-full bg-success/10 px-1.5 py-0.5 font-medium text-success">
                                quiet work
                              </span>
                            )}
                            {item.evidenceUrl ? (
                              <a
                                href={item.evidenceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="ml-auto font-medium text-primary hover:underline"
                              >
                                View source ↗
                              </a>
                            ) : (
                              <span className="ml-auto">Manual entry · no link</span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </div>

            <div className="border-t border-border px-5 py-3">
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                value = impact × complexity × category weight. Percentages and cents come from
                code, never from the model.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
