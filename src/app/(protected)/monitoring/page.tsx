import { resolveNurseSession } from "@/lib/auth/server";
import { MonitoringPage } from "@/features/monitoring/monitoring-table";
export default async function Page() {
  const session = await resolveNurseSession();
  return session ? <MonitoringPage principalId={session.principal.id} csrfToken={session.csrfToken} /> : null;
}
