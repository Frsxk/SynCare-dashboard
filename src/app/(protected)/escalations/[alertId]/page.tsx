import { resolveNurseSession } from "@/lib/auth/server";
import { AlertDetailPage } from "@/features/escalations/alert-detail";
export default async function Page({ params }: { params: Promise<{ alertId: string }> }) {
  const session = await resolveNurseSession(), { alertId } = await params;
  return session ? <AlertDetailPage principalId={session.principal.id} csrfToken={session.csrfToken} alertId={alertId} /> : null;
}
