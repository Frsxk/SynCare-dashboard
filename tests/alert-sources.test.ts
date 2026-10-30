import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { alertDetail, alertSummary } from "@/features/escalations/contracts";
import { AlertSourceEvidence, AlertSourceSummary } from "@/features/escalations/source-evidence";

const now = "2026-10-26T00:00:00.000Z";
const f2Source = { type: "F2", reportId: "report-1", attemptId: "attempt-1", action: "escalate_immediately", reason: "Alasan F2 asli", reportedAt: now, outcomeAt: now };
const requestSource = { type: "PATIENT_REQUEST", requestId: "request-1", action: "request_immediate_help", reason: "Pasien meminta bantuan segera", reportedAt: now, outcomeAt: now };
const base = { id: "alert-1", patientId: "patient-1", patientName: "Pasien sintetis", urgency: "acute", status: "PENDING_REVIEW", version: 1, acknowledgedAt: null, resolvedAt: null, createdAt: now, updatedAt: now };
const detailBase = { ...base, timeline: [], timelineNextCursor: null };
const html = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element).replace(/<!--.*?-->/g, "");

test("PATIENT_REQUEST source is accepted by the same summary/detail contracts and lifecycle", () => {
  expect(alertSummary.safeParse({ ...base, source: requestSource }).success).toBe(true);
  const detail = alertDetail.safeParse({ ...detailBase, source: requestSource });
  expect(detail.success).toBe(true);
  expect(detail.success && detail.data.source).toEqual(requestSource);
  expect(alertDetail.safeParse({ ...detailBase, source: { ...requestSource, outcomeAt: null } }).success).toBe(true);
  for (const patch of [
    { type: "PATIENT_REQUEST", action: "request_immediate_help", reason: "Tanpa id", reportedAt: now },
    { ...requestSource, type: "PATIENT_REQUEST_UNKNOWN" },
    { ...requestSource, action: "escalate_immediately" },
    { ...requestSource, requestId: "" },
    { ...requestSource, reportedAt: "2026-02-30T00:00:00.000Z" },
    { ...requestSource, extra: "field" },
  ]) expect(alertDetail.safeParse({ ...detailBase, source: patch }).success).toBe(false);
});

test("existing F2 source stays byte-compatible and its evidence stays mandatory", () => {
  expect(alertSummary.safeParse({ ...base, source: f2Source }).success).toBe(true);
  expect(alertDetail.safeParse({ ...detailBase, source: f2Source }).success).toBe(true);
  const { attemptId, ...withoutAttempt } = f2Source;
  expect(attemptId).toBe("attempt-1");
  expect(alertDetail.safeParse({ ...detailBase, source: withoutAttempt }).success).toBe(false);
  expect(alertDetail.safeParse({ ...detailBase, source: { ...f2Source, requestId: "request-1" } }).success).toBe(false);
  expect(alertDetail.safeParse({ ...detailBase, source: { ...f2Source, outcomeAt: null } }).success).toBe(false);
});

test("manual patient request renders an urgent label without F2 or check-in source claims", () => {
  const evidence = html(createElement(AlertSourceEvidence, { source: alertDetail.parse({ ...detailBase, source: requestSource }).source }));
  expect(evidence).toContain("Permintaan bantuan mendesak dari pasien");
  expect(evidence).toContain("Pasien meminta bantuan segera");
  expect(evidence).not.toContain("F2");
  expect(evidence).not.toContain("Buka laporan sumber");
  expect(evidence).not.toContain("/monitoring/reports/");
  expect(evidence).not.toContain("attempt-1");
  const summary = html(createElement(AlertSourceSummary, { source: alertSummary.parse({ ...base, source: requestSource }).source, status: "PENDING_REVIEW" }));
  expect(summary).toContain("Permintaan bantuan mendesak dari pasien");
  expect(summary).toContain("Menunggu review");
  expect(summary).not.toContain("F2");
  expect(summary).not.toContain("/monitoring/reports/");
});

test("F2 alert keeps its report link and outcome wording", () => {
  const evidence = html(createElement(AlertSourceEvidence, { source: alertDetail.parse({ ...detailBase, source: f2Source }).source }));
  expect(evidence).toContain("F2 akut");
  expect(evidence).toContain("Hasil F2 dicatat");
  expect(evidence).toContain("/monitoring/reports/report-1");
  expect(evidence).toContain("Buka laporan sumber");
});
