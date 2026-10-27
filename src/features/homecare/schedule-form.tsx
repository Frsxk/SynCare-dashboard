"use client";
import { useEffect } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { ApiFailure } from "@/lib/api/client";
import { usePatientSession } from "@/features/patients/session-data";
import { scheduleFormSchema, staffPage, wibInstant, type Booking, type BookingTransition } from "./contracts";

export function ScheduleForm({ booking, disabled, onSubmit, onAccessLost }: { booking: Booking; disabled: boolean; onSubmit: (input: BookingTransition) => void; onAccessLost: () => void }) {
  const session = usePatientSession();
  const query = useInfiniteQuery({ queryKey: session.key(["homecare-staff", booking.patientId]), initialPageParam: null as string | null, queryFn: ({ signal, pageParam }) => session.api.request(`/v1/homecare/staff?patientId=${encodeURIComponent(booking.patientId)}&limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`, { schema: staffPage, signal }), getNextPageParam: p => p.nextCursor ?? undefined });
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof scheduleFormSchema>>({ resolver: zodResolver(scheduleFormSchema), defaultValues: { assignedStaffId: "", start: "", end: "" } });
  const failure = query.error instanceof ApiFailure ? query.error : new ApiFailure("processing_failed");
  const denied = query.isError && ["forbidden", "unauthenticated", "not_found", "session_changed"].includes(failure.code);
  useEffect(() => { if (denied) onAccessLost(); }, [denied, onAccessLost]);
  const rows = !denied && query.data ? [...new Map(query.data.pages.flatMap(p => p.data).map(person => [person.id, person])).values()] : undefined;
  return <section className="clinical-section" aria-label="Penjadwalan kunjungan"><h3>Konfirmasi jadwal dan perawat</h3><p>Pilih perawat dan waktu kunjungan secara manual. Semua tanggal dan jam menggunakan WIB. Ini proses simulasi.</p>
    {query.isFetching && <p role="status">Memuat petugas yang berwenang…</p>}
    {query.isError && <div><p role="alert">{failure.message}</p><Button type="button" variant="outline" onClick={() => { void query.refetch(); }}>Muat ulang petugas</Button></div>}
    {rows && rows.length === 0 && <p>Belum ada perawat aktif yang terdaftar dan ditugaskan untuk pasien ini. Operator perlu menyiapkan petugas.</p>}
    {query.hasNextPage && <Button type="button" variant="outline" disabled={query.isFetching || disabled} onClick={() => { void query.fetchNextPage(); }}>Muat petugas berikutnya</Button>}
    <form className="clinical-form" onSubmit={handleSubmit(values => { const startAt = wibInstant(values.start)!, endAt = wibInstant(values.end)!; onSubmit({ expectedVersion: booking.version, toStatus: "Scheduled", assignedStaffId: values.assignedStaffId, confirmedSlot: { startAt, endAt, timezone: "Asia/Jakarta" } }); })}>
      <label>Perawat kunjungan<select disabled={disabled || query.isFetching || query.isError || !rows?.length} aria-invalid={!!errors.assignedStaffId} {...register("assignedStaffId")}><option value="">Pilih perawat</option>{rows?.map(person => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select></label>
      {errors.assignedStaffId && <p role="alert">{errors.assignedStaffId.message}</p>}
      <label>Mulai kunjungan (WIB)<input type="datetime-local" step="1" disabled={disabled} aria-invalid={!!errors.start} {...register("start")} /></label>{errors.start && <p role="alert">{errors.start.message}</p>}
      <label>Selesai kunjungan (WIB)<input type="datetime-local" step="1" disabled={disabled} aria-invalid={!!errors.end} {...register("end")} /></label>{errors.end && <p role="alert">{errors.end.message}</p>}
      <Button disabled={disabled || query.isError || query.isFetching || !rows?.length}>Konfirmasi jadwal dan perawat</Button>
    </form></section>;
}
