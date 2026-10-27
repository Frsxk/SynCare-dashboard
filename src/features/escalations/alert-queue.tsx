"use client";
import Link from "next/link";
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { AsyncPanel, type PanelState } from "@/components/states/async-panel";
import { Button } from "@/components/ui/button";
import { ApiFailure } from "@/lib/api/client";
import { PatientSessionData, usePatientSession } from "@/features/patients/session-data";
import { visitTime } from "@/features/homecare/contracts";
import { alertPage, statusLabels } from "./contracts";
export function AlertQueuePage(props: { principalId: string; csrfToken: string }) { return <PatientSessionData key={`${props.principalId}:${props.csrfToken}`} {...props}><AlertQueue /></PatientSessionData>; }
function AlertQueue() {
  const session = usePatientSession(), [filter, setFilter] = useState("active");
  const query = useInfiniteQuery({ queryKey: session.key(["alerts", filter]), gcTime: 0, initialPageParam: null as string | null, queryFn: ({ pageParam, signal }) => session.api.request(`/v1/alerts?status=${encodeURIComponent(filter)}&limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`, { schema: alertPage, signal }), getNextPageParam: p => p.nextCursor ?? undefined });
  const failure = query.error instanceof ApiFailure ? query.error : new ApiFailure("processing_failed"), denied = query.isError && ["unauthenticated", "forbidden", "not_found", "session_changed"].includes(failure.code);
  const refresh = () => { void query.refetch(); }, rows = query.data?.pages.flatMap(p => p.data) ?? [];
  const content = rows.length ? <ul className="patient-list">{rows.map(a => <li key={a.id}><Link href={`/escalations/${a.id}`}>Alert {a.patientName}</Link><p>Sumber: F2 akut. Status: {statusLabels[a.status]}</p><p>{a.source.reason}</p><p>Laporan: {visitTime(a.source.reportedAt)}</p></li>)}</ul> : <p>{filter === "all" ? "Belum ada alert dari pasien yang ditugaskan." : "Tidak ada alert yang cocok dengan filter ini. Pilih semua status untuk melihat riwayat."}</p>;
  const state: PanelState = !denied && query.data ? { kind: "content", content, refresh: query.isError ? { kind: "error", failure, onRetry: refresh } : query.isFetching ? { kind: "refreshing" } : { kind: "idle" } } : query.isError ? { kind: "error", failure, onRetry: refresh } : { kind: "loading" };
  return <><h1>Antrean eskalasi</h1><p>Prioritas sumber F2 akut terpisah dari status tindak lanjut. Membuka alert tidak mencatat pengakuan dan tidak mengirim bantuan.</p><div className="clinical-form"><label>Status alert<select value={filter} disabled={denied} onChange={e => setFilter(e.target.value)}><option value="active">Alert aktif</option><option value="all">Semua status</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><AsyncPanel state={state} /><div className="clinical-actions"><Button variant="outline" disabled={query.isFetching} onClick={refresh}>Muat ulang antrean</Button>{query.hasNextPage && <Button variant="outline" disabled={query.isFetching} onClick={() => { void query.fetchNextPage(); }}>Muat alert berikutnya</Button>}</div></>;
}
