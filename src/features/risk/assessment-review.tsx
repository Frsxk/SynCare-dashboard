"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiFailure } from "@/lib/api/client";
import { assessmentEnvelope, confirmationMutation, type Assessment, type Overview } from "../patients/contracts";
import { usePatientSession } from "../patients/session-data";

const states = { RUNNING: "Penilaian sedang diproses", SUCCEEDED: "Usulan F1 tersedia", INVALID: "Keluaran F1 belum valid",
  FAILED: "Penilaian gagal diproses", UNKNOWN: "Hasil pemrosesan belum dapat dipastikan" };
const factorLabels: Record<string, string> = { length_of_stay_days: "Lama rawat", admission_type: "Jenis admisi",
  comorbidity_count: "Jumlah komorbid", admissions_prior_12m: "Admisi dalam 12 bulan terakhir" };
function evidenceValue(value: unknown): string {
  return value === null || value === undefined ? "Belum tersedia" : typeof value === "object" ? JSON.stringify(value) : String(value);
}
export function RiskEvidenceSummary({ overview }: { overview: Overview }) {
  const { current, previous, status } = overview.confirmedRisk;
  return <section className="clinical-section" aria-label="Kategori risiko pasien"><h2>Kategori risiko pasien</h2>
    {status === "confirmed" && current ? <><p>Kategori dikonfirmasi: <strong>{current.category}</strong></p><p>Skor F1: {current.score}. Sumber versi {current.sourceVersion}.</p><p>Dikonfirmasi {current.confirmedAt} oleh {current.confirmedBy}.</p><p className="clinical-notice">{current.disclaimer}</p></>
      : <p role="status">{status === "needs_reassessment" ? "Perlu penilaian dan konfirmasi ulang karena sumber berubah." : "Belum ada kategori risiko yang dikonfirmasi perawat."}</p>}
    {previous && <p>Kategori sebelumnya: {previous.category}, sumber versi {previous.sourceVersion}. Riwayat ini tidak berlaku untuk sumber aktif.</p>}
  </section>;
}

export function AssessmentReview({ overview, assessments, confirmations, disabled, onRefresh }: {
  overview: Overview; assessments: Assessment[]; confirmations: Overview["confirmedRisk"]["current"][]; disabled: boolean; onRefresh: () => Promise<unknown>
}) {
  const session = usePatientSession(), intent = useRef<{ source: string; key: string } | null>(null);
  const confirmationIntent = useRef<{ assessment: string; key: string } | null>(null);
  const [phase, setPhase] = useState<"idle" | "running" | "confirming">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const latest = overview.latestAssessment, source = overview.currentDischarge;
  const busy = disabled || phase !== "idle";
  const running = latest?.state === "RUNNING", interrupted = latest?.state === "UNKNOWN";
  const canConfirm = latest?.state === "SUCCEEDED" && latest.output !== null && latest.dischargeId === source?.id && !confirmations.some(c => c?.assessmentId === latest.id);
  const fail = async (error: unknown) => {
    const failure = error instanceof ApiFailure ? error : new ApiFailure("processing_failed");
    setMessage(failure.code === "version_conflict" ? "Data berubah. Data terbaru dimuat; tinjau ulang sebelum mengonfirmasi." : failure.message);
    if (failure.code === "version_conflict" || failure.code === "outcome_unknown") await onRefresh();
  };
  return <section className="clinical-section"><h2>Penilaian F1 dan review perawat</h2>
    <p>Hasil F1 adalah usulan. Kategori pasien aktif memerlukan konfirmasi perawat pada sumber yang sama.</p>
    {!source && <p>Simpan ringkasan pulang sebelum menjalankan penilaian.</p>}
    {running && <p className="clinical-notice" role="status">Penilaian F1 masih tercatat berjalan pada sumber ini. Tunggu hasil atau periksa status terbaru; jangan menjalankan penilaian baru selama statusnya belum pasti.</p>}
    {interrupted && <p className="clinical-notice" role="alert">Penilaian sebelumnya terhenti atau hasilnya tidak dapat dipastikan. Tidak ada skor atau konfirmasi otomatis dari hasil yang hilang. Periksa status terbaru terlebih dahulu; jalankan penilaian baru hanya sebagai keputusan sadar setelah layanan tersedia.</p>}
    {message && <p role="status">{message}</p>}
    <div className="clinical-actions"><Button disabled={busy || !source || running} onClick={async () => {
      if (!source) return;
      setPhase("running"); setMessage(interrupted ? "Menjalankan penilaian baru. Ringkasan pulang tetap tersimpan." : "Menjalankan F1. Ringkasan pulang tetap tersimpan.");
      // An interrupted assessment must never reuse its old intent: a new row is created only by this deliberate click.
      if (interrupted || intent.current?.source !== source.id) intent.current = { source: source.id, key: crypto.randomUUID() };
      try {
        const result = await session.api.request(`/v1/discharges/${source.id}/assessments`, { method: "POST", body: {}, schema: assessmentEnvelope, idempotencyKey: intent.current.key, timeoutMs: 90000 });
        setMessage(states[result.data.state]);
        if (result.data.state !== "RUNNING") intent.current = null;
        await onRefresh();
      } catch (error) { await fail(error); } finally { setPhase("idle"); }
    }}>{phase === "running" ? "Menilai sumber..." : running ? "Penilaian sedang berjalan" : interrupted ? "Jalankan penilaian baru" : "Jalankan penilaian F1"}</Button>
      <Button variant="outline" disabled={busy} onClick={() => { void onRefresh(); }}>{running || interrupted ? "Periksa status penilaian" : "Periksa hasil terbaru"}</Button></div>
    {latest ? <article className="assessment-evidence"><h3>{states[latest.state]}</h3><p>Sumber versi {latest.sourceVersion}. Dicatat {latest.createdAt}.</p>
      {latest.output ? <><p>Usulan kategori: <strong>{latest.output.tier}</strong>. Skor asli F1: {latest.output.score}.</p><p>{latest.output.rationale}</p>
        <h4>Faktor dari F1</h4><dl>{Object.entries(latest.output.risk_factors).map(([name, factor]) => <div key={name}><dt>{factorLabels[name] ?? name}</dt>
          <dd>Nilai: {evidenceValue(factor.value)}. Ambang dari F1: {evidenceValue(factor.threshold)}. Poin: {factor.points}. {factor.met ? "Kriteria terpenuhi." : "Kriteria tidak terpenuhi."}</dd></div>)}</dl>
        <p className="clinical-notice">{latest.output.disclaimer}</p></> : <p>Hasil belum dapat dipakai untuk konfirmasi. Periksa hasil pemrosesan; kategori tidak diperkirakan dari data yang kosong.</p>}
      <Button disabled={busy || !canConfirm} onClick={async () => {
        if (!latest.output || !canConfirm) return;
        setPhase("confirming"); setMessage("Menyimpan konfirmasi...");
        if (confirmationIntent.current?.assessment !== latest.id) confirmationIntent.current = { assessment: latest.id, key: crypto.randomUUID() };
        try {
          await session.api.request(`/v1/assessments/${latest.id}/confirmations`, { method: "POST", body: { category: latest.output.tier, expectedVersion: latest.version },
            schema: confirmationMutation, idempotencyKey: confirmationIntent.current.key });
          confirmationIntent.current = null;
          setMessage("Konfirmasi tersimpan."); await onRefresh();
        } catch (error) { await fail(error); } finally { setPhase("idle"); }
      }}>{phase === "confirming" ? "Menyimpan konfirmasi..." : `Konfirmasi kategori ${latest.output?.tier ?? "belum tersedia"}`}</Button>
    </article> : <p>Belum ada penilaian pada sumber aktif.</p>}
    <h3>Riwayat konfirmasi</h3>{confirmations.length ? <ol>{confirmations.map(c => c && <li key={c.id}>{c.category}, sumber versi {c.sourceVersion}, {c.confirmedAt}. {c.applicable ? "Berlaku untuk sumber aktif." : "Riwayat sumber sebelumnya."}</li>)}</ol> : <p>Belum ada konfirmasi tersimpan.</p>}
    <h3>Riwayat penilaian</h3>{assessments.length ? <ol>{assessments.map(a => <li key={a.id}>{states[a.state]}, sumber versi {a.sourceVersion}, {a.createdAt}{a.output ? `, usulan ${a.output.tier}` : ""}.</li>)}</ol> : <p>Belum ada penilaian tersimpan.</p>}
  </section>;
}
