import type { Contribution } from "../types";

/** A contribution as it comes out of a source, before it is attributed to a member. */
export type SyncedItem = Omit<Contribution, "id" | "projectId" | "person" | "memberId">;
