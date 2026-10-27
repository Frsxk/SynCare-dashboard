import { resolveNurseSession } from "@/lib/auth/server";
import { AlertQueuePage } from "@/features/escalations/alert-queue";
export default async function Page() {
  const session = await resolveNurseSession();
  return session ? <AlertQueuePage principalId={session.principal.id} csrfToken={session.csrfToken} /> : null;
}
