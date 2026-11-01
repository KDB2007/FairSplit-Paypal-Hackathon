"use client";

import { useTheme } from "next-themes";
import SwitchButton from "@/components/kokonutui/switch-button";

/** Kokonut's sun/moon toggle, driven by next-themes so the choice persists. */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <SwitchButton
      className={className}
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      onThemeChange={setTheme}
    />
  );
}
