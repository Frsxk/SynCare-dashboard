"use client";
import Link from "next/link";
import { useCallback, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AsyncPanel, type PanelState } from "@/components/states/async-panel";
import { Button } from "@/components/ui/button";
import { ApiFailure } from "@/lib/api/client";
import { PatientSessionData, usePatientSession } from "@/features/patients/session-data";
import { bookingEnvelope, bookingMutation, statusLabels, visitTime, type Booking, type BookingTransition } from "./contracts";
import { ScheduleForm } from "./schedule-form";
import { CompletionForm } from "./completion-form";
import { TerminalActionForm } from "./terminal-action-form";

export function BookingDetailPage(props: { principalId: string; csrfToken: string; bookingId: string }) {
  return <PatientSessionData key={`${props.principalId}:${props.csrfToken}:${props.bookingId}`} {...props}><BookingDetail bookingId={props.bookingId} /></PatientSessionData>;
}
export function useBookingTransition(bookingId: string, onSaved: (booking: Booking) => void | Promise<void>, onConflict: () => void) {
  const session = usePatientSession();
  const intent = useRef<{ key: string; input: BookingTransition } | null>(null), sending = useRef(false);
  const mutation = useMutation({ mutationFn: async (input: BookingTransition) => {
    intent.current ??= { key: crypto.randomUUID(), input };
    if (JSON.stringify(intent.current.input) !== JSON.stringify(input)) throw new ApiFailure("outcome_unknown");
    const result = await session.api.request(`/v1/bookings/${bookingId}/transitions`, { method: "POST", idempotencyKey: intent.current.key, body: intent.current.input, schema: bookingMutation });
    if (result.data.resource.id !== bookingId) throw new ApiFailure("outcome_unknown");
    return result.data.resource;
  }, onSuccess: async booking => { intent.current = null; await onSaved(booking); }, onError: error => {
    if (error instanceof ApiFailure && error.code !== "outcome_unknown") intent.current = null;
    if (error instanceof ApiFailure && error.code === "version_conflict") onConflict();
  }, onSettled: () => { sending.current = false; }, retry: false });
  const submit = (input: BookingTransition) => { if (sending.current) return; sending.current = true; mutation.mutate(input); };
  return { ...mutation, submit, reconcile: () => { if (intent.current) submit(intent.current.input); } };
}
function BookingDetail({ bookingId }: { bookingId: string }) {
  const session = usePatientSession(), key = session.key(["booking", bookingId]);
  const query = useQuery({ queryKey: key, queryFn: async ({ signal }) => {
    const result = await session.api.request(`/v1/bookings/${bookingId}`, { schema: bookingEnvelope, signal });
    if (result.data.id !== bookingId) throw new ApiFailure("invalid_response");
    return result;
  } });
  const mutation = useBookingTransition(bookingId, async booking => { await session.query.cancelQueries({ queryKey: key, exact: true }); session.query.setQueryData(key, { data: booking, requestId: "committed-booking-transition" }); await session.query.invalidateQueries({ queryKey: session.key(["bookings"]) }); }, () => { void query.refetch(); });
  const { refetch } = query;
  const accessLost = useCallback(() => { void refetch(); }, [refetch]);
  const failure = query.error instanceof ApiFailure ? query.error : new ApiFailure("processing_failed");
  const mutationFailure = mutation.error instanceof ApiFailure ? mutation.error : null;
  const denied = (query.isError && ["unauthenticated", "forbidden", "not_found", "session_changed"].includes(failure.code)) || (mutationFailure && ["unauthenticated", "forbidden", "not_found", "session_changed"].includes(mutationFailure.code));
  const refresh = () => { void query.refetch(); };
  const booking = !denied ? query.data?.data : undefined;
  const unknown = mutationFailure?.code === "outcome_unknown";
  const disabled = mutation.isPending || unknown || query.isFetching || query.isError;
  const receipt = mutation.data ? ({ "Under Review": "Status review tersimpan.", Scheduled: "Jadwal dan petugas tersimpan.", Completed: "Kunjungan ditandai selesai.", Cancelled: "Pembatalan tersimpan.", Rejected: "Penolakan tersimpan.", Requested: "Pengajuan tersimpan." })[mutation.data.status] : null;
  const feedback = <>{mutation.isPending && <p role="status">Menyimpan perubahan booking…</p>}{mutation.isSuccess && <p role="status">{receipt}</p>}{mutationFailure && <div><p role="alert">{mutationFailure.message}</p>{unknown ? <><p>Hasil penyimpanan belum dapat dipastikan. Periksa tindakan yang sama sebelum membuat perubahan lain.</p><Button variant="outline" disabled={mutation.isPending} onClick={mutation.reconcile}>Periksa {mutation.variables?.toStatus === "Under Review" ? "review" : "tindakan"} yang sama</Button></> : <Button variant="outline" disabled={query.isFetching} onClick={refresh}>Muat data terbaru</Button>}</div>}</>;
  const content = booking ? <article aria-label="Detail pengajuan homecare" className="clinical-section">
    <h2>{booking.service.name}</h2><p><strong>Status: {statusLabels[booking.status]}</strong></p><p>Pasien: <Link href={`/patients/${booking.patientId}`}>{booking.patientName}</Link></p><p>ID pengajuan: {booking.id}</p>
    <h3>Preferensi pasien</h3><p>{visitTime(booking.preferredWindow.startAt)} sampai {visitTime(booking.preferredWindow.endAt)}</p><p>{booking.address.fullAddress}, {booking.address.kelurahan}, {booking.address.kecamatan}, {booking.address.city}</p><p>Catatan: {booking.visitNote || "Tidak ada catatan tambahan."}</p>
    <p>Permintaan simulasi. Preferensi pasien tidak menjamin ketersediaan waktu atau petugas.</p>
    {booking.confirmedSlot && booking.assignedStaff && <section aria-label="Jadwal kunjungan"><h3>{booking.status === "Scheduled" ? "Jadwal dan perawat terkonfirmasi" : "Riwayat jadwal dan perawat"}</h3><p>{visitTime(booking.confirmedSlot.startAt)} sampai {visitTime(booking.confirmedSlot.endAt)}</p><p>Perawat: {booking.assignedStaff.displayName}</p></section>}
    {booking.status === "Completed" && <section aria-label="Penyelesaian kunjungan"><h3>Kunjungan selesai</h3><p>Waktu aktual: {booking.completedAt && visitTime(booking.completedAt)}</p><p>Catatan untuk pasien: {booking.completionNote}</p><p>Status ini menutup layanan simulasi, bukan penilaian pasien pulih.</p></section>}
    <h3>Riwayat pengajuan</h3><ol>{booking.timeline.map(event => <li key={event.id}><strong>{statusLabels[event.toStatus]}</strong>. Dicatat {visitTime(event.occurredAt)}<p>Dicatat oleh: {event.actorId}</p>{event.reason && <p>{event.reason}</p>}{event.internalNote && <p>Catatan internal: {event.internalNote}</p>}</li>)}</ol>
    {feedback}
    {booking.status === "Requested" && <Button disabled={disabled} onClick={() => mutation.submit({ expectedVersion: booking.version, toStatus: "Under Review" })}>Mulai review</Button>}
    {booking.status === "Under Review" && <ScheduleForm booking={booking} disabled={disabled} onSubmit={mutation.submit} onAccessLost={accessLost} />}
    {booking.status === "Scheduled" && <CompletionForm booking={booking} disabled={disabled} pending={mutation.isPending} feedback={feedback} onSubmit={mutation.submit} />}
    {["Requested", "Under Review", "Scheduled"].includes(booking.status) && <TerminalActionForm booking={booking} disabled={disabled} onSubmit={mutation.submit} />}
  </article> : null;
  const state: PanelState = booking ? { kind: "content", content, refresh: query.isError ? { kind: "error", failure, onRetry: refresh } : query.isFetching ? { kind: "refreshing" } : { kind: "idle" } } : query.isError || denied ? { kind: "error", failure: denied && mutationFailure ? mutationFailure : failure, onRetry: refresh } : { kind: "loading" };
  return <><Link href="/homecare">Kembali ke antrean homecare</Link><h1>Pengajuan homecare</h1><AsyncPanel state={state} /><Button variant="outline" disabled={query.isFetching || mutation.isPending} onClick={refresh}>Muat ulang pengajuan</Button></>;
}
