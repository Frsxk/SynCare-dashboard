"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { AsyncPanel, type PanelState } from "@/components/states/async-panel";
import { ApiFailure } from "@/lib/api/client";
import { PatientSessionData, usePatientSession } from "@/features/patients/session-data";
import { checkinEnvelope, guidanceEnvelope, processingLabel, type CheckinRecord } from "./contracts";

export function ReportContent({ report }: { report: CheckinRecord }) {
  const outcome = report.outcome;
  return <article className="clinical-section" aria-label="Detail laporan pasien">{outcome?.action === "escalate_immediately" && <UrgentReportNotice report={report} />}<h2>Laporan tersimpan</h2>
    <p>ID laporan: {report.id}</p><p>Pasien: {report.patientId}</p><p>Waktu kirim: {report.createdAt}</p>
    <p role="status">{processingLabel[report.processing.state]}</p><p className="stored-source">{report.message}</p>
    {outcome && outcome.action !== "escalate_immediately" ? <section><h3>Hasil F2</h3><p>Kategori analisis: {outcome.tier}. Skor: {outcome.score}.</p><p>{outcome.action === "trigger_plan_review" ? "Perlu tinjauan rencana oleh perawat." : "Lanjut pemantauan sesuai hasil F2."}</p>
        <p>Interval check-in demo: {outcome.next_checkin_days} hari.</p><p>Label: {outcome.label}</p><p>{outcome.disclaimer}</p>
        <dl>{outcome.adjustments.map((a, i) => <div key={i}><dt>{a.condition}</dt><dd>Diterapkan: {a.applied ? "ya" : "tidak"}. Poin: {a.points}.</dd></div>)}</dl></section> : null}
    {report.baseline ? <p>Baseline asli F1: {report.baseline.score}. Penilaian: {report.baseline.assessmentId}. Sumber versi {report.baseline.sourceVersion}.
      {!report.baseline.applicable && " Sumber ini sudah menjadi riwayat."}</p> : <p>Baseline F1 terkonfirmasi belum tersedia; laporan tetap tersimpan dan belum dianalisis.</p>}
    <p>Hasil F2 ini tidak mengganti kategori F1 yang dikonfirmasi perawat.</p>
  </article>;
}
export function UrgentReportNotice({ report }: { report: CheckinRecord }) {
  return report.outcome?.action === "escalate_immediately" ? <section className="clinical-notice urgent-notice" aria-label="Peringatan mendesak"><h2>Peringatan mendesak dari F2</h2><p>Waktu laporan: {report.createdAt}</p><p role="alert">{report.outcome.reason}</p>
    <p>{report.alertEvidence === "queued" ? "Pekerjaan pencatatan alert tersimpan. Buka antrean eskalasi untuk melihat catatan tindak lanjut. Ini tidak berarti bantuan dikirim." : "Penyimpanan pekerjaan alert belum terkonfirmasi. Peringatan tetap berlaku."}</p><Link href="/escalations">Buka antrean eskalasi</Link><UrgentGuidance /></section> : null;
}
function UrgentGuidance() {
  const session = usePatientSession();
  const guidance = useQuery(session.options(["emergency-guidance"], "/v1/emergency-guidance", guidanceEnvelope));
  const data = guidance.data?.data;
  return data ? <><p>{data.content}</p><p>Demo hanya menampilkan informasi; tidak melakukan panggilan.</p>{data.contacts.map(c => <p key={c.number}>{c.label}: {c.number}</p>)}
    <p>Wilayah: {data.region}. Diverifikasi: {data.verifiedAt}. Versi {data.version}.</p><a href={data.source} target="_blank" rel="noreferrer">Sumber panduan</a></>
    : <><p>Segera cari pertolongan medis langsung. Jangan menunggu balasan aplikasi.</p><p>Kontak darurat terverifikasi belum tersedia.</p>{guidance.isError && <Button variant="outline" onClick={() => { void guidance.refetch(); }}>Muat panduan lagi</Button>}</>;
}
export function ReportDetailPage(props: { principalId: string; csrfToken: string; checkinId: string }) {
  return <PatientSessionData key={`${props.principalId}:${props.csrfToken}`} {...props}><ReportDetail checkinId={props.checkinId} /></PatientSessionData>;
}
function ReportDetail({ checkinId }: { checkinId: string }) {
  const session = usePatientSession();
  const query = useQuery({ ...session.options(["checkin", checkinId], `/v1/checkins/${checkinId}`, checkinEnvelope),
    refetchInterval: q => q.state.data && ["PENDING", "RUNNING"].includes(q.state.data.data.processing.state) && q.state.dataUpdateCount < 60 ? 2000 : false });
  const failure = query.error instanceof ApiFailure ? query.error : new ApiFailure("processing_failed");
  const denied = query.isError && ["unauthenticated", "forbidden", "not_found", "session_changed"].includes(failure.code);
  const data = denied ? undefined : query.data?.data;
  const retry = () => { void query.refetch(); };
  const state: PanelState = data ? { kind: "content", content: <><Link href={`/monitoring/patients/${data.patientId}`}>Riwayat pasien ini</Link><ReportContent report={data} />
    <Button variant="outline" onClick={retry} disabled={query.isFetching}>Muat ulang status laporan</Button></>, refresh: query.isError ? { kind: "error", failure, onRetry: retry } : query.isFetching ? { kind: "refreshing" } : { kind: "idle" } }
    : query.isError ? { kind: "error", failure, onRetry: retry } : { kind: "loading" };
  return <><Link href="/monitoring">Kembali ke pemantauan</Link><h1>Detail laporan</h1><AsyncPanel state={state} /></>;
}
