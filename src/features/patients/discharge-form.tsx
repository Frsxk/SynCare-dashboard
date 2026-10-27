"use client";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { applyFormFailure, dischargeResolver } from "@/lib/forms/contracts";
import { ApiFailure } from "@/lib/api/client";
import { dischargeMutation, type Overview } from "./contracts";
import { usePatientSession } from "./session-data";

export function DischargeForm({ overview, disabled, onSaved }: { overview: Overview; disabled: boolean; onSaved: () => Promise<unknown> }) {
  const session = usePatientSession();
  const intent = useRef<{ text: string; key: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<{ sourceText: string }>({ resolver: dischargeResolver,
    defaultValues: { sourceText: overview.currentDischarge?.sourceText ?? "" } });
  return <section className="clinical-section"><h2>Ringkasan pulang</h2>
    <p>{overview.currentDischarge ? `Sumber aktif: versi ${overview.currentDischarge.version}.` : "Belum ada ringkasan pulang tersimpan."} Setiap penyimpanan membuat versi baru dan memerlukan penilaian serta konfirmasi ulang.</p>
    {overview.currentDischarge?.sourceText && <details><summary>Lihat sumber tersimpan</summary><p className="stored-source">{overview.currentDischarge.sourceText}</p></details>}
    <form className="clinical-form" onSubmit={event => { void handleSubmit(async values => {
      setSaved(false);
      const body = { sourceText: values.sourceText, expectedPatientVersion: overview.profile.version }, text = JSON.stringify(body);
      if (intent.current?.text !== text) intent.current = { text, key: crypto.randomUUID() };
      try {
        await session.api.request(`/v1/patients/${overview.profile.id}/discharges`, { method: "POST", body, schema: dischargeMutation, idempotencyKey: intent.current.key });
        setSaved(true); intent.current = null; await onSaved();
      } catch (error) {
        applyFormFailure(setError, error);
        if (error instanceof ApiFailure && error.code === "version_conflict") await onSaved();
      }
    })(event); }}>
      <label>Teks ringkasan pulang<textarea rows={8} maxLength={64000} {...register("sourceText")} /></label>
      {errors.sourceText && <p role="alert">{errors.sourceText.message}</p>}
      {errors.root?.server && <p role="alert">{errors.root.server.message} Isian dipertahankan; tinjau ulang sumber sebelum menyimpan lagi.</p>}
      {saved && <p role="status">Versi baru tersimpan. Penilaian F1 dan konfirmasi perawat diperlukan.</p>}
      <Button disabled={disabled || isSubmitting}>{isSubmitting ? "Menyimpan sumber..." : "Simpan versi baru"}</Button>
    </form></section>;
}
