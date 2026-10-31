"use client";

import { useMemo, useState } from "react";
import type { PoolConfig, Project, SplitPhilosophy } from "@/lib/types";
import { confirmCharter, savePoolConfig, setMemberConfirmation } from "@/lib/client";
import { MAX_FINDER_BPS, MAX_LEAD_BPS, layerAmounts } from "@/lib/layers";
import { toCents } from "@/lib/explain/rounding";
import { money } from "@/lib/utils";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  Spinner,
} from "@/components/ui";

type Draft = Omit<PoolConfig, "version">;

function draftFrom(project: Project): Draft {
  const config = project.poolConfig;
  return {
    finderBps: config?.finderBps ?? 0,
    finderMemberId: config?.finderMemberId ?? null,
    leadBps: config?.leadBps ?? 0,
    leadMemberId: config?.leadMemberId ?? null,
    workPhilosophy: config?.workPhilosophy ?? project.philosophy,
  };
}

function sameDraft(a: Draft, b: Draft): boolean {
  return (
    a.finderBps === b.finderBps &&
    a.finderMemberId === b.finderMemberId &&
    a.leadBps === b.leadBps &&
    a.leadMemberId === b.leadMemberId &&
    a.workPhilosophy === b.workPhilosophy
  );
}

/**
 * The charter: fixed fees off the top (finder, lead), how the work pool is
 * split, and every member's sign-off on this exact version. Scoring stays
 * locked until all members confirm; any edit starts a new version.
 *
 * Key this component by charter version so a saved edit resets the draft.
 */
export function CharterPanel({
  project,
  onProjectUpdate,
  onError,
}: {
  project: Project;
  onProjectUpdate: (project: Project) => void;
  onError: (message: string) => void;
}) {
  const saved = useMemo(() => draftFrom(project), [project]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [busy, setBusy] = useState<string | null>(null);

  const confirmedCount = project.members.filter((m) => m.confirmed).length;
  const unlocked = Boolean(project.poolConfig) && confirmedCount === project.members.length;
  const paid = project.status === "paid";
  const [open, setOpen] = useState(!unlocked);

  const dirty = !sameDraft(draft, saved);
  const layers = layerAmounts(toCents(project.totalAmount), draft);

  async function act(key: string, action: () => Promise<Project>) {
    setBusy(key);
    try {
      onProjectUpdate(await action());
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not update the charter.");
    } finally {
      setBusy(null);
    }
  }

  function setPct(field: "finderBps" | "leadBps", value: string, max: number) {
    const bps = Math.round(Number(value) * 100);
    setDraft((d) => ({ ...d, [field]: Number.isFinite(bps) ? Math.min(max, Math.max(0, bps)) : 0 }));
  }

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>Charter · v{project.charterVersion}</CardTitle>
          <p className="mt-0.5 text-sm text-slate-500">
            {money(layers.finderCents / 100)} finder fee · {money(layers.leadCents / 100)} lead
            fee · {money(layers.workPoolCents / 100)} work pool split by{" "}
            <span className="capitalize">{saved.workPhilosophy}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={unlocked ? "emerald" : "amber"}>
            {unlocked
              ? "Scoring unlocked"
              : `${confirmedCount}/${project.members.length} confirmed`}
          </Badge>
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide" : "Edit"}
          </Button>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-5">
          <fieldset disabled={paid || busy !== null} className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label>Finder fee (max {MAX_FINDER_BPS / 100}%)</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="0"
                  max={MAX_FINDER_BPS / 100}
                  step="0.5"
                  value={draft.finderBps / 100}
                  onChange={(e) => setPct("finderBps", e.target.value, MAX_FINDER_BPS)}
                  className="w-20 text-right"
                  aria-label="Finder fee percent"
                />
                <Select
                  value={draft.finderMemberId ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, finderMemberId: e.target.value || null }))}
                  aria-label="Finder"
                >
                  <option value="">No finder</option>
                  {project.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <Label>Lead fee (max {MAX_LEAD_BPS / 100}%)</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="0"
                  max={MAX_LEAD_BPS / 100}
                  step="0.5"
                  value={draft.leadBps / 100}
                  onChange={(e) => setPct("leadBps", e.target.value, MAX_LEAD_BPS)}
                  className="w-20 text-right"
                  aria-label="Lead fee percent"
                />
                <Select
                  value={draft.leadMemberId ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, leadMemberId: e.target.value || null }))}
                  aria-label="Lead"
                >
                  <option value="">No lead fee</option>
                  {project.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <Label>Work pool split</Label>
              <Select
                value={draft.workPhilosophy}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, workPhilosophy: e.target.value as SplitPhilosophy }))
                }
              >
                <option value="merit">Merit (AI-judged)</option>
                <option value="hybrid">Hybrid (merit + hours)</option>
                <option value="equal">Equal</option>
              </Select>
            </div>
          </fieldset>

          {dirty && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <span>
                Saving starts charter v{project.charterVersion + 1}. Everyone must confirm again
                and any existing scoring is discarded.
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setDraft(saved)}>
                  Discard
                </Button>
                <Button
                  size="sm"
                  onClick={() => act("save", () => savePoolConfig(project.id, draft))}
                  disabled={busy !== null}
                >
                  {busy === "save" ? <Spinner /> : "Save charter"}
                </Button>
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="mb-0">Sign-off on v{project.charterVersion}</Label>
              {!unlocked && !paid && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => act("all", () => confirmCharter(project.id))}
                  disabled={busy !== null || dirty}
                >
                  {busy === "all" ? <Spinner /> : "Confirm for everyone (demo)"}
                </Button>
              )}
            </div>
            <ul className="flex flex-wrap gap-2">
              {project.members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5"
                >
                  <Avatar name={m.name} className="h-7 w-7 text-[10px]" />
                  <div className="text-xs">
                    <p className="font-medium text-slate-800">{m.name}</p>
                    <p className="text-slate-500">{m.role === "lead" ? "Lead" : "Member"}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={m.confirmed ? "primary" : "outline"}
                    onClick={() =>
                      act(`member-${m.id}`, () =>
                        setMemberConfirmation(project.id, m.id, !m.confirmed)
                      )
                    }
                    disabled={paid || busy !== null || dirty}
                    aria-pressed={m.confirmed}
                  >
                    {busy === `member-${m.id}` ? <Spinner /> : m.confirmed ? "✓ Confirmed" : "Confirm"}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
