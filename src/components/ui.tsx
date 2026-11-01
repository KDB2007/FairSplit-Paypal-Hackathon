"use client";

/**
 * FairSplit's app primitives, built on the shadcn components in ./ui/.
 *
 * Pages import from here with the same API they always had (`tone`, `variant`,
 * `size`), so the whole app picks up the design tokens and dark mode without
 * every call site changing at once. New screens can use ./ui/* directly.
 */

import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { Check } from "lucide-react";
import { cn, avatarClass, initials } from "@/lib/utils";
import { Button as UIButton } from "@/components/ui/button";
import {
  Card as UICard,
  CardContent as UICardContent,
  CardDescription as UICardDescription,
  CardHeader as UICardHeader,
  CardTitle as UICardTitle,
} from "@/components/ui/card";
import { Input as UIInput } from "@/components/ui/input";
import { Textarea as UITextarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Label as UILabel } from "@/components/ui/label";
import { Badge as UIBadge } from "@/components/ui/badge";
import { Alert as UIAlert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import { ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import { Avatar as UIAvatar, AvatarFallback } from "@/components/ui/avatar";
import { Spinner as UISpinner } from "@/components/ui/spinner";

/* -------------------------------- Button --------------------------------- */

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const VARIANT_MAP = {
  primary: "default",
  secondary: "secondary",
  outline: "outline",
  ghost: "ghost",
  danger: "destructive",
} as const;

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4",
  lg: "h-11 px-6 text-[0.95rem]",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return (
    <UIButton
      variant={VARIANT_MAP[variant]}
      className={cn("gap-2", variant === "primary" && "shadow-sm", SIZE_CLASS[size], className)}
      {...props}
    />
  );
}

/* --------------------------------- Card ---------------------------------- */

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <UICard className={cn("gap-0 py-0 shadow-xs", className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <UICardHeader className={cn("border-b px-5 py-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <UICardTitle className={cn("font-semibold tracking-tight", className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <UICardDescription className={cn("mt-0.5", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <UICardContent className={cn("px-5 py-4", className)} {...props} />;
}

/* -------------------------------- Inputs --------------------------------- */

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <UIInput className={cn("h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <UITextarea className={className} {...props} />;
}

export function Select({ className, children, size: _size, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  void _size; // native `size` (visible rows) isn't used here and clashes with NativeSelect's size variant
  return (
    <NativeSelect className={cn("w-full [&_select]:h-9", className)} {...props}>
      {children}
    </NativeSelect>
  );
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <UILabel className={cn("mb-1.5 text-muted-foreground", className)} {...props} />;
}

/* -------------------------------- Badges --------------------------------- */

type BadgeTone = "slate" | "blue" | "emerald" | "amber" | "rose" | "violet";

/** Tones are kept for call-site compatibility; they map to semantic tokens. */
const BADGE_TONES: Record<BadgeTone, string> = {
  slate: "border-border bg-muted text-muted-foreground",
  blue: "border-info/25 bg-info/10 text-info",
  emerald: "border-success/25 bg-success/10 text-success",
  amber: "border-warning/35 bg-warning/15 text-warning-foreground dark:text-warning",
  rose: "border-destructive/25 bg-destructive/10 text-destructive",
  violet: "border-primary/25 bg-primary/10 text-primary",
};

export function Badge({
  tone = "slate",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <UIBadge variant="outline" className={cn(BADGE_TONES[tone], className)}>
      {children}
    </UIBadge>
  );
}

/* -------------------------------- Avatar --------------------------------- */

export function Avatar({ name, color, className }: { name: string; color?: string; className?: string }) {
  // With a person colour (see lib/person-color) the avatar matches their charts;
  // without one it falls back to a stable colour hashed from the name.
  return (
    <UIAvatar className={cn("size-9", className)}>
      <AvatarFallback
        className={cn("text-xs font-semibold", !color && avatarClass(name))}
        style={color ? { backgroundColor: `color-mix(in oklch, ${color} 16%, transparent)`, color } : undefined}
      >
        {initials(name)}
      </AvatarFallback>
    </UIAvatar>
  );
}

/* ------------------------------- Progress -------------------------------- */

const PROGRESS_TONES = {
  blue: "bg-primary",
  emerald: "bg-success",
  amber: "bg-warning",
  violet: "bg-chart-1",
} as const;

export function Progress({ value, tone = "blue" }: { value: number; tone?: keyof typeof PROGRESS_TONES }) {
  return (
    <ProgressPrimitive.Root value={Math.min(100, Math.max(0, value))} data-slot="progress">
      <ProgressTrack className="h-1.5">
        <ProgressIndicator className={PROGRESS_TONES[tone]} />
      </ProgressTrack>
    </ProgressPrimitive.Root>
  );
}

/* -------------------------------- Alert ---------------------------------- */

const ALERT_TONES = {
  info: "border-info/25 bg-info/5 text-info *:data-[slot=alert-description]:text-foreground/80",
  success: "border-success/25 bg-success/5 text-success *:data-[slot=alert-description]:text-foreground/80",
  warning:
    "border-warning/40 bg-warning/10 text-warning-foreground dark:text-warning *:data-[slot=alert-description]:text-foreground/80",
  error: "border-destructive/25 bg-destructive/5 text-destructive *:data-[slot=alert-description]:text-foreground/80",
};

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: keyof typeof ALERT_TONES;
  title?: string;
  children?: ReactNode;
}) {
  return (
    <UIAlert className={cn("px-4 py-3", ALERT_TONES[tone])} role={tone === "error" ? "alert" : "status"}>
      {title && <AlertTitle className="font-semibold">{title}</AlertTitle>}
      {children && (
        <AlertDescription className={cn("text-sm", !title && "text-current")}>{children}</AlertDescription>
      )}
    </UIAlert>
  );
}

/* -------------------------------- Spinner -------------------------------- */

export function Spinner({ className }: { className?: string }) {
  return <UISpinner className={className} />;
}

/* -------------------------------- Stepper -------------------------------- */

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="Progress">
      {steps.map((step, index) => {
        const state = index < current ? "done" : index === current ? "active" : "todo";
        return (
          <li key={step} className="flex items-center gap-2" aria-current={state === "active" ? "step" : undefined}>
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                state === "done" && "bg-success text-success-foreground",
                state === "active" && "bg-primary text-primary-foreground ring-4 ring-primary/15",
                state === "todo" && "bg-muted text-muted-foreground"
              )}
            >
              {state === "done" ? <Check className="size-3.5" aria-label="done" /> : index + 1}
            </span>
            <span className={cn("font-medium", state === "active" ? "text-foreground" : "text-muted-foreground")}>
              {step}
            </span>
            {index < steps.length - 1 && <span className="mx-1 h-px w-6 bg-border" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------- Page shell ------------------------------ */

export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn("mx-auto w-full max-w-6xl px-4 py-8 sm:px-6", className)}>{children}</main>;
}
