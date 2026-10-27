import { resolveNurseSession } from "@/lib/auth/server";
import { BookingDetailPage } from "@/features/homecare/booking-detail";
export default async function Page({ params }: { params: Promise<{ bookingId: string }> }) {
  const session = await resolveNurseSession(), { bookingId } = await params;
  return session ? <BookingDetailPage principalId={session.principal.id} csrfToken={session.csrfToken} bookingId={bookingId} /> : null;
}
