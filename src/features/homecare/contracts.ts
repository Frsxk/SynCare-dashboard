import { z } from "zod";
import { dataEnvelope, pageEnvelope } from "@/lib/api/contracts";
export const bookingStatus = z.enum(["Requested", "Under Review", "Scheduled", "Completed", "Cancelled", "Rejected"]);
const windowSchema = z.object({ startAt: z.string().datetime(), endAt: z.string().datetime(), timezone: z.literal("Asia/Jakarta") }).strict().refine(w => Date.parse(w.endAt) > Date.parse(w.startAt));
export const serviceSchema = z.object({ id: z.string().min(1), name: z.string().min(1), description: z.string().min(1), version: z.number().int().positive(), synthetic: z.literal(true), coverageProvince: z.literal("DKI Jakarta"), coverageCities: z.array(z.string().min(1)).min(1), timezone: z.literal("Asia/Jakarta") }).strict();
export const bookingSchema = z.object({ id: z.string().min(1), patientId: z.string().min(1), patientName: z.string().min(1), service: serviceSchema,
  address: z.object({ fullAddress: z.string().min(1), kelurahan: z.string().min(1), kecamatan: z.string().min(1), city: z.string().min(1) }).strict(),
  preferredWindow: windowSchema, visitNote: z.string(), status: bookingStatus, version: z.number().int().positive(),
  assignedStaff: z.object({ id: z.string().min(1), displayName: z.string().min(1) }).strict().nullable(), confirmedSlot: windowSchema.nullable(),
  completedAt: z.string().datetime().nullable(), completionNote: z.string().nullable(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  timeline: z.array(z.object({ id: z.string().min(1), version: z.number().int().positive(), fromStatus: bookingStatus.nullable(), toStatus: bookingStatus, actorId: z.string().min(1), occurredAt: z.string().datetime(), reason: z.string().nullable(), internalNote: z.string().nullable().optional() }).strict())
}).strict().superRefine((b, ctx) => {
  if ((b.confirmedSlot !== null) !== (b.assignedStaff !== null) || (["Requested", "Under Review", "Rejected"].includes(b.status) && b.confirmedSlot !== null) || (["Scheduled", "Completed"].includes(b.status) && b.confirmedSlot === null)) ctx.addIssue({ code: "custom", message: "Invalid schedule evidence" });
  if (b.status === "Completed" ? !b.completedAt || !b.completionNote?.trim() : b.completedAt !== null || b.completionNote !== null) ctx.addIssue({ code: "custom", message: "Invalid completion evidence" });
});
export const bookingEnvelope = dataEnvelope(bookingSchema);
export const bookingPage = pageEnvelope(bookingSchema);
export const bookingMutation = dataEnvelope(z.object({ resource: bookingSchema, replayed: z.boolean() }).strict());
export const staffPage = pageEnvelope(z.object({ id: z.string().min(1), displayName: z.string().min(1), version: z.number().int().positive() }).strict());
export type BookingTransition = { expectedVersion: number; toStatus: "Under Review" }
  | { expectedVersion: number; toStatus: "Scheduled"; assignedStaffId: string; confirmedSlot: z.infer<typeof windowSchema> }
  | { expectedVersion: number; toStatus: "Completed"; completedAt: string; completionNote: string }
  | { expectedVersion: number; toStatus: "Cancelled" | "Rejected"; reason: string };
export function wibInstant(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) return null;
  const parsed = new Date(`${value.length === 16 ? `${value}:00` : value}+07:00`);
  if (!Number.isFinite(parsed.getTime())) return null;
  const local = new Date(parsed.getTime() + 7 * 3600000).toISOString().slice(0, value.length);
  return local === value ? parsed.toISOString() : null;
}
export const scheduleFormSchema = z.object({ assignedStaffId: z.string().min(1, "Pilih perawat yang ditugaskan."), start: z.string().refine(v => wibInstant(v) !== null, "Isi tanggal dan jam mulai dalam WIB."), end: z.string().refine(v => wibInstant(v) !== null, "Isi tanggal dan jam selesai dalam WIB.") }).superRefine((value, ctx) => {
  const start = wibInstant(value.start), end = wibInstant(value.end);
  if (start && end && end <= start) ctx.addIssue({ code: "custom", path: ["end"], message: "Waktu selesai harus setelah waktu mulai." });
});
export const completionFormSchema = z.object({ completionNote: z.string().trim().min(1, "Isi catatan kunjungan untuk pasien.").max(2000, "Catatan maksimal 2000 karakter.") });
export function completionTimeIssue(startAt: string, now = Date.now()): string | null {
  if (now < Date.parse(startAt)) return "Kunjungan belum dimulai. Status tetap Terjadwal sampai penyelesaian dapat disimpan.";
  return null;
}
export const terminalFormSchema = z.object({ reason: z.string().trim().min(1, "Isi alasan yang dapat dibaca pasien.").max(2000, "Alasan maksimal 2000 karakter.") });
export type Booking = z.infer<typeof bookingSchema>;
export const statusLabels: Record<Booking["status"], string> = { Requested: "Diajukan", "Under Review": "Sedang ditinjau", Scheduled: "Terjadwal", Completed: "Selesai", Cancelled: "Dibatalkan", Rejected: "Ditolak" };
export const visitTime = (value: string) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) + " WIB";
