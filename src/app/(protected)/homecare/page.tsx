import { resolveNurseSession } from "@/lib/auth/server";
import { BookingQueuePage } from "@/features/homecare/booking-queue";
export default async function Page() {
  const session = await resolveNurseSession();
  return session ? <BookingQueuePage principalId={session.principal.id} csrfToken={session.csrfToken} /> : null;
}
