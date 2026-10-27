"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { wibInstant } from "@/features/homecare/contracts";
import { actionTypes, actionTypeLabels, followupForm, resolutionForm, type AlertAction, type AlertDetail } from "./contracts";

export function AlertActionForms({ alert, disabled, onSubmit, followupRevision }: { alert: AlertDetail; disabled: boolean; onSubmit: (value: AlertAction) => void; followupRevision: number }) {
  return <>{alert.status === "PENDING_REVIEW" && <section className="clinical-section"><h2>Pengakuan alert</h2><p>Catat bahwa Anda telah meninjau alert ini. Tindakan ini tidak mengirim bantuan atau menghubungi pasien.</p><Button disabled={disabled} onClick={() => onSubmit({ action: "acknowledge", expectedVersion: alert.version })}>Akui alert</Button></section>}
    {["ACKNOWLEDGED", "IN_PROGRESS"].includes(alert.status) && <FollowupForm key={followupRevision} alert={alert} disabled={disabled} onSubmit={onSubmit} />}
    {alert.status === "IN_PROGRESS" && <ResolutionForm alert={alert} disabled={disabled} onSubmit={onSubmit} />}</>;
}
function FollowupForm({ alert, disabled, onSubmit }: { alert: AlertDetail; disabled: boolean; onSubmit: (value: AlertAction) => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof followupForm>>({ resolver: zodResolver(followupForm), defaultValues: { occurredAt: "", note: "", patientSummary: "" } });
  return <section className="clinical-section"><h2>Catat tindak lanjut</h2><p>Pilih tindakan yang benar-benar Anda catat. Upaya kontak tidak menyatakan panggilan tersambung. Catatan internal tidak dikirim ke pasien.</p><form className="clinical-form" onSubmit={handleSubmit(v => onSubmit({ action: "follow_up", expectedVersion: alert.version, actionType: v.actionType, occurredAt: wibInstant(v.occurredAt)!, note: v.note, ...(v.patientSummary ? { patientSummary: v.patientSummary } : {}) }))}>
    <label>Jenis tindakan<select disabled={disabled} aria-invalid={!!errors.actionType} defaultValue="" {...register("actionType")}><option value="" disabled>Pilih tindakan yang dicatat</option>{actionTypes.map(type => <option key={type} value={type}>{actionTypeLabels[type]}</option>)}</select></label>{errors.actionType && <p role="alert">{errors.actionType.message}</p>}
    <label>Waktu tindakan (WIB)<input type="datetime-local" step="1" disabled={disabled} aria-invalid={!!errors.occurredAt} {...register("occurredAt")} /></label>{errors.occurredAt && <p role="alert">{errors.occurredAt.message}</p>}
    <label>Catatan tindakan internal<textarea rows={3} maxLength={4000} disabled={disabled} aria-invalid={!!errors.note} {...register("note")} /></label>{errors.note && <p role="alert">{errors.note.message}</p>}
    <label>Ringkasan tindak lanjut untuk pasien (opsional)<textarea rows={3} maxLength={4000} disabled={disabled} {...register("patientSummary")} /></label><p>Isi hanya informasi yang ingin Anda publikasikan kepada pasien.</p>
    <Button type="submit" disabled={disabled}>Simpan tindak lanjut</Button></form></section>;
}
function ResolutionForm({ alert, disabled, onSubmit }: { alert: AlertDetail; disabled: boolean; onSubmit: (value: AlertAction) => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof resolutionForm>>({ resolver: zodResolver(resolutionForm), defaultValues: { note: "", patientSummary: "" } });
  return <section className="clinical-section"><h2>Tutup proses tindak lanjut</h2><p>Penutupan mengakhiri proses operasional ini dan tidak menyatakan pasien sembuh. Alert yang ditutup tidak dapat dibuka ulang.</p><form className="clinical-form" onSubmit={handleSubmit(v => onSubmit({ action: "resolve", expectedVersion: alert.version, note: v.note, ...(v.patientSummary ? { patientSummary: v.patientSummary } : {}) }))}>
    <label>Ringkasan penutupan internal<textarea rows={3} maxLength={4000} disabled={disabled} aria-invalid={!!errors.note} {...register("note")} /></label>{errors.note && <p role="alert">{errors.note.message}</p>}
    <label>Ringkasan penutupan untuk pasien (opsional)<textarea rows={3} maxLength={4000} disabled={disabled} {...register("patientSummary")} /></label><p>Ringkasan untuk pasien dipublikasikan hanya jika Anda mengisinya.</p>
    <Button type="submit" disabled={disabled}>Tutup alert</Button></form></section>;
}
