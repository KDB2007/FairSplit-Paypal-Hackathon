# FairSplit UI notes

## Component sources

- **shadcn/ui** (`src/components/ui/`, base library: Base UI, style `base-nova`). Add with
  `npx shadcn@latest add @shadcn/<name>`. Base UI uses a `render` prop, not `asChild`
  (e.g. `<SidebarMenuButton render={<Link href="/x" />}>`).
- **Kokonut UI** (`src/components/kokonutui/`). Add with
  `npx shadcn@latest add @kokonutui/<name>`; browse https://kokonutui.com/llms.txt.
- **MotionSites** (MCP) supplies design briefs, not code. The three free prompts used
  (Sellix hero, Capabilities, Lumina footer) shape the marketing page only.
- Both registries are vendored code and excluded from lint in `eslint.config.mjs`.

## After `npx shadcn add`

- Generated files may `import { cn } from "cn"` (a separate npm package). Repoint them to
  `@/lib/utils` and don't keep the `cn` package installed.
- Never let the CLI overwrite `src/lib/utils.ts`: it also holds `money`, `formatDate`,
  `initials`, `avatarClass`, used across the app. Decline any overwrite prompt for it.

## App structure

- `src/app/(marketing)/` — the landing page (always dark).
- `src/app/(app)/` — product pages inside the shell (`layout.tsx`): shadcn sidebar,
  breadcrumb header, Kokonut status island (`useTasks().track(label, promise)`) and
  ⌘K command bar (`action-search-bar`).
- `src/components/ui.tsx` — the app's original primitive API (`Button variant="primary"`,
  `Badge tone="emerald"`, `Alert tone`, `Stepper`, `PageShell`), now built on shadcn. Its
  tones map to semantic tokens; prefer `src/components/ui/*` for new screens.

## Theme

- Tokens live in `src/app/globals.css` (`:root` light, `.dark`). Brand: violet primary,
  amber `--highlight`, plus `--success`, `--warning`, `--info`.
- Use token classes (`bg-card`, `text-muted-foreground`, `bg-success/10`), not raw
  `slate-*`/`blue-*`, so dark mode works. Theme is managed by `next-themes`
  (`src/components/providers.tsx`) and toggled by Kokonut `switch-button`.
- Avoid render-time randomness in client components (e.g. shadcn's
  `SidebarMenuSkeleton`) — it causes hydration mismatches.
