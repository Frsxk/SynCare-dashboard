import { resolveNurseSession } from "@/lib/auth/server";
import { ReportDetailPage } from "@/features/monitoring/report-detail";
export default async function Page({ params }: { params: Promise<{ checkinId: string }> }) {
  const session = await resolveNurseSession(), { checkinId } = await params;
  return session ? <ReportDetailPage principalId={session.principal.id} csrfToken={session.csrfToken} checkinId={checkinId} /> : null;
}
