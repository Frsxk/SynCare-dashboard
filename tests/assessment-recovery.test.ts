// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AssessmentReview, RiskEvidenceSummary } from "@/features/risk/assessment-review";
import { PatientSessionData } from "@/features/patients/session-data";
import type { Assessment, Overview } from "@/features/patients/contracts";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const at = "2026-10-25T07:00:00.000Z";
const evidence = { id: "confirmation-a", assessmentId: "assessment-a", dischargeId: "source-a", sourceVersion: 1,
  category: "LOW" as const, score: 0, confirmedBy: "nurse-a", confirmedAt: at, applicable: true,
  disclaimer: "Synthetic component fixture only.", label: "test-fixture", version: 1 };
const overview = (latest: Assessment | null, confirmed = false): Overview => ({
  profile: { id: "p", profile: { displayName: "Synthetic recovery patient" }, recordedCondition: null, version: 1, createdAt: at, updatedAt: at, source: { actorId: "nurse-a", recordedAt: at } },
  currentDischarge: { id: "source-a", patientId: "p", episodeId: "episode-a", version: 1, sourceText: "Synthetic source", createdAt: at, actorId: "nurse-a", patientVersion: 1 },
  confirmedRisk: confirmed ? { status: "confirmed", current: evidence, previous: null } : { status: "unconfirmed", current: null, previous: null },
  latestAssessment: latest,
  permissions: { managePatient: true, reviewRisk: true, provisionPatient: false, manageAssignments: false },
  currentPlan: { availability: "unavailable", reason: "domain_source_not_connected" },
  latestReport: null, latestAnalysis: null,
  activeBookingCounts: { availability: "unavailable", reason: "domain_source_not_connected" },
  openAlertCounts: { availability: "unavailable", reason: "domain_source_not_connected" },
});
const assessment = (state: "RUNNING" | "UNKNOWN", id: string): Assessment => ({
  id, patientId: "p", dischargeId: "source-a", sourceVersion: 1, actorId: "nurse-a",
  version: state === "UNKNOWN" ? 2 : 1, state, createdAt: at, completedAt: state === "UNKNOWN" ? at : null,
  output: null, failureCode: state === "UNKNOWN" ? "outcome_unknown" : null,
});

function tree(value: Overview, refresh: () => Promise<unknown>) {
  return createElement(PatientSessionData, { principalId: "nurse-a", csrfToken: "synthetic-csrf" },
    createElement(AssessmentReview, { overview: value, assessments: value.latestAssessment ? [value.latestAssessment] : [],
      confirmations: value.confirmedRisk.current ? [value.confirmedRisk.current] : [], disabled: false, onRefresh: refresh }));
}

test("UNKNOWN is recovered only by an explicit click that creates a fresh intent; render and status refresh are read-only", async () => {
  const keys: string[] = [];
  const transport = vi.fn<typeof fetch>(async () => {
    const body = { data: assessment("RUNNING", "assessment-b"), requestId: "synthetic-request" };
    return Response.json(body);
  });
  vi.stubGlobal("fetch", transport);
  const refresh = vi.fn(async () => {});
  const interrupted = overview(assessment("UNKNOWN", "assessment-a"));
  const view = render(tree(interrupted, refresh));

  expect(transport).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Periksa status penilaian" }));
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  expect(transport).not.toHaveBeenCalled();
  expect(screen.getByText(/Penilaian sebelumnya terhenti atau hasilnya tidak dapat dipastikan/)).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Jalankan penilaian baru" }));
  await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
  const [url, init] = transport.mock.calls[0]!;
  expect(String(url)).toBe("/api/syncare/v1/discharges/source-a/assessments");
  expect(init?.method).toBe("POST");
  expect(JSON.parse(String(init?.body))).toEqual({});
  const key = new Headers(init?.headers).get("idempotency-key")!;
  expect(key).toMatch(/^[0-9a-f-]{36}$/i);
  keys.push(key);

  await waitFor(() => expect(screen.getByText("Penilaian sedang diproses")).toBeDefined());
  view.rerender(tree(overview(assessment("RUNNING", "assessment-b")), refresh));
  fireEvent.click(screen.getByRole("button", { name: "Penilaian sedang berjalan" }));
  expect(transport).toHaveBeenCalledTimes(1);
  const refreshesBeforeStatus = refresh.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Periksa status penilaian" }));
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(refreshesBeforeStatus + 1));
  expect(transport).toHaveBeenCalledTimes(1);

  view.rerender(tree(overview(assessment("UNKNOWN", "assessment-b")), refresh));
  fireEvent.click(screen.getByRole("button", { name: "Jalankan penilaian baru" }));
  await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
  keys.push(new Headers(transport.mock.calls[1]![1]?.headers).get("idempotency-key")!);
  expect(keys[1]).not.toBe(keys[0]);
});

test("an interrupted assessment cannot confirm and does not erase an earlier valid same-source confirmation", () => {
  const transport = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", transport);
  const value = overview(assessment("UNKNOWN", "assessment-a"), true);
  render(tree(value, async () => {}));
  const confirm = screen.getByRole("button", { name: "Konfirmasi kategori belum tersedia" });
  expect(confirm).toHaveProperty("disabled", true);
  fireEvent.click(confirm);
  expect(transport).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain("Berlaku untuk sumber aktif.");

  const summary = render(createElement(RiskEvidenceSummary, { overview: value }));
  expect(summary.getByText(/Kategori dikonfirmasi:/).textContent).toContain("LOW");
});
