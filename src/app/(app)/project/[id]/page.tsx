"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { LayoutDashboard, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import type { Project, ScoreMode, ScoredSplit } from "@/lib/types";
import { fetchProject, logContribution, saveSplit, sendPayout, syncActivity } from "@/lib/client";
import { money } from "@/lib/utils";
import { CharterPanel } from "@/components/charter-panel";
import { ExplainableSplit } from "@/components/explain/explainable-split";
import { shareFor } from "@/components/explain/split-visuals";
import { ContributionsStep, type ManualWork } from "@/components/flow/contributions-step";
import { ReviewStep, type DecisionRow } from "@/components/flow/review-step";
import { PayoutStep } from "@/components/flow/payout-step";
import { useTasks } from "@/components/app-shell/tasks";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, Badge, Button, PageShell, Stepper } from "@/components/ui";

const STEPS = ["Contributions", "AI scoring", "Review", "PayPal payout"];

const STATUS_TONE: Record<string, "slate" | "blue" | "emerald" | "amber" | "violet"> = {
  draft: "slate",
  charter_confirmed: "blue",
  scored: "violet",
  approved: "amber",
  paid: "emerald",
};

function rowsFrom(project: Project): DecisionRow[] {
  return project.decisions.length
    ? project.decisions.map((d) => ({
        person: d.person,
        pct: d.finalPct,
        note: d.overrideNote ?? "",
        status: d.status === "paid" ? "approved" : (d.status as DecisionRow["status"]),
        locked: false,
      }))
    : project.proposals.map((p) => ({ person: p.person, pct: p.percentage, note: "", status: "proposed", locked: false }));
}

export default function ProjectPage() {
  const params = useParams();
  const projectId = String(params?.id ?? "");
  const reduce = useReducedMotion();
  const { track } = useTasks();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [payout, setPayout] = useState<{ batchId: string; simulated: boolean; message: string } | null>(null);
  const [rowsSignature, setRowsSignature] = useState("");

  useEffect(() => {
    let active = true;
    fetchProject(projectId)
      .then((data) => {
        if (!active) return;
        setProject(data);
        if (data.status === "paid" || data.status === "approved") setStep(3);
        else if (data.scoredSplit) setStep(1);
        else if (data.decisions.length > 0 || data.proposals.length > 0) setStep(2);
      })
      .catch((err) => active && setLoadError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [projectId]);

  // Keep the editable review rows in step with the saved decisions
  // (adjusted during render rather than in an effect, so there's no extra pass).
  const signature = project ? `${project.id}:${project.proposals.length}:${project.decisions.length}` : "";
  if (project && rowsSignature !== signature) {
    setRowsSignature(signature);
    setDecisions(rowsFrom(project));
  }

  const applyProject = useCallback((next: Project) => setProject(next), []);

  async function run<T>(key: string, action: () => Promise<T>): Promise<T | null> {
    setBusy(key);
    try {
      return await action();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  function onCharterUpdate(next: Project) {
    applyProject(next);
    // A new charter version discards scoring, so go back to the start.
    if (!next.scoredSplit && next.decisions.length === 0 && step > 0) setStep(0);
    const signed = next.members.filter((m) => m.confirmed).length;
    if (signed === next.members.length) toast.success("Everyone signed — AI scoring is unlocked.");
    else toast(`Charter v${next.charterVersion}: ${signed}/${next.members.length} signed.`);
  }

  async function onSync(source: "github" | "trello" | "both") {
    const label = source === "both" ? "GitHub + Trello" : source === "github" ? "GitHub" : "Trello";
    const result = await run(`sync-${source}`, () => track(`Syncing ${label}`, syncActivity(projectId, source)));
    if (!result) return;
    applyProject(result.project);
    const { report } = result;
    const summary = [
      report.mode === "demo" ? "Sample activity (demo mode)" : null,
      `${report.added} added, ${report.updated} updated`,
      report.unmatched.length > 0 ? `${report.unmatched.length} to map in Sources` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    toast.success(`Synced ${label}`, { description: summary });
    report.errors.forEach((e) => toast.error(e));
  }

  async function onLogWork(work: ManualWork): Promise<boolean> {
    if (!work.person || !work.title.trim()) {
      toast.error("Choose a person and describe the work.");
      return false;
    }
    const result = await run("manual", () =>
      logContribution({
        projectId,
        person: work.person,
        type: "manual",
        title: `[${work.kind.replace("_", " ")}] ${work.title.trim()}`,
        hours: work.hours ? Number(work.hours) : undefined,
      })
    );
    if (!result) return false;
    applyProject(result.project);
    toast.success("Work logged", { description: `${work.person}: ${work.title.trim()}` });
    return true;
  }

  async function onContinueFromSplit(split: ScoredSplit, mode: ScoreMode) {
    const result = await run("continue", () =>
      saveSplit(
        projectId,
        split.people.map((person) => ({ person: person.person, finalPct: shareFor(person, mode), status: "proposed" }))
      )
    );
    if (!result) return;
    applyProject(result.project);
    setDecisions(rowsFrom(result.project));
    setStep(2);
    toast(`Reviewing the ${mode} split`, { description: "Edit any share before approving." });
  }

  const decisionPayload = (status?: "approved") =>
    decisions.map((d) => ({
      person: d.person,
      finalPct: d.pct,
      overrideNote: d.note || undefined,
      status: status ?? (d.status === "proposed" ? undefined : d.status),
    }));

  async function onSaveDraft() {
    const result = await run("save", () => saveSplit(projectId, decisionPayload()));
    if (result) {
      applyProject(result.project);
      toast.success("Review saved");
    }
  }

  async function onApproveAll() {
    const disputed = decisions.filter((d) => d.status === "disputed");
    if (disputed.length > 0) {
      toast.error(`Resolve disputed shares first: ${disputed.map((d) => d.person).join(", ")}.`);
      return;
    }
    const result = await run("approve", () => saveSplit(projectId, decisionPayload("approved")));
    if (result) {
      applyProject(result.project);
      setDecisions((prev) => prev.map((d) => ({ ...d, status: "approved" })));
      setStep(3);
      toast.success("Split approved", { description: "Ready to pay out." });
    }
  }

  async function onPay(): Promise<boolean> {
    const result = await run("payout", () => track("Sending PayPal batch", sendPayout(projectId)));
    if (!result) return false;
    setPayout({ batchId: result.batchId, simulated: result.simulated, message: result.message });
    applyProject(result.project);
    return true;
  }

  if (loading) {
    return (
      <PageShell>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-80" />
        <Skeleton className="mt-6 h-6 w-[28rem] max-w-full" />
        <Skeleton className="mt-6 h-48 w-full rounded-xl" />
        <Skeleton className="mt-6 h-72 w-full rounded-xl" />
      </PageShell>
    );
  }

  if (loadError || !project) {
    return (
      <PageShell>
        <Alert tone="error" title="Could not load project">
          {loadError ?? "Project not found."}
        </Alert>
        <Link href="/projects" className="mt-4 inline-block text-sm text-primary hover:underline">
          ← Back to projects
        </Link>
      </PageShell>
    );
  }

  const scoringUnlocked = Boolean(project.poolConfig && project.members.every((m) => m.confirmed));
  const staleScore = Boolean(
    project.scoredSplit && project.lastSync && project.lastSync.at > project.scoredSplit.generatedAt
  );

  return (
    <PageShell>
      <div className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {money(project.totalAmount)} lump sum · {project.members.length} members ·{" "}
              <span className="capitalize">{project.philosophy}</span> philosophy
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[project.status] ?? "slate"}>{project.status.replace("_", " ")}</Badge>
            <Link href={`/dashboard/${project.id}`}>
              <Button variant="outline" size="sm">
                <LayoutDashboard className="size-3.5" /> Dashboard
              </Button>
            </Link>
            {project.status === "paid" && (
              <Link href={`/receipt/${project.id}`}>
                <Button size="sm">
                  <ReceiptText className="size-3.5" /> Receipt
                </Button>
              </Link>
            )}
          </div>
        </div>
        <div className="mt-4">
          <Stepper steps={STEPS} current={step} />
        </div>
      </div>

      <CharterPanel
        key={`${project.id}:${project.charterVersion}`}
        project={project}
        onProjectUpdate={onCharterUpdate}
        onError={(message) => toast.error(message)}
      />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -6 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          {step === 0 && (
            <ContributionsStep
              project={project}
              busy={busy}
              scoringUnlocked={scoringUnlocked}
              onProjectUpdate={applyProject}
              onError={(message) => toast.error(message)}
              onSync={onSync}
              onLogWork={onLogWork}
              onNext={() => setStep(1)}
            />
          )}

          {step === 1 && (
            <div className="space-y-4">
              {staleScore && (
                <Alert tone="warning" title="New activity since scoring">
                  Activity was synced after this split was scored. Re-score to include it.
                </Alert>
              )}
              <ExplainableSplit
                project={project}
                split={project.scoredSplit ?? null}
                onProjectUpdate={applyProject}
                onBack={() => setStep(0)}
                onContinue={onContinueFromSplit}
                continuing={busy === "continue"}
              />
            </div>
          )}

          {step === 2 && (
            <ReviewStep
              project={project}
              decisions={decisions}
              setDecisions={setDecisions}
              busy={busy}
              onSave={onSaveDraft}
              onApprove={onApproveAll}
              onBack={() => setStep(1)}
            />
          )}

          {step === 3 && <PayoutStep project={project} onPay={onPay} onBack={() => setStep(2)} result={payout} />}
        </motion.div>
      </AnimatePresence>
    </PageShell>
  );
}
