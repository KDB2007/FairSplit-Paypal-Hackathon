import type { ProjectStatus } from "./types";

/**
 * Where a project should open from navigation.
 *
 * A paid project has nothing left to do in the workflow, so the receipt is the
 * meaningful destination — opening the payout screen again would only show a
 * completed batch.
 */
export function projectHref(project: { id: string; status: ProjectStatus }): string {
  return project.status === "paid" ? `/receipt/${project.id}` : `/project/${project.id}`;
}

/** The ID of the seeded demo project — it's reset, not deleted, and always re-appears. */
export const DEMO_PROJECT_ID = "demo";

/** Whether a project is the seeded demo rather than one the user created. */
export function isDemoProject(id: string): boolean {
  return id === DEMO_PROJECT_ID;
}
