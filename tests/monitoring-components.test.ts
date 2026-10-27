import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ReportContent } from "@/features/monitoring/report-detail";
import { checkinSchema } from "@/features/monitoring/contracts";
import { PatientSessionData } from "@/features/patients/session-data";
const base = { id: "report-unit", patientId: "patient-unit", message: "Unit synthetic report", submittedBy: "account-unit", createdAt: "2026-10-25T00:00:00Z", version: 1,
  baseline: null, processing: { id: "attempt-unit", state: "UNKNOWN", version: 3, updatedAt: "2026-10-25T00:00:00Z", failureCode: "outcome_unknown" }, outcome: null, alertEvidence: "not_applicable" };
test("saved report and unknown processing never substitute an analyzed score or received claim", () => {
  const html = renderToStaticMarkup(createElement(ReportContent, { report: checkinSchema.parse(base) })).replace(/<!--.*?-->/g, "");
  expect(html).toContain("Laporan tersimpan"); expect(html).toContain("belum dapat dipastikan"); expect(html).not.toContain("Skor: 0"); expect(html).not.toContain("Analisis selesai");
  const failed = renderToStaticMarkup(createElement(ReportContent, { report: checkinSchema.parse({ ...base, processing: { ...base.processing, state: "FAILED", failureCode: "dependency_unavailable" } }) }));
  expect(failed).toContain("Analisis belum berhasil"); expect(failed).not.toContain("Skor: 0");
});
test("known urgent remains visible without alert persistence or guidance; no telephone action", () => {
  const report = checkinSchema.parse({ ...base, processing: { ...base.processing, state: "SUCCEEDED", failureCode: null }, outcome: { action: "escalate_immediately", reason: "Unit server urgent quote" }, alertEvidence: "unavailable" });
  const html = renderToStaticMarkup(createElement(PatientSessionData, { principalId: "unit", csrfToken: "unit-generation" }, createElement(ReportContent, { report }))).replace(/<!--.*?-->/g, "");
  expect(html).toContain("Unit server urgent quote"); expect(html).toContain("belum terkonfirmasi"); expect(html).toContain("Jangan menunggu balasan aplikasi"); expect(html).not.toContain("tel:"); expect(html).not.toContain("119");
});
test("malformed success without outcome cannot enter client cache", () => {
  expect(checkinSchema.safeParse({ ...base, processing: { ...base.processing, state: "SUCCEEDED" } }).success).toBe(false);
});
