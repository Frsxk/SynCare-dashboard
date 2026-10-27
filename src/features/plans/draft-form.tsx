"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { draftForm, type PlanIntent } from "./contracts";
export function DraftForm({ patientId, assessmentId, disabled, submit }: { patientId: string; assessmentId: string | null; disabled: boolean; submit: (v: PlanIntent) => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof draftForm>>({ resolver: zodResolver(draftForm), defaultValues: { assessmentId: "", followupDate: "", hotline: "" } });
  return <section className="clinical-section"><h2>Buat draf rencana</h2><p>Pilih hasil F1 yang sudah dikonfirmasi untuk sumber aktif. Tanggal dan kontak rutin diisi petugas; keluaran masih memerlukan persetujuan manusia.</p>
    {!assessmentId && <p role="status">Penilaian dan konfirmasi risiko sumber aktif diperlukan sebelum membuat draf.</p>}
    <form className="clinical-form" onSubmit={handleSubmit(body => submit({ kind: "draft", path: `/v1/patients/${patientId}/care-plan-drafts`, body }))}>
      <label>Hasil F1 terkonfirmasi<select disabled={disabled || !assessmentId} {...register("assessmentId")}><option value="">Pilih hasil F1</option>{assessmentId && <option value={assessmentId}>F1 terkonfirmasi untuk sumber aktif</option>}</select></label>{errors.assessmentId && <p role="alert">Pilih hasil F1.</p>}
      <label>Tanggal tindak lanjut rutin<input type="date" disabled={disabled} {...register("followupDate")} /></label>{errors.followupDate && <p role="alert">{errors.followupDate.message}</p>}
      <label>Kontak rutin dari petugas<input disabled={disabled} maxLength={400} {...register("hotline")} /></label>{errors.hotline && <p role="alert">{errors.hotline.message}</p>}
      <Button disabled={disabled || !assessmentId}>Buat draf F3 baru</Button>
    </form></section>;
}
