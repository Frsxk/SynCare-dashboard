"use client";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { AsyncPanel, type PanelState } from "@/components/states/async-panel";
import { Button } from "@/components/ui/button";
import { ApiFailure } from "@/lib/api/client";
import { PatientSessionData, usePatientSession } from "@/features/patients/session-data";
import { checkinPage, monitoringPage, processingLabel } from "./contracts";

type Props = { principalId: string; csrfToken: string };
export function MonitoringPage(props: Props & { patientId?: string }) {
  return <PatientSessionData key={`${props.principalId}:${props.csrfToken}:${props.patientId ?? "monitoring"}`} {...props}><Monitoring patientId={props.patientId} /></PatientSessionData>;
}
function Monitoring({ patientId }: { patientId?: string }) {
  const session = usePatientSession();
  const list = useInfiniteQuery({ queryKey: session.key(["monitoring"]), enabled: !patientId, initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => session.api.request(`/v1/monitoring?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`, { schema: monitoringPage, signal }), getNextPageParam: p => p.nextCursor ?? undefined });
  const history = useInfiniteQuery({ queryKey: session.key(["checkin-history", patientId ?? "none"]), enabled: !!patientId, initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => session.api.request(`/v1/patients/${patientId}/checkins?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`, { schema: checkinPage, signal }), getNextPageParam: p => p.nextCursor ?? undefined });
  const query = patientId ? history : list;
  const failure = query.error instanceof ApiFailure ? query.error : new ApiFailure("processing_failed");
  const denied = query.isError && ["unauthenticated", "forbidden", "not_found", "session_changed"].includes(failure.code);
  const ready = !denied && !!query.data;
  const retry = () => { void query.refetch(); };
  const records = history.data?.pages.flatMap(p => p.data) ?? [];
  const patients = list.data?.pages.flatMap(p => p.data) ?? [];
  const content = patientId ? records.length ? <ul className="patient-list">{records.map(r => <li key={r.id}><Link href={`/monitoring/reports/${r.id}`}>Laporan {r.createdAt}</Link><p>{processingLabel[r.processing.state]}</p><p>{r.outcome?.action === "escalate_immediately" ? "Peringatan mendesak dari F2" : r.outcome?.action === "trigger_plan_review" ? "Perlu tinjauan rencana" : r.message}</p></li>)}</ul>
    : <p>Belum ada laporan pasien ini.</p> : patients.length ? <div className="table-viewport" tabIndex={0} aria-label="Tabel pemantauan pasien"><table><caption>Laporan terbaru pasien yang ditugaskan</caption><thead><tr><th scope="col">Pasien</th><th scope="col">Pemrosesan</th><th scope="col">Laporan</th></tr></thead><tbody>{patients.map(p => <tr key={p.id}>
      <th scope="row"><Link href={`/monitoring/patients/${p.id}`}>{p.profile.displayName}</Link></th><td>{p.latestReport ? processingLabel[p.latestReport.processing.state] : "Belum ada laporan"}</td>
      <td>{p.latestReport ? <Link href={`/monitoring/reports/${p.latestReport.id}`}>{p.latestReport.outcome?.action === "escalate_immediately" ? "Buka laporan mendesak" : "Buka laporan terbaru"}</Link> : "Belum tersedia"}</td></tr>)}</tbody></table></div>
    : <p>Belum ada pasien yang ditugaskan.</p>;
  const state: PanelState = ready ? { kind: "content", content, refresh: query.isError ? { kind: "error", failure, onRetry: retry } : query.isFetching ? { kind: "refreshing" } : { kind: "idle" } }
    : query.isError ? { kind: "error", failure, onRetry: retry } : { kind: "loading" };
  return <>{patientId && <Link href="/monitoring">Kembali ke pemantauan</Link>}<h1>{patientId ? "Riwayat laporan pasien" : "Pemantauan pasien"}</h1><p>Laporan tersimpan dan analisis memiliki status terpisah. Belum ada klaim alert diterima atau bantuan dikirim.</p><AsyncPanel state={state} />
    <div className="clinical-actions"><Button variant="outline" disabled={query.isFetching} onClick={retry}>Muat ulang pemantauan</Button>{query.hasNextPage && <Button variant="outline" disabled={query.isFetching} onClick={() => { void query.fetchNextPage(); }}>Muat berikutnya</Button>}</div></>;
}
