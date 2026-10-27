import { expect, test } from "vitest";
import { bookingSchema, bookingPage } from "@/features/homecare/contracts";
const booking = () => ({ id: "booking", patientId: "patient", patientName: "Pasien sintetis", service: { id: "service", name: "Kunjungan simulasi", description: "Simulasi DKI", version: 1, synthetic: true, coverageProvince: "DKI Jakarta", coverageCities: ["Jakarta Pusat"], timezone: "Asia/Jakarta" },
  address: { fullAddress: "Alamat uji", kelurahan: "Kelurahan", kecamatan: "Kecamatan", city: "Jakarta Pusat" }, preferredWindow: { startAt: "2030-01-02T01:00:00.000Z", endAt: "2030-01-02T02:00:00.000Z", timezone: "Asia/Jakarta" }, visitNote: "", status: "Requested", version: 1, assignedStaff: null, confirmedSlot: null, completedAt: null, completionNote: null, createdAt: "2026-10-25T00:00:00.000Z", updatedAt: "2026-10-25T00:00:00.000Z", timeline: [] });
test("H3 rejects invented schedule, unknown status, wrong timezone and extra schema", () => {
  expect(bookingSchema.safeParse(booking()).success).toBe(true);
  for (const patch of [{ status: "Unknown" }, { status: "Scheduled" }, { assignedStaff: { id: "nurse", displayName: "Perawat" } }, { confirmedSlot: booking().preferredWindow }, { preferredWindow: { ...booking().preferredWindow, timezone: "UTC" } }, { price: 0 }]) expect(bookingSchema.safeParse({ ...booking(), ...patch }).success).toBe(false);
});
test("H3 empty page is actual empty and malformed receipt does not become Requested", () => {
  expect(bookingPage.parse({ data: [], nextCursor: null, requestId: "test" }).data).toEqual([]);
  expect(bookingSchema.safeParse({ ...booking(), version: 0 }).success).toBe(false);
});
