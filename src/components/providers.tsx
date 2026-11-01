"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

/** App-wide client providers: theme (class on <html>), tooltips and toasts. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <TooltipProvider>
        {children}
        <Toaster richColors closeButton position="bottom-right" />
      </TooltipProvider>
    </ThemeProvider>
  );
}
