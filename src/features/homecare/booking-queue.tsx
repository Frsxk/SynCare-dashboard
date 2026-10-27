"use client";
import Link from "next/link";
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { AsyncPanel, type PanelState } from "@/components/states/async-panel";
import { Button } from "@/components/ui/button";
import { ApiFailure } from "@/lib/api/client";
import { PatientSessionData, usePatientSession } from "@/features/patients/session-data";
import { bookingPage, statusLabels, visitTime } from "./contracts";

export function BookingQueuePage(props: { principalId: string; csrfToken: string }) {
  return <PatientSessionData key={`${props.principalId}:${props.csrfToken}`} {...props}><BookingQueue /></PatientSessionData>;
}
function BookingQueue() {
  const session = usePatientSession();
  const [filter, setFilter] = useState("active");
  const query = useInfiniteQuery({ queryKey: session.key(["bookings", filter]), gcTime: 0, initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => session.api.request(`/v1/bookings?status=${encodeURIComponent(filter)}&limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`, { schema: bookingPage, signal }), getNextPageParam: p => p.nextCursor ?? undefined });
  const failure = query.error instanceof ApiFailure ? query.error : new ApiFailure("processing_failed");
  const denied = query.isError && ["unauthenticated", "forbidden", "not_found", "session_changed"].includes(failure.code);
  const retry = () => { void query.refetch(); };
  const rows = query.data?.pages.flatMap(p => p.data) ?? [];
  const content = rows.length ? <ul className="patient-list">{rows.map(b => <li key={b.id}><Link href={`/homecare/${b.id}`}>Pengajuan {b.patientName}</Link><p>{b.service.name}</p><p>Status: {statusLabels[b.status]}</p><p>Waktu pilihan: {visitTime(b.preferredWindow.startAt)} sampai {visitTime(b.preferredWindow.endAt)}</p></li>)}</ul> : <p>{filter === "all" ? "Belum ada pengajuan homecare dari pasien yang ditugaskan." : "Tidak ada booking yang cocok dengan filter ini. Pilih semua status untuk melihat riwayat."}</p>;
  const state: PanelState = !denied && query.data ? { kind: "content", content, refresh: query.isError ? { kind: "error", failure, onRetry: retry } : query.isFetching ? { kind: "refreshing" } : { kind: "idle" } } : query.isError ? { kind: "error", failure, onRetry: retry } : { kind: "loading" };
  return <><h1>Antrean homecare</h1><p>Permintaan simulasi DKI Jakarta. Waktu pilihan pasien belum menjadi jadwal terkonfirmasi. Hanya pengajuan pasien yang ditugaskan dan diizinkan dapat dibuka.</p><div className="clinical-form"><label>Status booking<select value={filter} disabled={denied} onChange={event => setFilter(event.target.value)}><option value="active">Booking aktif</option><option value="all">Semua status</option>{Object.entries(statusLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></label></div><AsyncPanel state={state} /><div className="clinical-actions"><Button variant="outline" disabled={query.isFetching} onClick={retry}>Muat ulang antrean</Button>{query.hasNextPage && <Button variant="outline" disabled={query.isFetching} onClick={() => { void query.fetchNextPage(); }}>Muat pengajuan berikutnya</Button>}</div></>;
}
