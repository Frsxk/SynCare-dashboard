"use client";
import Link from "next/link";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { AsyncPanel, type PanelState } from "@/components/states/async-panel";
import { ApiFailure } from "@/lib/api/client";
import { PatientSessionData, usePatientSession } from "./session-data";
import { assessmentPage, overviewEnvelope, patientPage } from "./contracts";
import { PatientForm } from "./patient-form";
import { DischargeForm } from "./discharge-form";
import { AssessmentReview, RiskEvidenceSummary } from "../risk/assessment-review";
import { UrgentReportNotice } from "../monitoring/report-detail";

type SessionProps = { principalId: string; csrfToken: string };
function failure(error: unknown) { return error instanceof ApiFailure ? error : new ApiFailure("processing_failed"); }
export function RegistryPage(props: SessionProps & { canManage: boolean }) {
  return <PatientSessionData key={`${props.principalId}:${props.csrfToken}`} {...props}><Registry canManage={props.canManage} /></PatientSessionData>;
}
function Registry({ canManage }: { canManage: boolean }) {
  const session = usePatientSession();
  const query = useInfiniteQuery({ queryKey: session.key(["patients"]), initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => session.api.request(`/v1/patients?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`, { schema: patientPage, signal }),
    getNextPageParam: page => page.nextCursor ?? undefined });
  const patients = query.data?.pages.flatMap(page => page.data);
  const state: PanelState = patients ? { kind: "content", content: patients.length ? <><ul className="patient-list">{patients.map(p => <li key={p.id}><Link href={`/patients/${p.id}`}>{p.profile.displayName}</Link><p>{p.recordedCondition ?? "Belum ada kondisi tercatat."}</p></li>)}</ul>
    {query.hasNextPage && <Button variant="outline" disabled={query.isFetchingNextPage} onClick={() => { void query.fetchNextPage(); }}>Muat pasien berikutnya</Button>}</> : <p>Belum ada pasien yang ditugaskan kepada akun ini.</p>,
    refresh: query.isError ? { kind: "error", failure: failure(query.error), onRetry: () => { void query.refetch(); } } : query.isFetching ? { kind: "refreshing" } : { kind: "idle" } }
    : query.isError ? { kind: "error", failure: failure(query.error), onRetry: () => { void query.refetch(); } } : { kind: "loading" };
  return <><h1>Pasien yang ditugaskan</h1><p>Buka pasien untuk melihat profil, sumber dan konfirmasi risiko.</p><AsyncPanel state={state} />
    {canManage && <PatientForm onSaved={() => query.refetch()} />}</>;
}
export function PatientDetailPage(props: SessionProps & { patientId: string }) {
  return <PatientSessionData key={`${props.principalId}:${props.csrfToken}:${props.patientId}`} {...props}><PatientDetail patientId={props.patientId} /></PatientSessionData>;
}
function PatientDetail({ patientId }: { patientId: string }) {
  const session = usePatientSession();
  const overview = useQuery(session.options(["overview", patientId], `/v1/patients/${patientId}/overview`, overviewEnvelope));
  const history = useInfiniteQuery({ queryKey: session.key(["assessments", patientId]), initialPageParam: null as string | null,
    enabled: overview.data?.data.permissions.reviewRisk === true,
    queryFn: ({ pageParam, signal }) => session.api.request(`/v1/patients/${patientId}/assessments?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`, { schema: assessmentPage, signal }),
    getNextPageParam: page => page.nextCursor ?? undefined });
  const refresh = async () => { await Promise.all([overview.refetch(), overview.data?.data.permissions.reviewRisk ? history.refetch() : Promise.resolve()]); };
  const denied = overview.isError && ["unauthenticated", "forbidden", "not_found", "session_changed"].includes(failure(overview.error).code);
  const data = denied ? undefined : overview.data?.data;
  const content = data && <><h1>{data.profile.profile.displayName}</h1>{data.latestReport && <UrgentReportNotice report={data.latestReport} />}<RiskEvidenceSummary overview={data} />
    {data.permissions.managePatient ? <><PatientForm key={data.profile.id} patient={data.profile} disabled={overview.isFetching} onSaved={refresh} onConflict={refresh} />
      <DischargeForm overview={data} disabled={overview.isFetching} onSaved={refresh} /></> : <p>{data.profile.recordedCondition ?? "Belum ada kondisi tercatat."}</p>}
    {data.permissions.reviewRisk && <><AssessmentReview overview={data} assessments={history.data?.pages.flatMap(page => page.data) ?? []}
      confirmations={history.data?.pages[0]?.confirmations ?? []} disabled={overview.isFetching || history.isFetching || !history.data} onRefresh={refresh} />
      {history.isError && <AsyncPanel state={{ kind: "error", failure: failure(history.error), onRetry: () => { void history.refetch(); } }} />}
      {history.hasNextPage && <Button variant="outline" disabled={history.isFetching} onClick={() => { void history.fetchNextPage(); }}>Muat penilaian berikutnya</Button>}</>}
    <section className="clinical-section"><h2>Laporan pasien</h2><Link href={`/monitoring/patients/${patientId}`}>Buka riwayat laporan pasien</Link>
      {data.latestReport ? <p>Laporan terakhir: <Link href={`/monitoring/reports/${data.latestReport.id}`}>{data.latestReport.createdAt}</Link>. Status {data.latestReport.processing.state}.</p> : <p>Belum ada laporan.</p>}
      <p><Link href={`/patients/${patientId}/care-plan`}>Buka draf dan review rencana perawatan</Link></p><p>Jumlah booking dan alert belum tersedia pada ringkasan ini.</p></section></>;
  const state: PanelState = data ? { kind: "content", content, refresh: overview.isError ? { kind: "error", failure: failure(overview.error), onRetry: () => { void refresh(); } }
    : overview.isFetching ? { kind: "refreshing" } : { kind: "idle" } }
    : overview.isError ? { kind: "error", failure: failure(overview.error), onRetry: () => { void refresh(); } } : { kind: "loading" };
  return <><Link href="/patients">Kembali ke daftar pasien</Link><AsyncPanel state={state} /></>;
}
