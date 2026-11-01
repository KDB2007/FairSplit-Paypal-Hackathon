/**
 * One colour per person, everywhere. Colours follow the project's member order
 * (which never changes), so "Priya is purple" holds on every chart and card.
 * Values are theme tokens, so they adapt to light and dark mode.
 */

// Emitted via `@theme static` in globals.css (see the note there).
const PALETTE = [
  "var(--color-person-1)",
  "var(--color-person-2)",
  "var(--color-person-3)",
  "var(--color-person-4)",
  "var(--color-person-5)",
  "var(--color-person-6)",
];

export function personColor(index: number): string {
  return PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length];
}

/** memberId → colour, from the project's member list. */
export function personColorMap(members: Array<{ id: string }>): Record<string, string> {
  return Object.fromEntries(members.map((m, i) => [m.id, personColor(i)]));
}

/** Same map keyed by name, for rows (decisions, payouts) that only carry a name. */
export function personColorByName(members: Array<{ name: string }>): Record<string, string> {
  return Object.fromEntries(members.map((m, i) => [m.name, personColor(i)]));
}

/** A translucent tint of a person's colour (for backgrounds and rings). */
export function tint(color: string, percent: number): string {
  return `color-mix(in oklch, ${color} ${percent}%, transparent)`;
}
