"use client";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { applyFormFailure } from "@/lib/forms/contracts";
import { ApiFailure } from "@/lib/api/client";
import { patientMutation, profileFormSchema, type Patient, type ProfileInput } from "./contracts";
import { usePatientSession } from "./session-data";

export function PatientForm({ patient, disabled = false, onSaved, onConflict }: { patient?: Patient; disabled?: boolean; onSaved: () => Promise<unknown>; onConflict?: () => Promise<unknown> }) {
  const session = usePatientSession();
  const intent = useRef<{ text: string; key: string } | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<ProfileInput>({ resolver: zodResolver(profileFormSchema),
    defaultValues: { displayName: patient?.profile.displayName ?? "", recordedCondition: patient?.recordedCondition ?? "" } });
  return <section className="clinical-section"><h2>{patient ? "Profil pasien" : "Daftarkan profil pasien"}</h2>
    {patient && <p>Data tersimpan versi {patient.version}: {patient.profile.displayName}. Kondisi: {patient.recordedCondition ?? "Belum dicatat."}</p>}
    <form className="clinical-form" onSubmit={event => { void handleSubmit(async values => {
      setReceipt(null);
      const body = patient ? { expectedVersion: patient.version, profile: { displayName: values.displayName }, recordedCondition: values.recordedCondition || null }
        : { profile: { displayName: values.displayName }, initialCondition: values.recordedCondition || null };
      const text = JSON.stringify(body);
      if (intent.current?.text !== text) intent.current = { text, key: crypto.randomUUID() };
      try {
        const result = await session.api.request(patient ? `/v1/patients/${patient.id}` : "/v1/patients", {
          method: patient ? "PATCH" : "POST", body, schema: patientMutation, idempotencyKey: intent.current.key,
        });
        setReceipt(patient ? "Profil tersimpan." : `Profil tersimpan dengan ID ${result.data.resource.id}. Operator perlu menetapkan penugasan sebelum profil dapat dibuka dan akun pasien diaktifkan.`);
        intent.current = null;
        await onSaved();
      } catch (error) {
        applyFormFailure(setError, error);
        if (error instanceof ApiFailure && error.code === "version_conflict") await onConflict?.();
      }
    })(event); }}>
      <label>Nama pasien<input autoComplete="off" maxLength={160} {...register("displayName")} /></label>
      {errors.displayName && <p role="alert">{errors.displayName.message}</p>}
      <label>Kondisi yang dicatat perawat<textarea rows={3} maxLength={4000} {...register("recordedCondition")} /></label>
      {errors.recordedCondition && <p role="alert">{errors.recordedCondition.message}</p>}
      {errors.root?.server && <p role="alert">{errors.root.server.message} Tinjau data terbaru sebelum mengirim lagi.</p>}
      {receipt && <p role="status">{receipt}</p>}
      <Button disabled={disabled || isSubmitting}>{isSubmitting ? "Menyimpan profil..." : patient ? "Simpan profil" : "Buat profil pasien"}</Button>
    </form></section>;
}
