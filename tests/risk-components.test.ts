import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { AssessmentReview, RiskEvidenceSummary } from "@/features/risk/assessment-review";
import { PatientSessionData } from "@/features/patients/session-data";
import type { Overview } from "@/features/patients/contracts";

const unavailable = { availability: "unavailable", reason: "domain_source_not_connected" } as const;
const evidence = { id: "synthetic-confirmation", assessmentId: "synthetic-assessment", dischargeId: "source-a", sourceVersion: 1,
  category: "LOW", score: 0, confirmedBy: "nurse-a", confirmedAt: "2026-10-25T07:00:00.000Z", applicable: true,
  disclaimer: "Synthetic component fixture only.", label: "test-fixture", version: 1 } as const;
const overview: Overview = { profile: { id: "p", profile: { displayName: "Synthetic component patient" }, recordedCondition: null, version: 1,
  createdAt: evidence.confirmedAt, updatedAt: evidence.confirmedAt, source: { actorId: "nurse-a", recordedAt: evidence.confirmedAt } },
  currentDischarge: { id: "source-a", patientId: "p", episodeId: "e", version: 1, sourceText: "Synthetic source", createdAt: evidence.confirmedAt, actorId: "nurse-a", patientVersion: 1 },
  confirmedRisk: { status: "confirmed", current: evidence, previous: null }, latestAssessment: null,
  permissions: { managePatient: true, reviewRisk: true, provisionPatient: false, manageAssignments: false }, currentPlan: unavailable,
  latestReport: null, latestAnalysis: null, activeBookingCounts: unavailable, openAlertCounts: unavailable };

test("confirmed zero-score LOW stays explicit without substituting a proposed category", () => {
  const html = renderToStaticMarkup(createElement(RiskEvidenceSummary, { overview })).replace(/<!--.*?-->/g, "");
  expect(html).toContain("LOW"); expect(html).toContain("Skor F1: 0"); expect(html).not.toContain("HIGH");
});
test("invalid F1 retains unavailable copy and a disabled confirmation action", () => {
  const invalid: Overview = { ...overview, confirmedRisk: { status: "unconfirmed", current: null, previous: null }, latestAssessment: {
    id: "invalid", patientId: "p", dischargeId: "source-a", sourceVersion: 1, actorId: "nurse-a", version: 2, state: "INVALID",
    createdAt: evidence.confirmedAt, completedAt: evidence.confirmedAt, output: null, failureCode: "invalid_flow_output",
  } };
  const html = renderToStaticMarkup(createElement(PatientSessionData, { principalId: "nurse-a", csrfToken: "synthetic-component-csrf" },
    createElement(AssessmentReview, { overview: invalid, assessments: [invalid.latestAssessment!], confirmations: [], disabled: false, onRefresh: async () => {} })));
  expect(html).toContain("Keluaran F1 belum valid");
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Konfirmasi kategori belum tersedia<\/button>/);
});
test("historical category is non-applicable while current risk awaits review", () => {
  const html = renderToStaticMarkup(createElement(RiskEvidenceSummary, { overview: { ...overview,
    confirmedRisk: { status: "needs_reassessment", current: null, previous: { ...evidence, applicable: false } } } })).replace(/<!--.*?-->/g, "");
  expect(html).toContain("Perlu penilaian dan konfirmasi ulang"); expect(html).toContain("Kategori sebelumnya: LOW");
  expect(html).not.toContain("Kategori dikonfirmasi:");
});
