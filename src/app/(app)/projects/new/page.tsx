"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createProject } from "@/lib/client";
import {
  Alert,
  Button,
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
  /** Self-reported; neither is required, and they're independent of each other. */
  githubLogin: string;
  trelloUsername: string;
}

const SAMPLE_TEAM: MemberRow[] = [
  { name: "Priya", email: "priya@example.com", role: "lead", confirmed: true, githubLogin: "", trelloUsername: "" },
  { name: "Leo", email: "leo@example.com", role: "member", confirmed: true, githubLogin: "", trelloUsername: "" },
  { name: "Maya", email: "maya@example.com", role: "member", confirmed: true, githubLogin: "", trelloUsername: "" },
];

const EMPTY_MEMBER: MemberRow = {
  name: "",
  email: "",
  role: "lead",
  confirmed: true,
  githubLogin: "",
  trelloUsername: "",
};

export default function NewProjectPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [philosophy, setPhilosophy] = useState("merit");
  const [members, setMembers] = useState<MemberRow[]>([{ ...EMPTY_MEMBER }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateMember(index: number, patch: Partial<MemberRow>) {
    setMembers((prev) =>
      prev.map((member, i) => (i === index ? { ...member, ...patch } : member))
    );
  }

  function addMember() {
    setMembers((prev) => [
      ...prev,
      {
        name: "",
        email: "",
        role: "member",
        confirmed: true,
        githubLogin: "",
        trelloUsername: "",
      },
    ]);
  }

  function removeMember(index: number) {
    setMembers((prev) => prev.filter((_, i) => i !== index));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const cleanMembers = members.filter((member) => member.name.trim());
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
        members: cleanMembers.map((member, index) => ({
          name: member.name.trim(),
          email: member.email.trim(),
          role: index === 0 ? "lead" : member.role,
          confirmed: member.confirmed,
          githubLogin: member.githubLogin.trim() || undefined,
          trelloUsername: member.trelloUsername.trim() || undefined,
        })),
      });
      router.push(`/project/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create project");
      setSubmitting(false);
    }
  }

  return (
    <PageShell className="max-w-2xl">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Dashboard
      </Link>

      <div className="mt-4">
        <h1 className="text-2xl font-semibold tracking-tight">New project</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Set the payout, the team, and the fairness philosophy.
        </p>
      </div>

      <form onSubmit={onSubmit} className="mt-8 space-y-8">
        <section className="space-y-5">
          <h2 className="text-sm font-medium">Basics</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="project-name">Project name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
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
                onChange={(event) => setAmount(event.target.value)}
                placeholder="3000"
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="philosophy">Split philosophy</Label>
            <Select
              id="philosophy"
              value={philosophy}
              onChange={(event) => setPhilosophy(event.target.value)}
            >
              <option value="equal">Equal — 1/n each</option>
              <option value="merit">Merit — AI-scored contribution</option>
              <option value="hybrid">Hybrid — AI plus logged hours</option>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              AI always proposes; you can override every number before paying.
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Team</h2>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setMembers(SAMPLE_TEAM.map((member) => ({ ...member })))}
              >
                Use sample team
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={addMember}>
                + Add member
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            GitHub and Trello usernames are optional. Adding them lets synced
            activity attribute automatically instead of being mapped by hand later.
          </p>

          <div className="space-y-2">
            {members.map((member, index) => (
              <div
                key={index}
                className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-muted/40 p-2 sm:grid-cols-12"
              >
                <Input
                  className="sm:col-span-4"
                  placeholder="Name"
                  value={member.name}
                  onChange={(event) =>
                    updateMember(index, { name: event.target.value })
                  }
                  required={index === 0}
                />
                <Input
                  className="sm:col-span-4"
                  type="email"
                  placeholder="Email (for PayPal)"
                  value={member.email}
                  onChange={(event) =>
                    updateMember(index, { email: event.target.value })
                  }
                />
                <Select
                  className="sm:col-span-2"
                  value={index === 0 ? "lead" : member.role}
                  disabled={index === 0}
                  onChange={(event) =>
                    updateMember(index, {
                      role: event.target.value as "lead" | "member",
                    })
                  }
                >
                  <option value="lead">Lead</option>
                  <option value="member">Member</option>
                </Select>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <label className="flex flex-1 items-center gap-1.5 text-xs text-foreground/80">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border"
                      checked={member.confirmed}
                      onChange={(event) =>
                        updateMember(index, { confirmed: event.target.checked })
                      }
                    />
                    Confirmed
                  </label>
                  {members.length > 1 && (
                    <button
                      type="button"
                      aria-label="Remove member"
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => removeMember(index)}
                    >
                      ✕
                    </button>
                  )}
                </div>
                <Input
                  className="sm:col-span-6"
                  placeholder="GitHub username (optional)"
                  value={member.githubLogin}
                  onChange={(event) =>
                    updateMember(index, { githubLogin: event.target.value })
                  }
                />
                <Input
                  className="sm:col-span-6"
                  placeholder="Trello username (optional)"
                  value={member.trelloUsername}
                  onChange={(event) =>
                    updateMember(index, { trelloUsername: event.target.value })
                  }
                />
              </div>
            ))}
          </div>
        </section>

        {error && <Alert tone="error">{error}</Alert>}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-6">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push("/projects")}
          >
            Cancel
          </Button>
          <Button type="submit" size="lg" disabled={submitting}>
            {submitting ? (
              <>
                <Spinner /> Creating charter…
              </>
            ) : (
              "Create project & confirm charter"
            )}
          </Button>
        </div>
      </form>
    </PageShell>
  );
}
