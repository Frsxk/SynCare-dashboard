"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { terminalFormSchema, type Booking, type BookingTransition } from "./contracts";

export function TerminalActionForm({ booking, disabled, onSubmit }: { booking: Booking; disabled: boolean; onSubmit: (input: BookingTransition) => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof terminalFormSchema>>({ resolver: zodResolver(terminalFormSchema), defaultValues: { reason: "" } });
  const send = (toStatus: "Cancelled" | "Rejected") => { void handleSubmit(values => onSubmit({ expectedVersion: booking.version, toStatus, reason: values.reason }))(); };
  return <section className="clinical-section"><h3>Pembatalan atau penolakan</h3><p>Alasan tersimpan dalam riwayat dan dapat dibaca pasien. Setelah ditutup, pengajuan ini tidak dapat dibuka ulang.</p>
    <form className="clinical-form" onSubmit={event => event.preventDefault()}>
      <label>Alasan untuk pasien<textarea rows={3} maxLength={2000} disabled={disabled} aria-invalid={!!errors.reason} {...register("reason")} /></label>{errors.reason && <p role="alert">{errors.reason.message}</p>}
      <div className="clinical-actions"><Button type="button" variant="outline" disabled={disabled} onClick={() => send("Cancelled")}>Batalkan booking</Button>{booking.status === "Under Review" && <Button type="button" variant="outline" disabled={disabled} onClick={() => send("Rejected")}>Tolak pengajuan</Button>}</div>
    </form></section>;
}
