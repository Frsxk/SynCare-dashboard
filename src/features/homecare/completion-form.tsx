"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { completionFormSchema, completionTimeIssue, visitTime, type Booking, type BookingTransition } from "./contracts";

export function CompletionForm({ booking, disabled, pending, feedback, onSubmit }: { booking: Booking; disabled: boolean; pending: boolean; feedback: ReactNode; onSubmit: (input: BookingTransition) => void }) {
  const [open, setOpen] = useState(false), dialog = useRef<HTMLDialogElement>(null), title = useId();
  const { register, handleSubmit, setError, clearErrors, formState: { errors } } = useForm<z.infer<typeof completionFormSchema>>({ resolver: zodResolver(completionFormSchema), defaultValues: { completionNote: "" } });
  useEffect(() => { const element = dialog.current; if (!element) return; if (open && !element.open) element.showModal(); if (!open && element.open) element.close(); }, [open]);
  return <section className="clinical-section"><h3>Penyelesaian kunjungan</h3><p>Catat setelah kunjungan dilakukan. Status selesai hanya menutup layanan simulasi.</p>{booking.confirmedSlot && <p>Jadwal mulai: {visitTime(booking.confirmedSlot.startAt)}. Penyelesaian tidak dapat dicatat sebelum waktu ini.</p>}<Button type="button" disabled={disabled} onClick={() => setOpen(true)}>Tandai kunjungan selesai</Button>
    <dialog className="operational-dialog" ref={dialog} aria-labelledby={title} onCancel={event => { event.preventDefault(); if (!pending) setOpen(false); }} onClose={() => setOpen(false)}>
      <h2 id={title}>Konfirmasi penyelesaian kunjungan</h2><p>Waktu selesai dicatat otomatis saat disimpan. Catatan berikut dapat dibaca pasien.</p>
      {feedback}<form className="clinical-form" onSubmit={event => { void handleSubmit(values => {
        const now = Date.now(), issue = completionTimeIssue(booking.confirmedSlot!.startAt, now);
        if (issue) { setError("root.schedule", { type: "validate", message: issue }); return; }
        clearErrors("root.schedule");
        onSubmit({ expectedVersion: booking.version, toStatus: "Completed", completedAt: new Date(now).toISOString(), completionNote: values.completionNote });
      })(event); }}>
        {errors.root?.schedule && <p role="alert">{errors.root.schedule.message}</p>}
        <label>Catatan kunjungan untuk pasien<textarea rows={4} maxLength={2000} disabled={disabled} aria-invalid={!!errors.completionNote} {...register("completionNote")} /></label>{errors.completionNote && <p role="alert">{errors.completionNote.message}</p>}
        <div className="clinical-actions"><Button disabled={disabled}>Simpan penyelesaian</Button><Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Kembali tanpa menyimpan</Button></div>
      </form>
    </dialog></section>;
}
