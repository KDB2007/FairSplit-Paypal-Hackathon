"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartNoAxesCombined, LayoutDashboard, ListChecks, Plus, ReceiptText } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "./theme-toggle";
import { currentProjectId, useProjects } from "./use-projects";

export function AppSidebar() {
  const pathname = usePathname();
  const projects = useProjects();
  const activeId = currentProjectId(pathname);
  const active = projects?.find((project) => project.id === activeId);

  return (
    <Sidebar collapsible="icon" variant="inset" className="no-print">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" />} tooltip="FairSplit home">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                FS
              </span>
              <span className="grid leading-tight">
                <span className="font-semibold">FairSplit</span>
                <span className="text-xs text-muted-foreground">Fair, explained payouts</span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === "/projects"}
                  render={<Link href="/projects" />}
                  tooltip="Dashboard"
                >
                  <LayoutDashboard />
                  <span>Dashboard</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === "/projects/new"}
                  render={<Link href="/projects/new" />}
                  tooltip="New project"
                >
                  <Plus />
                  <span>New project</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {activeId && (
          <SidebarGroup>
            <SidebarGroupLabel className="truncate">{active?.name ?? "This project"}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={pathname.startsWith("/project/")}
                    render={<Link href={`/project/${activeId}`} />}
                    tooltip="Workflow"
                  >
                    <ListChecks />
                    <span>Workflow</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={pathname.startsWith("/dashboard/")}
                    render={<Link href={`/dashboard/${activeId}`} />}
                    tooltip="Overview"
                  >
                    <ChartNoAxesCombined />
                    <span>Overview</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={pathname.startsWith("/receipt/")}
                    render={<Link href={`/receipt/${activeId}`} />}
                    tooltip="Receipt"
                  >
                    <ReceiptText />
                    <span>Receipt</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-between gap-2 px-2 py-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <span className="text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">Theme</span>
          <ThemeToggle />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
