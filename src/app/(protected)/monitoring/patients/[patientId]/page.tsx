import { resolveNurseSession } from "@/lib/auth/server";
import { MonitoringPage } from "@/features/monitoring/monitoring-table";
export default async function Page({ params }: { params: Promise<{ patientId: string }> }) {
  const session = await resolveNurseSession(), { patientId } = await params;
  return session ? <MonitoringPage principalId={session.principal.id} csrfToken={session.csrfToken} patientId={patientId} /> : null;
}
