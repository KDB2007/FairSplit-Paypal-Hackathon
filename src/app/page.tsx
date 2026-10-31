"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProjectSummary } from "@/lib/types";
import { createProject, fetchProjects } from "@/lib/client";
import { formatDate, money } from "@/lib/utils";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  PageShell,
  Select,
  Spinner,
} from "@/components/ui";

interface MemberRow {
  name: string;
  email: string;
  role: "lead" | "member";
  confirmed: boolean;
}

const DEMO_TEAM: MemberRow[] = [
  { name: "Priya", email: "priya@example.com", role: "lead", confirmed: true },
  { name: "Leo", email: "leo@example.com", role: "member", confirmed: true },
  { name: "Maya", email: "maya@example.com", role: "member", confirmed: true },
];

const STATUS_TONE: Record<string, "slate" | "blue" | "emerald" | "amber" | "violet"> = {
  draft: "slate",
  charter_confirmed: "blue",
  scored: "violet",
  approved: "amber",
  paid: "emerald",
};

export default function HomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  const [name, setName] = useState("Client Website");
  const [amount, setAmount] = useState("3000");
  const [philosophy, setPhilosophy] = useState("merit");
  const [members, setMembers] = useState<MemberRow[]>([{ ...DEMO_TEAM[0] }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setProjects(await fetchProjects());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function updateMember(index: number, patch: Partial<MemberRow>) {
    setMembers((prev) =>
      prev.map((m, i) => (i === index ? { ...m, ...patch } : m))
    );
  }

  function addMember() {
    setMembers((prev) => [
      ...prev,
      { name: "", email: "", role: "member", confirmed: true },
    ]);
  }

  function removeMember(index: number) {
    setMembers((prev) => prev.filter((_, i) => i !== index));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const cleanMembers = members.filter((m) => m.name.trim());
    if (cleanMembers.length < 1) {
      setError("Add at least one member with a name.");
      return;
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a total amount greater than zero.");
      return;
    }
    setSubmitting(true);
    try {
      const project = await createProject({
        name: name.trim() || "Untitled project",
        totalAmount: value,
        philosophy,
        members: cleanMembers.map((m, i) => ({
          name: m.name.trim(),
          email: m.email.trim(),
          role: i === 0 ? "lead" : m.role,
          confirmed: m.confirmed,
        })),
      });
      router.push(`/project/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create project");
      setSubmitting(false);
    }
  }

  return (
    <PageShell>
      <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white shadow-sm">
            FS
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              FairSplit
            </h1>
            <p className="text-sm text-slate-500">
              Fair, explainable team payouts — approved by humans, paid via PayPal.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="emerald">Demo-safe</Badge>
          <Badge tone="blue">PayPal sandbox</Badge>
        </div>
      </header>

      <section className="mb-10 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 px-6 py-10 text-white shadow-lg sm:px-10">
        <div className="max-w-2xl">
          <p className="mb-2 text-sm font-medium uppercase tracking-wide text-blue-200">
            Who gets how much?
          </p>
          <h2 className="text-3xl font-bold leading-tight sm:text-4xl">
            Split a lump sum by real contribution — not just who committed most.
          </h2>
          <p className="mt-4 text-blue-100">
            FairSplit captures GitHub and Trello activity plus quiet work
            (reviews, unblocking, client calls), scores it with AI, and shows a
            plain-language reason for every percentage. You approve, then pay.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              size="lg"
              className="bg-white text-slate-900 hover:bg-blue-50"
              onClick={() => router.push("/project/demo")}
            >
              Open the demo project
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20"
              onClick={() =>
                document.getElementById("new-project")?.scrollIntoView({ behavior: "smooth" })
              }
            >
              Create a project
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Card id="new-project">
            <CardHeader>
              <CardTitle>New project</CardTitle>
              <p className="mt-0.5 text-sm text-slate-500">
                Set the payout, the team, and the fairness philosophy.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="project-name">Project name</Label>
                    <Input
                      id="project-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Client Website"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="project-amount">Total amount (USD)</Label>
                    <Input
                      id="project-amount"
                      type="number"
                      min="1"
                      step="1"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="philosophy">Split philosophy</Label>
                  <Select
                    id="philosophy"
                    value={philosophy}
                    onChange={(e) => setPhilosophy(e.target.value)}
                  >
                    <option value="equal">Equal — 1/n each</option>
                    <option value="merit">Merit — AI-scored contribution</option>
                    <option value="hybrid">Hybrid — AI plus logged hours</option>
                  </Select>
                  <p className="mt-1 text-xs text-slate-500">
                    AI always proposes; you can override every number before paying.
                  </p>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <Label className="mb-0">Members</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setMembers(DEMO_TEAM.map((m) => ({ ...m })))}
                      >
                        Use demo team
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={addMember}>
                        + Add member
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {members.map((member, index) => (
                      <div
                        key={index}
                        className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50/50 p-2 sm:grid-cols-12"
                      >
                        <Input
                          className="sm:col-span-4"
                          placeholder="Name"
                          value={member.name}
                          onChange={(e) => updateMember(index, { name: e.target.value })}
                          required={index === 0}
                        />
                        <Input
                          className="sm:col-span-4"
                          type="email"
                          placeholder="Email (for PayPal)"
                          value={member.email}
                          onChange={(e) => updateMember(index, { email: e.target.value })}
                        />
                        <Select
                          className="sm:col-span-2"
                          value={index === 0 ? "lead" : member.role}
                          disabled={index === 0}
                          onChange={(e) =>
                            updateMember(index, {
                              role: e.target.value as "lead" | "member",
                            })
                          }
                        >
                          <option value="lead">Lead</option>
                          <option value="member">Member</option>
                        </Select>
                        <div className="flex items-center gap-2 sm:col-span-2">
                          <label className="flex flex-1 items-center gap-1.5 text-xs text-slate-600">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300"
                              checked={member.confirmed}
                              onChange={(e) =>
                                updateMember(index, { confirmed: e.target.checked })
                              }
                            />
                            Confirmed
                          </label>
                          {members.length > 1 && (
                            <button
                              type="button"
                              aria-label="Remove member"
                              className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              onClick={() => removeMember(index)}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {error && <Alert tone="error">{error}</Alert>}

                <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Spinner /> Creating charter…
                    </>
                  ) : (
                    "Create project & confirm charter"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Your projects</CardTitle>
              <p className="mt-0.5 text-sm text-slate-500">
                In-memory demo store — resets when the server restarts.
              </p>
            </CardHeader>
            <CardContent>
              {loadingProjects ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Spinner /> Loading…
                </div>
              ) : projects.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No projects yet. Create one to get started.
                </p>
              ) : (
                <ul className="space-y-2">
                  {projects.map((project) => (
                    <li key={project.id}>
                      <Link
                        href={`/project/${project.id}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 transition-colors hover:border-blue-300 hover:bg-blue-50/50"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {project.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {project.memberCount} members · {money(project.totalAmount)} ·{" "}
                            {formatDate(project.createdAt)}
                          </p>
                        </div>
                        <Badge tone={STATUS_TONE[project.status] ?? "slate"}>
                          {project.status.replace("_", " ")}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>How the demo flows</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm text-slate-600">
                <li>1. Open the demo project (3 members, $3,000).</li>
                <li>2. Sync GitHub + Trello, log a client call.</li>
                <li>3. Score with AI — every % gets a reason and evidence.</li>
                <li>4. Adjust a percentage; others rescale to 100%.</li>
                <li>5. Send PayPal sandbox payouts and print the receipt.</li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
