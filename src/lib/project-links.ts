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
