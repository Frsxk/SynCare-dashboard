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

const assessment = (state: "RUNNING" | "UNKNOWN") => ({ id: `synthetic-${state.toLowerCase()}`, patientId: "p", dischargeId: "source-a",
  sourceVersion: 1, actorId: "nurse-a", version: state === "UNKNOWN" ? 2 : 1, state, createdAt: evidence.confirmedAt,
  completedAt: state === "UNKNOWN" ? evidence.confirmedAt : null, output: null,
  failureCode: state === "UNKNOWN" ? "outcome_unknown" : null });

function reviewHtml(latest: ReturnType<typeof assessment>, confirmed = true) {
  const value: Overview = { ...overview, latestAssessment: latest,
    confirmedRisk: confirmed ? overview.confirmedRisk : { status: "unconfirmed", current: null, previous: null } };
  return renderToStaticMarkup(createElement(PatientSessionData, { principalId: "nurse-a", csrfToken: "synthetic-component-csrf" },
    createElement(AssessmentReview, { overview: value, assessments: [latest], confirmations: confirmed ? [evidence] : [], disabled: false, onRefresh: async () => {} })));
}

test("RUNNING is presented as in progress with no new-assessment action enabled", () => {
  const html = reviewHtml(assessment("RUNNING"));
  expect(html).toContain("Penilaian F1 masih tercatat berjalan");
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Penilaian sedang berjalan<\/button>/);
  expect(html).not.toMatch(/<button[^>]*>Jalankan penilaian baru<\/button>/);
});

test("UNKNOWN states an honest interruption, offers only an explicit new assessment and never confirms it", () => {
  const html = reviewHtml(assessment("UNKNOWN"), false);
  expect(html).toContain("Penilaian sebelumnya terhenti atau hasilnya tidak dapat dipastikan");
  expect(html).toMatch(/<button[^>]*>Jalankan penilaian baru<\/button>/);
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Konfirmasi kategori belum tersedia<\/button>/);
  expect(html).not.toContain("Konfirmasi kategori LOW");
});

test("an earlier valid same-source confirmation remains visible when a later assessment is interrupted", () => {
  const risk = renderToStaticMarkup(createElement(RiskEvidenceSummary, { overview })).replace(/<!--.*?-->/g, "");
  const review = reviewHtml(assessment("UNKNOWN"));
  expect(risk).toContain("Kategori dikonfirmasi: <strong>LOW</strong>");
  expect(review).toContain("Hasil pemrosesan belum dapat dipastikan");
  expect(review).toContain("Berlaku untuk sumber aktif.");
  expect(review).not.toContain("Kategori dikonfirmasi:");
});
