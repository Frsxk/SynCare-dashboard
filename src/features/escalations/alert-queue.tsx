"use client";
import Link from "next/link";
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { AsyncPanel, type PanelState } from "@/components/states/async-panel";
import { Button } from "@/components/ui/button";
import { ApiFailure } from "@/lib/api/client";
import { PatientSessionData, usePatientSession } from "@/features/patients/session-data";
import { alertPage, statusLabels } from "./contracts";
import { AlertSourceSummary } from "./source-evidence";
export function AlertQueuePage(props: { principalId: string; csrfToken: string }) { return <PatientSessionData key={`${props.principalId}:${props.csrfToken}`} {...props}><AlertQueue /></PatientSessionData>; }
function AlertQueue() {
  const session = usePatientSession(), [filter, setFilter] = useState("active");
  const query = useInfiniteQuery({ queryKey: session.key(["alerts", filter]), gcTime: 0, refetchInterval: 5000, refetchIntervalInBackground: false, initialPageParam: null as string | null, queryFn: ({ pageParam, signal }) => session.api.request(`/v1/alerts?status=${encodeURIComponent(filter)}&limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`, { schema: alertPage, signal }), getNextPageParam: p => p.nextCursor ?? undefined });
  const failure = query.error instanceof ApiFailure ? query.error : new ApiFailure("processing_failed"), denied = query.isError && ["unauthenticated", "forbidden", "not_found", "session_changed"].includes(failure.code);
  const refresh = () => { void query.refetch(); }, rows = query.data?.pages.flatMap(p => p.data) ?? [];
  const content = rows.length ? <ul className="patient-list">{rows.map(a => <li key={a.id}><Link href={`/escalations/${a.id}`}>Alert {a.patientName}</Link><AlertSourceSummary source={a.source} status={a.status} /></li>)}</ul> : <p>{filter === "all" ? "Belum ada alert dari pasien yang ditugaskan." : "Tidak ada alert yang cocok dengan filter ini. Pilih semua status untuk melihat riwayat."}</p>;
  const state: PanelState = !denied && query.data ? { kind: "content", content, refresh: query.isError ? { kind: "error", failure, onRetry: refresh } : query.isFetching ? { kind: "refreshing" } : { kind: "idle" } } : query.isError ? { kind: "error", failure, onRetry: refresh } : { kind: "loading" };
  return <><h1>Antrean eskalasi</h1><p>Sumber alert (hasil F2 akut atau permintaan bantuan pasien) terpisah dari status tindak lanjut. Membuka alert tidak mencatat pengakuan dan tidak mengirim bantuan.</p><p>Antrean diperbarui otomatis setiap 5 detik saat halaman aktif.</p>{!denied && query.data && <p role="status" aria-live="polite">{rows.filter(a => a.source.type === "PATIENT_REQUEST" && a.status === "PENDING_REVIEW").length} permintaan bantuan pasien menunggu review pada daftar ini.</p>}<div className="clinical-form"><label>Status alert<select value={filter} disabled={denied} onChange={e => setFilter(e.target.value)}><option value="active">Alert aktif</option><option value="all">Semua status</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><AsyncPanel state={state} /><div className="clinical-actions"><Button variant="outline" disabled={query.isFetching} onClick={refresh}>Muat ulang antrean</Button>{query.hasNextPage && <Button variant="outline" disabled={query.isFetching} onClick={() => { void query.fetchNextPage(); }}>Muat alert berikutnya</Button>}</div></>;
}
