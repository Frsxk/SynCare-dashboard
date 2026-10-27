import { expect, test } from "vitest";
import { completionFormSchema, completionTimeIssue, scheduleFormSchema, terminalFormSchema, wibInstant, staffPage } from "@/features/homecare/contracts";
import { errorEnvelope } from "@/lib/api/contracts";
import { bookingSchema } from "@/features/homecare/contracts";
test("WIB conversion preserves midnight and rejects normalized invalid date/time", () => {
  expect(wibInstant("2030-01-02T00:30")).toBe("2030-01-01T17:30:00.000Z");
  for (const value of ["2030-02-30T08:00", "2030-01-02T24:00", "2030-01-02", "invalid"]) expect(wibInstant(value)).toBeNull();
});
test("schedule requires explicit staff and increasing interval; completion/reason are required", () => {
  const input = { assignedStaffId: "nurse", start: "2030-01-02T00:30", end: "2030-01-02T01:30" };
  expect(scheduleFormSchema.safeParse(input).success).toBe(true);
  expect(scheduleFormSchema.safeParse({ ...input, assignedStaffId: "" }).success).toBe(false);
  expect(scheduleFormSchema.safeParse({ ...input, end: input.start }).success).toBe(false);
  expect(completionFormSchema.safeParse({ completionNote: " " }).success).toBe(false);
  expect(completionFormSchema.parse({ completionNote: "Kunjungan simulasi selesai." })).toEqual({ completionNote: "Kunjungan simulasi selesai." });
  expect(terminalFormSchema.safeParse({ reason: " " }).success).toBe(false);
});
test("bounded empty staff and precise overlap error are recognized without a fallback appointment", () => {
  expect(staffPage.parse({ data: [], nextCursor: null, requestId: "test" }).data).toEqual([]);
  expect(errorEnvelope.safeParse({ error: { code: "booking_schedule_conflict", message: "Jadwal bertabrakan", requestId: "test", retryable: false } }).success).toBe(true);
});
test("completed projection requires actual closure evidence", () => {
  const candidate = { id: "booking", patientId: "patient", patientName: "Pasien sintetis", service: { id: "service", name: "Simulasi", description: "Layanan sintetis", version: 1, synthetic: true, coverageProvince: "DKI Jakarta", coverageCities: ["Jakarta Pusat"], timezone: "Asia/Jakarta" }, address: { fullAddress: "Alamat", kelurahan: "Kelurahan", kecamatan: "Kecamatan", city: "Jakarta Pusat" }, preferredWindow: { startAt: "2030-01-02T01:00:00.000Z", endAt: "2030-01-02T02:00:00.000Z", timezone: "Asia/Jakarta" }, status: "Completed", visitNote: "", version: 4, assignedStaff: { id: "nurse", displayName: "Perawat" }, confirmedSlot: { startAt: "2030-01-02T01:00:00.000Z", endAt: "2030-01-02T02:00:00.000Z", timezone: "Asia/Jakarta" }, completedAt: null, completionNote: null, createdAt: "2026-10-25T00:00:00.000Z", updatedAt: "2026-10-25T00:00:00.000Z", timeline: [] };
  expect(bookingSchema.safeParse(candidate).success).toBe(false);
  expect(bookingSchema.safeParse({ ...candidate, completedAt: "2030-01-02T02:05:00.000Z", completionNote: "Catatan simulasi." }).success).toBe(true);
});

test("automatic completion time rejects an upcoming visit and accepts a started visit", () => {
  const start = "2030-01-02T01:00:00.000Z", now = Date.parse("2030-01-02T02:00:00.000Z");
  expect(completionTimeIssue(start, Date.parse(start) - 1)).toContain("Status tetap Terjadwal");
  expect(completionTimeIssue(start, Date.parse(start))).toBeNull();
  expect(completionTimeIssue(start, now)).toBeNull();
});
