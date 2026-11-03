"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { FolderKanban, LayoutDashboard, ListChecks, Moon, Plus, ReceiptText, Sparkles, Sun } from "lucide-react";
import ActionSearchBar, { type CommandItem } from "@/components/kokonutui/action-search-bar";
import { DEMO_PROJECT_ID, projectHref } from "@/lib/project-links";
import { currentProjectId, useProjects } from "./use-projects";

/** ⌘K palette: jump to any project or page, and switch theme. */
export function CommandBar({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const projects = useProjects();
  const { resolvedTheme, setTheme } = useTheme();
  const activeId = currentProjectId(pathname);

  const items = useMemo<CommandItem[]>(() => {
    const list: CommandItem[] = [];
    if (activeId) {
      const active = projects?.find((p) => p.id === activeId);
      const name = active?.name ?? "This project";
      // A paid project opens on its receipt, so a separate workflow entry would
      // be a second link to the same place.
      if (active?.status !== "paid") {
        list.push({
          id: "cur-workflow",
          label: `${name}: workflow`,
          group: "This project",
          icon: <ListChecks />,
          href: `/project/${activeId}`,
        });
      }
      list.push(
        { id: "cur-dashboard", label: `${name}: overview`, group: "This project", icon: <LayoutDashboard />, href: `/dashboard/${activeId}` },
        { id: "cur-receipt", label: `${name}: receipt`, group: "This project", icon: <ReceiptText />, href: `/receipt/${activeId}` }
      );
    }
    const demo = projects?.find((p) => p.id === DEMO_PROJECT_ID);
    list.push(
      { id: "projects", label: "Dashboard", group: "Go to", icon: <LayoutDashboard />, href: "/projects" },
      { id: "new", label: "New project", group: "Go to", icon: <Plus />, href: "/projects/new", keywords: ["create", "charter"] },
      { id: "demo", label: "Demo project", group: "Go to", icon: <Sparkles />, href: demo ? projectHref(demo) : `/project/${DEMO_PROJECT_ID}` }
    );
    if (projects && projects.length > 0) {
      list.push({
        id: "open-project",
        label: "Open a project…",
        group: "Go to",
        icon: <FolderKanban />,
        placeholder: "Search projects",
        children: projects.map((p) => ({
          id: `p-${p.id}`,
          label: p.name,
          keywords: [p.status.replace("_", " ")],
          href: projectHref(p),
        })),
      });
    }
    list.push({
      id: "theme",
      label: resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme",
      group: "Preferences",
      icon: resolvedTheme === "dark" ? <Sun /> : <Moon />,
      keywords: ["dark", "light", "theme", "mode"],
    });
    return list;
  }, [activeId, projects, resolvedTheme]);

  return (
    <ActionSearchBar
      className={className}
      items={items}
      shortcut
      label="Search FairSplit"
      placeholder="Jump to a project or page…"
      defaultRecent={[]}
      onSelect={(item) => {
        if (item.href) router.push(item.href);
        else if (item.id === "theme") setTheme(resolvedTheme === "dark" ? "light" : "dark");
      }}
    />
  );
}
