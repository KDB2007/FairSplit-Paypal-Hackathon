"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { ProjectSummary } from "@/lib/types";
import { fetchProjects } from "@/lib/client";
import { useTasks } from "./tasks";

/**
 * Project summaries for navigation; refetched on route change (new projects)
 * and whenever background work finishes (a sync, score or payout changes status).
 */
export function useProjects() {
  const pathname = usePathname();
  const { tasks } = useTasks();
  const settled = tasks.filter((task) => task.status !== "running").length;
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);

  useEffect(() => {
    let active = true;
    fetchProjects()
      .then((list) => active && setProjects(list))
      .catch(() => active && setProjects([]));
    return () => {
      active = false;
    };
  }, [pathname, settled]);

  return projects;
}

/** The project id in /project/[id], /dashboard/[id] or /receipt/[id], if any. */
export function currentProjectId(pathname: string): string | null {
  const match = pathname.match(/^\/(?:project|dashboard|receipt)\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
