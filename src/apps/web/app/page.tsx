import DashboardClient from "./DashboardClient";
import { getDashboardOverview } from "../lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  let initialOverview = null;
  let initialError: string | null = null;

  try {
    initialOverview = await getDashboardOverview(7, undefined, false);
  } catch (error: any) {
    initialError = error?.message || "Failed to load initial dashboard overview.";
  }

  return <DashboardClient initialOverview={initialOverview} initialError={initialError} />;
}
