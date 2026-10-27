import { resolveNurseSession } from "@/lib/auth/server";
import { PlanWorkspacePage } from "@/features/plans/review-desk";
export default async function Page({ params, searchParams }: { params: Promise<{ patientId: string }>; searchParams: Promise<{ draftId?: string; reviewId?: string }> }) {
  const session = await resolveNurseSession(), { patientId } = await params, query = await searchParams;
  return session ? <PlanWorkspacePage principalId={session.principal.id} csrfToken={session.csrfToken} patientId={patientId} initialDraftId={typeof query.draftId === "string" ? query.draftId : undefined} initialReviewId={typeof query.reviewId === "string" ? query.reviewId : undefined} /> : null;
}
