import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { AppHeader } from "@/components/app-shell/app-header";
import { TasksProvider } from "@/components/app-shell/tasks";

/** The product shell: sidebar, header (breadcrumbs, status island, ⌘K) and page. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <TasksProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0 print:m-0 print:shadow-none">
          <AppHeader />
          <div className="flex-1">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TasksProvider>
  );
}
