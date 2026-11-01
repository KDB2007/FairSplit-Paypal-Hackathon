"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { StatusIsland } from "@/components/kokonutui/status-island";
import { projectHref } from "@/lib/project-links";
import { CommandBar } from "./command-bar";
import { useTasks } from "./tasks";
import { currentProjectId, useProjects } from "./use-projects";

// "Dashboard" is already the root crumb (the global overview at /projects), so the
// per-project analytics page is labelled "Overview" here to avoid repeating it.
const SECTION_LABEL: Record<string, string> = {
  project: "Workflow",
  dashboard: "Overview",
  receipt: "Receipt",
};

export function AppHeader() {
  const pathname = usePathname();
  const projects = useProjects();
  const { tasks, dismiss } = useTasks();
  const activeId = currentProjectId(pathname);
  const section = pathname.split("/")[1];
  const project = projects?.find((p) => p.id === activeId);
  const projectName = project?.name;

  const crumbs: Array<{ label: string; href?: string }> = [{ label: "Dashboard", href: "/projects" }];
  if (activeId) {
    crumbs.push({
      label: projectName ?? "Project",
      href: project ? projectHref(project) : `/project/${activeId}`,
    });
    crumbs.push({ label: SECTION_LABEL[section] ?? section });
  }

  // The dashboard page has its own <h1>; repeating it in the breadcrumb adds noise.
  const onDashboard = pathname === "/projects";

  return (
    <header className="no-print sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 rounded-t-xl border-b bg-background/80 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <SidebarTrigger className="-ml-1" />
      {!onDashboard && (
        <>
          <Separator orientation="vertical" className="mx-1 h-4" />
          <Breadcrumb className="min-w-0">
            <BreadcrumbList className="flex-nowrap">
              {crumbs.map((crumb, i) => {
                const last = i === crumbs.length - 1;
                return (
                  <Fragment key={`${crumb.label}-${i}`}>
                    <BreadcrumbItem className={i === 0 && crumbs.length > 2 ? "hidden sm:inline-flex" : "min-w-0"}>
                      {last || !crumb.href ? (
                        <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink render={<Link href={crumb.href} />} className="truncate">
                          {crumb.label}
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                    {!last && <BreadcrumbSeparator className={i === 0 && crumbs.length > 2 ? "hidden sm:block" : undefined} />}
                  </Fragment>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
        </>
      )}

      <div className="ml-auto flex items-center gap-3">
        {tasks.length > 0 && <StatusIsland tasks={tasks} onDismiss={dismiss} />}
        <CommandBar className="hidden w-72 md:block" />
      </div>
    </header>
  );
}
