"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, MoreHorizontal, Trash2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { ProjectStatus, ProjectSummary } from "@/lib/types";
import { deleteProject } from "@/lib/client";
import { isDemoProject, projectHref } from "@/lib/project-links";
import { cn, formatDate, money, timeAgo } from "@/lib/utils";
import { personColor } from "@/lib/person-color";
import { Avatar } from "@/components/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: "Draft",
  charter_confirmed: "Ready to score",
  scored: "Scored",
  approved: "Approved",
  paid: "Paid",
};

/** Three colours, not five: unscored, scored, paid. The text label carries the rest. */
const STATUS_DOT: Record<ProjectStatus, string> = {
  draft: "bg-muted-foreground/40",
  charter_confirmed: "bg-muted-foreground/40",
  scored: "bg-chart-1",
  approved: "bg-chart-1",
  paid: "bg-success",
};

const GROUPS: Array<{ key: string; label: string; statuses: ProjectStatus[] }> = [
  {
    key: "attention",
    label: "Needs attention",
    statuses: ["draft", "charter_confirmed", "scored", "approved"],
  },
  { key: "paid", label: "Paid", statuses: ["paid"] },
];

/**
 * Plain rows with thin dividers instead of a card per project. The whole row is
 * a link; an inset overlay keeps the delete control from nesting a button in an
 * anchor.
 */
export function ProjectRows({
  projects,
  stage,
  onStageChange,
  onDeleted,
  emptyLabel,
}: {
  projects: ProjectSummary[];
  stage: ProjectStatus | null;
  onStageChange: (stage: ProjectStatus | null) => void;
  onDeleted: () => void;
  /** Overrides the "no projects at this stage" message, e.g. for a search with no matches. */
  emptyLabel?: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const filtered = stage
    ? projects.filter((project) => project.status === stage)
    : projects;

  const groups = GROUPS.map((group) => ({
    ...group,
    projects: filtered.filter((project) => group.statuses.includes(project.status)),
  })).filter((group) => group.projects.length > 0);

  // Selections can point at rows a filter has since hidden; only act on what's visible.
  const visibleIds = new Set(filtered.map((project) => project.id));
  const selectedVisible = Array.from(selected).filter((id) => visibleIds.has(id));

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onConfirmBulkDelete() {
    setBulkDeleting(true);
    setBulkError(null);
    const failures: string[] = [];
    for (const id of selectedVisible) {
      try {
        await deleteProject(id);
      } catch {
        failures.push(id);
      }
    }
    setBulkDeleting(false);
    if (failures.length > 0) {
      setSelected(new Set(failures));
      setBulkError(`${failures.length} project${failures.length === 1 ? "" : "s"} could not be deleted.`);
      onDeleted();
      return;
    }
    setSelected(new Set());
    setBulkOpen(false);
    onDeleted();
  }

  return (
    <section className="mt-12">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          {selectedVisible.length > 0
            ? `${selectedVisible.length} selected`
            : stage
              ? `Showing ${STATUS_LABEL[stage].toLowerCase()}`
              : `${projects.length} project${projects.length === 1 ? "" : "s"}`}
        </p>
        <div className="flex items-center gap-3">
          {selectedVisible.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setBulkOpen(true)}
                className="inline-flex items-center gap-1 text-xs text-destructive transition-colors hover:text-destructive/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Trash2 className="size-3" /> Delete
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Clear selection
              </button>
            </>
          )}
          {stage && (
            <button
              type="button"
              onClick={() => onStageChange(null)}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Clear filter
            </button>
          )}
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="py-10 text-sm text-muted-foreground">
          {emptyLabel ?? "No projects at this stage."}
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.key} className="mt-6 first:mt-4">
            {!stage && (
              <h2 className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                {group.label}
                <span className="tabular-nums text-muted-foreground/60">
                  {group.projects.length}
                </span>
              </h2>
            )}
            <ul className="divide-y divide-border/60">
              {group.projects.map((project, index) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  index={index}
                  onDeleted={onDeleted}
                  selected={selected.has(project.id)}
                  onToggleSelected={() => toggleSelected(project.id)}
                />
              ))}
            </ul>
          </div>
        ))
      )}

      <AlertDialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedVisible.length} project{selectedVisible.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes them from the in-memory store. It can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {bulkError && <p className="text-sm text-destructive">{bulkError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={bulkDeleting} onClick={onConfirmBulkDelete}>
              {bulkDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function ProjectRow({
  project,
  index,
  onDeleted,
  selected,
  onToggleSelected,
}: {
  project: ProjectSummary;
  index: number;
  onDeleted: () => void;
  selected: boolean;
  onToggleSelected: () => void;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const splitTotal =
    project.split?.reduce((sum, item) => sum + item.cents, 0) ?? 0;
  // The demo project is seeded on demand, so deleting it would only bring it back.
  const deletable = !isDemoProject(project.id);

  async function onConfirmDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteProject(project.id);
      setOpen(false);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete project.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.3,
        delay: reduce ? 0 : Math.min(index, 8) * 0.04,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="group relative"
    >
      <Link
        href={projectHref(project)}
        aria-label={`Open ${project.name}`}
        className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      <div className="pointer-events-none relative z-10 -mx-3 flex items-center gap-4 rounded-lg px-3 py-4 transition-colors group-hover:bg-muted/30 sm:gap-6">
        {deletable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelected}
            aria-label={`Select ${project.name}`}
            className={cn(
              "pointer-events-auto size-4 shrink-0 cursor-pointer rounded border-input accent-primary transition-opacity",
              !selected && "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
            )}
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium">{project.name}</p>
          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            {money(project.totalAmount)} · {formatDate(project.createdAt)}
            {project.hasSources && (
              <span className={project.lastSyncAt ? undefined : "text-warning"}>
                {" "}
                · {project.lastSyncAt ? `Synced ${timeAgo(project.lastSyncAt)}` : "Not synced yet"}
              </span>
            )}
          </p>
          {project.split && splitTotal > 0 && (
            <div
              className="mt-2.5 flex h-[3px] max-w-[280px] gap-px overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={project.split
                .map((item) => `${item.person} ${money(item.cents / 100)}`)
                .join(", ")}
            >
              {project.split.map((item) => (
                <motion.span
                  key={item.person}
                  className="h-full"
                  style={{
                    backgroundColor: personColor(
                      Math.max(0, project.members.indexOf(item.person))
                    ),
                  }}
                  initial={reduce ? false : { width: 0 }}
                  animate={{ width: `${(item.cents / splitTotal) * 100}%` }}
                  transition={{
                    duration: 0.6,
                    delay: reduce ? 0 : Math.min(index, 8) * 0.04 + 0.15,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div
          className="flex shrink-0 -space-x-1.5"
          aria-label={project.members.join(", ")}
        >
          {project.members.slice(0, 4).map((name, memberIndex) => (
            <span
              key={name}
              className="rounded-full bg-background ring-2 ring-background"
            >
              <Avatar
                name={name}
                color={personColor(memberIndex)}
                className="size-6 [&_*]:text-[9px]"
              />
            </span>
          ))}
          {project.members.length > 4 && (
            <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[9px] text-muted-foreground ring-2 ring-background">
              +{project.members.length - 4}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
            <span
              className={cn("size-1.5 rounded-full", STATUS_DOT[project.status])}
              aria-hidden
            />
            {STATUS_LABEL[project.status] ?? project.status}
          </span>
          <ArrowRight
            className="size-4 -translate-x-1 text-muted-foreground opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:translate-x-0 group-focus-within:opacity-100"
            aria-hidden
          />
        </div>

        {deletable && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`Delete ${project.name}`}
            className="pointer-events-auto -mr-1 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
          >
            <MoreHorizontal className="size-4" />
          </button>
        )}
      </div>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{project.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the project from the in-memory store. It can’t be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={onConfirmDelete}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.li>
  );
}
