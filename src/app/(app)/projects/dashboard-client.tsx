"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, X } from "lucide-react";
import type { ProjectStatus, ProjectSummary } from "@/lib/types";
import { fetchProjects } from "@/lib/client";
import { DEMO_PROJECT_ID, isDemoProject } from "@/lib/project-links";
import { cn } from "@/lib/utils";
import { Alert, PageShell } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { ProjectRows } from "@/components/dashboard/project-rows";

const primaryLink = cn(
  buttonVariants({ variant: "default" }),
  "h-9 gap-1.5 px-4"
);

/** The in-memory store can outlive a mode switch, so hide the demo row in real mode. */
function visibleProjects(projects: ProjectSummary[], demoMode: boolean) {
  return demoMode ? projects : projects.filter((project) => !isDemoProject(project.id));
}

export function DashboardClient({ demoMode }: { demoMode: boolean }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<ProjectStatus | null>(null);
  const [query, setQuery] = useState("");

  const matching = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? projects.filter((project) => project.name.toLowerCase().includes(q)) : projects;
  }, [projects, query]);

  useEffect(() => {
    let active = true;
    fetchProjects()
      .then((list) => active && setProjects(visibleProjects(list, demoMode)))
      .catch(
        (err) =>
          active &&
          setError(
            err instanceof Error ? err.message : "Failed to load projects"
          )
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [demoMode]);

  const load = useCallback(async () => {
    try {
      const list = await fetchProjects();
      setProjects(visibleProjects(list, demoMode));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    }
  }, [demoMode]);

  return (
    <PageShell className="max-w-[960px]">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <div className="flex items-center gap-4">
          {demoMode && (
            <Link
              href={`/project/${DEMO_PROJECT_ID}`}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Try the demo
            </Link>
          )}
          <Link href="/projects/new" className={primaryLink}>
            <Plus className="size-4" aria-hidden />
            New project
          </Link>
        </div>
      </header>

      {error && (
        <div className="mt-8">
          <Alert tone="error" title="Could not load projects">
            {error}
          </Alert>
        </div>
      )}

      {loading ? (
        <DashboardSkeleton />
      ) : projects.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <DashboardStats
            projects={projects}
            stage={stage}
            onStageChange={setStage}
          />

          {projects.length > 5 && (
            <div className="relative mt-12 max-w-xs">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects…"
                aria-label="Search projects by name"
                className="h-8 w-full rounded-md border border-input bg-transparent pl-8 pr-7 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          )}

          <ProjectRows
            projects={matching}
            stage={stage}
            onStageChange={setStage}
            onDeleted={load}
            emptyLabel={query ? `No projects match “${query}”.` : undefined}
          />
          {demoMode && (
            <p className="mt-12 text-xs text-muted-foreground">
              Demo data resets when the server restarts.
            </p>
          )}
        </>
      )}
    </PageShell>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-hidden>
      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-8">
        {[0, 1, 2].map((index) => (
          <div key={index}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-9 w-32" />
          </div>
        ))}
      </div>
      <div className="mt-12 space-y-3">
        <Skeleton className="h-1.5 w-full rounded-full" />
        <Skeleton className="h-3 w-64" />
      </div>
      <div className="mt-12 space-y-4">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className="flex items-center justify-between gap-4 border-b border-border/60 pb-4"
          >
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-24 flex flex-col items-center text-center">
      <p className="text-sm text-muted-foreground">No projects yet.</p>
      <Link href="/projects/new" className={cn(primaryLink, "mt-4")}>
        <Plus className="size-4" aria-hidden />
        New project
      </Link>
    </div>
  );
}
