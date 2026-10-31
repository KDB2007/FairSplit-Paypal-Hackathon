"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Contribution, Project, ScoreMode, ScoredSplit } from "@/lib/types";
import {
  confirmCharter,
  fetchProject,
  logContribution,
  saveSplit,
  sendPayout,
  syncActivity,
} from "@/lib/client";
import { amountFor, equalSplit, hoursSplit, redistribute } from "@/lib/split";
import { formatDate, money } from "@/lib/utils";
import { ExplainableSplit } from "@/components/explain/explainable-split";
import { shareFor } from "@/components/explain/split-visuals";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  PageShell,
  Progress,
  Select,
  Spinner,
  Stepper,
} from "@/components/ui";

const STEPS = ["Contributions", "AI scoring", "Review", "PayPal payout"];

const STATUS_TONE: Record<string, "slate" | "blue" | "emerald" | "amber" | "violet"> = {
  draft: "slate",
  charter_confirmed: "blue",
  scored: "violet",
  approved: "amber",
  paid: "emerald",
};

const TYPE_TONE: Record<Contribution["type"], "blue" | "emerald" | "violet" | "slate"> = {
  commit: "blue",
  pr: "blue",
  trello: "emerald",
  manual: "violet",
};

const TYPE_LABEL: Record<Contribution["type"], string> = {
  commit: "GitHub commit",
  pr: "GitHub PR",
  trello: "Trello",
  manual: "Manual",
};

interface DecisionRow {
  person: string;
  pct: number;
  note: string;
  status: "proposed" | "approved" | "disputed";
  locked: boolean;
}

export default function ProjectPage() {
  const params = useParams();
  const projectId = String(params?.id ?? "");

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [step, setStep] = useState(0);
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [whatIf, setWhatIf] = useState<"merit" | "equal" | "hours">("merit");
  const [manual, setManual] = useState<{
    person: string;
    kind: string;
    title: string;
    hours: string;
  }>({ person: "", kind: "client_call", title: "", hours: "" });
  const [payout, setPayout] = useState<{
    batchId: string;
    simulated: boolean;
    message: string;
  } | null>(null);

  const initializedFor = useRef<string>("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchProject(projectId)
      .then((data) => {
        if (!active) return;
        setProject(data);
        if (data.status === "paid") setStep(3);
        else if (data.scoredSplit) setStep(1);
        else if (data.decisions.length > 0 || data.proposals.length > 0) setStep(2);
        else if (data.contributions.length > 0) setStep(0);
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (!project) return;
    const signature = `${project.id}:${project.proposals.length}:${project.decisions.length}`;
    if (initializedFor.current === signature) return;
    initializedFor.current = signature;

    const base = project.decisions.length
      ? project.decisions.map((d) => ({
          person: d.person,
          pct: d.finalPct,
          note: d.overrideNote ?? "",
          status: d.status === "paid" ? "approved" : (d.status as DecisionRow["status"]),
          locked: false,
        }))
      : project.proposals.map((p) => ({
          person: p.person,
          pct: p.percentage,
          note: "",
          status: "proposed" as const,
          locked: false,
        }));
    setDecisions(base);
  }, [project]);

  const applyProject = useCallback((next: Project) => {
    setProject(next);
  }, []);

  const contributionsByPerson = useMemo(() => {
    if (!project) return [] as Array<{ person: string; items: Contribution[] }>;
    return project.members.map((member) => ({
      person: member.name,
      items: project.contributions
        .filter((c) => c.person.toLowerCase() === member.name.toLowerCase())
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    }));
  }, [project]);

  const whatIfRows = useMemo(() => {
    if (!project) return [] as Array<{ person: string; pct: number; amount: number }>;
    if (whatIf === "equal") {
      return equalSplit(project.members).map((r) => ({
        ...r,
        amount: amountFor(r.pct, project.totalAmount),
      }));
    }
    if (whatIf === "hours") {
      return hoursSplit(project).map((r) => ({
        ...r,
        amount: amountFor(r.pct, project.totalAmount),
      }));
    }
    const source = project.decisions.length
      ? project.decisions.map((d) => ({ person: d.person, pct: d.finalPct }))
      : project.proposals.map((p) => ({ person: p.person, pct: p.percentage }));
    return source.map((r) => ({ ...r, amount: amountFor(r.pct, project.totalAmount) }));
  }, [project, whatIf]);

  const totalDecisionPct = decisions.reduce((s, d) => s + d.pct, 0);

  async function run<T>(key: string, action: () => Promise<T>): Promise<T | null> {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      return await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function onConfirmCharter() {
    const next = await run("charter", () => confirmCharter(projectId));
    if (next) {
      applyProject(next);
      setNotice("Charter confirmed — everyone is in.");
    }
  }

  async function onSync(source: "github" | "trello" | "both") {
    const result = await run(`sync-${source}`, () => syncActivity(projectId, source));
    if (result) {
      applyProject(result.project);
      setNotice(
        result.synced > 0
          ? `Synced ${result.synced} new activity items.`
          : "No new activity found."
      );
    }
  }

  async function onLogWork(event: React.FormEvent) {
    event.preventDefault();
    if (!manual.person || !manual.title.trim()) {
      setError("Choose a person and describe the work.");
      return;
    }
    const result = await run("manual", () =>
      logContribution({
        projectId,
        person: manual.person,
        type: "manual",
        title: `[${manual.kind.replace("_", " ")}] ${manual.title.trim()}`,
        hours: manual.hours ? Number(manual.hours) : undefined,
      })
    );
    if (result) {
      applyProject(result.project);
      setManual((m) => ({ ...m, title: "", hours: "" }));
      setNotice("Work logged.");
    }
  }

  async function onContinueFromSplit(split: ScoredSplit, mode: ScoreMode) {
    const result = await run("continue", () =>
      saveSplit(
        projectId,
        split.people.map((person) => ({
          person: person.person,
          finalPct: shareFor(person, mode),
          status: "proposed",
        }))
      )
    );
    if (!result) return;

    applyProject(result.project);
    const saved = result.project.decisions;
    setDecisions(
      saved.length > 0
        ? saved.map((d) => ({
            person: d.person,
            pct: d.finalPct,
            note: d.overrideNote ?? "",
            status: d.status === "paid" ? "approved" : (d.status as DecisionRow["status"]),
            locked: false,
          }))
        : split.people.map((person) => ({
            person: person.person,
            pct: shareFor(person, mode),
            note: "",
            status: "proposed" as const,
            locked: false,
          }))
    );
    setStep(2);
    setNotice(`Reviewing the ${mode} split. Edit any share before approving.`);
  }

  function updatePct(index: number, value: string) {
    setDecisions((prev) => {
      const values = prev.map((d) => d.pct);
      const locked = prev.map((d) => d.locked);
      const next = redistribute(values, index, Number(value), locked);
      return prev.map((d, i) => ({
        ...d,
        pct: next[i],
        // A human-edited share is pinned; later edits rescale the rest around it.
        locked: i === index ? true : d.locked,
      }));
    });
  }

  function unlockPct(index: number) {
    setDecisions((prev) =>
      prev.map((d, i) => (i === index ? { ...d, locked: false } : d))
    );
  }

  function setStatus(index: number, status: DecisionRow["status"]) {
    setDecisions((prev) =>
      prev.map((d, i) => (i === index ? { ...d, status } : d))
    );
  }

  async function onSaveDraft() {
    const result = await run("save", () =>
      saveSplit(
        projectId,
        decisions.map((d) => ({
          person: d.person,
          finalPct: d.pct,
          overrideNote: d.note || undefined,
          status: d.status === "proposed" ? undefined : d.status,
        }))
      )
    );
    if (result) {
      applyProject(result.project);
      setNotice("Review saved.");
    }
  }

  async function onApproveAll() {
    const disputed = decisions.filter((d) => d.status === "disputed");
    if (disputed.length > 0) {
      setError(
        `Resolve disputed members first: ${disputed.map((d) => d.person).join(", ")}.`
      );
      return;
    }
    const result = await run("approve", () =>
      saveSplit(
        projectId,
        decisions.map((d) => ({
          person: d.person,
          finalPct: d.pct,
          overrideNote: d.note || undefined,
          status: "approved",
        }))
      )
    );
    if (result) {
      applyProject(result.project);
      setDecisions((prev) => prev.map((d) => ({ ...d, status: "approved" })));
      setStep(3);
      setNotice("Split approved. Ready to pay out.");
    }
  }

  async function onPayout() {
    const result = await run("payout", () => sendPayout(projectId));
    if (result) {
      applyProject(result.project);
      setPayout({
        batchId: result.batchId,
        simulated: result.simulated,
        message: result.message,
      });
      setNotice(result.message);
    }
  }

  if (loading) {
    return (
      <PageShell>
        <div className="flex items-center gap-2 text-slate-500">
          <Spinner /> Loading project…
        </div>
      </PageShell>
    );
  }

  if (error && !project) {
    return (
      <PageShell>
        <Alert tone="error" title="Could not load project">
          {error}
        </Alert>
        <Link href="/" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          ← Back to projects
        </Link>
      </PageShell>
    );
  }

  if (!project) return null;

  const totalAmount = project.totalAmount;

  return (
    <PageShell>
      {/* Header */}
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
          <Link href="/" className="hover:text-blue-600">
            Projects
          </Link>
          <span>/</span>
          <span className="text-slate-700">{project.name}</span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {project.name}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {money(totalAmount)} lump sum · {project.members.length} members ·{" "}
              <span className="capitalize">{project.philosophy}</span> philosophy
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[project.status] ?? "slate"}>
              {project.status.replace("_", " ")}
            </Badge>
            <Link href={`/dashboard/${project.id}`}>
              <Button variant="outline" size="sm">
                Dashboard
              </Button>
            </Link>
            {project.status === "paid" && (
              <Link href={`/receipt/${project.id}`}>
                <Button size="sm">View receipt</Button>
              </Link>
            )}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Stepper steps={STEPS} current={step} />
        </div>
        {project.status === "draft" && (
          <Alert tone="warning" title="Charter not confirmed" >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>All members must confirm the charter before scoring.</span>
              <Button size="sm" onClick={onConfirmCharter} disabled={busy === "charter"}>
                {busy === "charter" ? <Spinner /> : "Confirm charter"}
              </Button>
            </div>
          </Alert>
        )}
      </div>

      {notice && (
        <div className="mb-4">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}
      {error && project && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      {/* Members strip */}
      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-center gap-3 py-3">
          {project.members.map((m) => (
            <div key={m.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
              <Avatar name={m.name} className="h-7 w-7 text-[10px]" />
              <div className="text-xs">
                <p className="font-medium text-slate-800">{m.name}</p>
                <p className="text-slate-500">
                  {m.role === "lead" ? "Lead" : "Member"} ·{" "}
                  {m.confirmed ? "confirmed" : "pending"}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Step 0: Contributions */}
      {step === 0 && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Capture contributions</CardTitle>
                <p className="mt-0.5 text-sm text-slate-500">
                  Sync GitHub + Trello, then log the quiet work automation misses.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => onSync("github")} disabled={busy !== null}>
                  {busy === "sync-github" ? <Spinner /> : "Sync GitHub"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => onSync("trello")} disabled={busy !== null}>
                  {busy === "sync-trello" ? <Spinner /> : "Sync Trello"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onSync("both")} disabled={busy !== null}>
                  Sync both
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {contributionsByPerson.map(({ person, items }) => (
                  <div key={person}>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar name={person} className="h-7 w-7 text-[10px]" />
                        <span className="text-sm font-semibold text-slate-800">{person}</span>
                      </div>
                      <span className="text-xs text-slate-500">
                        {items.length} item{items.length === 1 ? "" : "s"} ·{" "}
                        {items.reduce((s, c) => s + (c.hours ?? 0), 0)}h logged
                      </span>
                    </div>
                    {items.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-sm text-slate-400">
                        No activity yet.
                      </p>
                    ) : (
                      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                        {items.map((c) => (
                          <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                            <Badge tone={TYPE_TONE[c.type]}>{TYPE_LABEL[c.type]}</Badge>
                            <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                              {c.title}
                            </span>
                            {c.hours != null && (
                              <span className="text-xs text-slate-500">{c.hours}h</span>
                            )}
                            <span className="text-xs text-slate-400">{formatDate(c.timestamp)}</span>
                            {c.evidenceUrl && (
                              <a
                                href={c.evidenceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-medium text-blue-600 hover:underline"
                              >
                                Evidence ↗
                              </a>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Log quiet work</CardTitle>
              <p className="mt-0.5 text-sm text-slate-500">
                Client calls, reviews, admin and unblocking are invisible to GitHub.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={onLogWork} className="grid gap-3 sm:grid-cols-12">
                <div className="sm:col-span-3">
                  <Label>Person</Label>
                  <Select
                    value={manual.person}
                    onChange={(e) => setManual({ ...manual, person: e.target.value })}
                    required
                  >
                    <option value="">Choose…</option>
                    {project.members.map((m) => (
                      <option key={m.id} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="sm:col-span-3">
                  <Label>Kind</Label>
                  <Select
                    value={manual.kind}
                    onChange={(e) => setManual({ ...manual, kind: e.target.value })}
                  >
                    <option value="work">Work</option>
                    <option value="review">Review</option>
                    <option value="admin">Admin</option>
                    <option value="client_call">Client call</option>
                    <option value="unblocking">Unblocking</option>
                  </Select>
                </div>
                <div className="sm:col-span-4">
                  <Label>Description</Label>
                  <Input
                    value={manual.title}
                    onChange={(e) => setManual({ ...manual, title: e.target.value })}
                    placeholder="e.g. Client call about timeline"
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Hours</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={manual.hours}
                    onChange={(e) => setManual({ ...manual, hours: e.target.value })}
                    placeholder="2"
                  />
                </div>
                <div className="sm:col-span-12">
                  <Button type="submit" disabled={busy === "manual"}>
                    {busy === "manual" ? <Spinner /> : "Log work"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button size="lg" onClick={() => setStep(1)}>
              Next: AI scoring →
            </Button>
          </div>
        </div>
      )}

      {/* Step 1: AI scoring */}
      {step === 1 && (
        <ExplainableSplit
          project={project}
          split={project.scoredSplit ?? null}
          onProjectUpdate={applyProject}
          onBack={() => setStep(0)}
          onContinue={onContinueFromSplit}
          continuing={busy === "continue"}
        />
      )}

      {/* Step 2: Review */}
      {step === 2 && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Review the split</CardTitle>
              <p className="mt-0.5 text-sm text-slate-500">
                AI proposes, you decide. Edited shares are pinned — the rest rescale
                to keep the total at exactly 100%.
              </p>
            </CardHeader>
            <CardContent>
              {decisions.length === 0 ? (
                <Alert tone="warning">
                  Score with AI first to generate a proposal.
                </Alert>
              ) : (
                <div className="space-y-4">
                  {decisions.map((d, index) => {
                    const proposal = project.proposals.find((p) => p.person === d.person);
                    return (
                      <div key={d.person} className="rounded-xl border border-slate-200 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={d.person} />
                            <div>
                              <p className="font-semibold text-slate-900">{d.person}</p>
                              <p className="text-xs text-slate-500">
                                AI proposed {proposal ? `${proposal.percentage}%` : "—"} ·{" "}
                                {money(amountFor(d.pct, totalAmount))}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-24">
                              <div className="relative">
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.5"
                                  value={d.pct}
                                  onChange={(e) => updatePct(index, e.target.value)}
                                  className="pr-7 text-right font-semibold"
                                />
                                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                                  %
                                </span>
                              </div>
                              {d.locked && (
                                <button
                                  type="button"
                                  onClick={() => unlockPct(index)}
                                  className="mt-1 inline-flex w-full items-center justify-center gap-1 text-[10px] font-medium text-slate-400 hover:text-blue-600"
                                  title="Pinned — others rescale around this share. Click to unpin."
                                >
                                  🔒 pinned
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {proposal && (
                          <p className="mt-2 text-sm text-slate-600">{proposal.reason}</p>
                        )}

                        <div className="mt-3 grid gap-3 sm:grid-cols-12">
                          <div className="sm:col-span-8">
                            <Label>Override / dispute note (optional)</Label>
                            <Input
                              value={d.note}
                              onChange={(e) =>
                                setDecisions((prev) =>
                                  prev.map((row, i) =>
                                    i === index ? { ...row, note: e.target.value } : row
                                  )
                                )
                              }
                              placeholder="e.g. Maya handled more client comms than logged"
                            />
                          </div>
                          <div className="sm:col-span-4">
                            <Label>Status</Label>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant={d.status === "approved" ? "primary" : "outline"}
                                onClick={() => setStatus(index, "approved")}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant={d.status === "disputed" ? "danger" : "outline"}
                                onClick={() => setStatus(index, "disputed")}
                              >
                                Dispute
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 text-sm">
                    <span className="text-slate-600">Total</span>
                    <span
                      className={
                        Math.abs(totalDecisionPct - 100) < 0.5
                          ? "font-semibold text-emerald-600"
                          : "font-semibold text-rose-600"
                      }
                    >
                      {Math.round(totalDecisionPct * 100) / 100}% ·{" "}
                      {money((totalDecisionPct / 100) * totalAmount)}
                    </span>
                  </div>

                  <div className="flex flex-wrap justify-between gap-3 pt-2">
                    <Button variant="outline" onClick={onSaveDraft} disabled={busy !== null}>
                      {busy === "save" ? <Spinner /> : "Save review"}
                    </Button>
                    <Button size="lg" onClick={onApproveAll} disabled={busy !== null}>
                      {busy === "approve" ? (
                        <>
                          <Spinner /> Approving…
                        </>
                      ) : (
                        "Approve all & continue →"
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <WhatIfCard
            project={project}
            mode={whatIf}
            onMode={setWhatIf}
            rows={whatIfRows}
          />

          <div className="flex justify-start">
            <Button variant="outline" onClick={() => setStep(1)}>
              ← AI scoring
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Payout */}
      {step === 3 && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>PayPal payout</CardTitle>
              <p className="mt-0.5 text-sm text-slate-500">
                One click sends each approved member their share via PayPal sandbox.
              </p>
            </CardHeader>
            <CardContent>
              {project.decisions.length === 0 ? (
                <Alert tone="warning">Approve a split before paying out.</Alert>
              ) : (
                <>
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Recipient</th>
                          <th className="px-3 py-2">Share</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {project.decisions
                          .filter((d) => d.status !== "disputed")
                          .map((d) => {
                            const member = project.members.find((m) => m.name === d.person);
                            return (
                              <tr key={d.id}>
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <Avatar name={d.person} className="h-7 w-7 text-[10px]" />
                                    <div>
                                      <p className="font-medium text-slate-800">{d.person}</p>
                                      <p className="text-xs text-slate-500">
                                        {member?.email || "no email"}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-slate-600">{d.finalPct}%</td>
                                <td className="px-3 py-2 text-right font-semibold text-slate-900">
                                  {money(amountFor(d.finalPct, totalAmount))}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                      <tfoot className="bg-slate-50">
                        <tr>
                          <td className="px-3 py-2 font-medium text-slate-700" colSpan={2}>
                            Total
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-slate-900">
                            {money(
                              project.decisions
                                .filter((d) => d.status !== "disputed")
                                .reduce(
                                  (s, d) => s + amountFor(d.finalPct, totalAmount),
                                  0
                                )
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div className="mt-4">
                    {payout || project.status === "paid" ? (
                      <div className="space-y-3">
                        <Alert tone="success" title="Payout complete">
                          {payout?.message ??
                            "Sandbox payout already sent. No live money moved."}
                        </Alert>
                        <div className="grid gap-2 rounded-lg border border-slate-200 p-4 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Batch ID</span>
                            <span className="font-mono text-slate-800">
                              {payout?.batchId ?? project.payouts[0]?.paypalBatchId ?? "—"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Mode</span>
                            <Badge tone={payout?.simulated === false ? "emerald" : "amber"}>
                              {payout?.simulated === false ? "PayPal sandbox" : "Simulated sandbox"}
                            </Badge>
                          </div>
                        </div>
                        <div className="overflow-hidden rounded-lg border border-slate-200">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                              <tr>
                                <th className="px-3 py-2">Recipient</th>
                                <th className="px-3 py-2">Amount</th>
                                <th className="px-3 py-2">Status</th>
                                <th className="px-3 py-2">Transaction</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {project.payouts.map((p) => (
                                <tr key={p.id}>
                                  <td className="px-3 py-2 font-medium text-slate-800">
                                    {p.person}
                                  </td>
                                  <td className="px-3 py-2">{money(p.amount)}</td>
                                  <td className="px-3 py-2">
                                    <Badge tone={p.status === "completed" ? "emerald" : "amber"}>
                                      {p.status}
                                    </Badge>
                                  </td>
                                  <td className="px-3 py-2 font-mono text-xs text-slate-500">
                                    {p.paypalTxnId}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link href={`/receipt/${project.id}`}>
                            <Button>Printable receipt</Button>
                          </Link>
                          <Link href={`/dashboard/${project.id}`}>
                            <Button variant="outline">View dashboard</Button>
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <Button size="lg" className="w-full" onClick={onPayout} disabled={busy !== null}>
                        {busy === "payout" ? (
                          <>
                            <Spinner /> Sending payouts…
                          </>
                        ) : (
                          <>Send payouts via PayPal — {money(totalAmount)}</>
                        )}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-start">
            <Button variant="outline" onClick={() => setStep(2)}>
              ← Back to review
            </Button>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function WhatIfCard({
  project,
  mode,
  onMode,
  rows,
}: {
  project: Project;
  mode: "merit" | "equal" | "hours";
  onMode: (mode: "merit" | "equal" | "hours") => void;
  rows: Array<{ person: string; pct: number; amount: number }>;
}) {
  const options: Array<{ value: "merit" | "equal" | "hours"; label: string }> = [
    { value: "equal", label: "Equal" },
    { value: "merit", label: "Merit (AI)" },
    { value: "hours", label: "Hours" },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>What-if preview</CardTitle>
        <p className="mt-0.5 text-sm text-slate-500">
          Recompute live — preview only, nothing is saved until you approve.
        </p>
      </CardHeader>
      <CardContent>
        <div className="mb-4 inline-flex rounded-lg border border-slate-200 p-0.5">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onMode(opt.value)}
              className={
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
                (mode === opt.value
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100")
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div key={row.person}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">{row.person}</span>
                <span className="text-slate-600">
                  {row.pct}% · {money(row.amount)}
                </span>
              </div>
              <Progress
                value={row.pct}
                tone={index % 2 === 0 ? "blue" : "emerald"}
              />
            </div>
          ))}
          {rows.length === 0 && (
            <p className="text-sm text-slate-500">Score with AI to preview splits.</p>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Total payout {money(project.totalAmount)}.
        </p>
      </CardContent>
    </Card>
  );
}
