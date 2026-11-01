import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

/**
 * The dashboard is a view over the live store. DEMO_MODE is read here, on the
 * server, so the demo link and the in-memory note never appear in real use.
 */
export default function ProjectsPage() {
  return <DashboardClient demoMode={process.env.DEMO_MODE === "true"} />;
}
