// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { PlanWorkspacePage } from "@/features/plans/review-desk";
import type { Overview } from "@/features/patients/contracts";
import type { Review } from "@/features/plans/contracts";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, Set<() => void>>();
  closed = false;
  constructor(readonly url: string) { FakeEventSource.instances.push(this); }
  addEventListener(name: string, listener: () => void) { const set = this.listeners.get(name) ?? new Set(); set.add(listener); this.listeners.set(name, set); }
  close() { this.closed = true; }
}

const at = "2026-10-26T03:00:00.000Z";
const evidence = { id: "confirmation-a", assessmentId: "assessment-a", dischargeId: "source-a", sourceVersion: 1,
  category: "LOW" as const, score: 0, confirmedBy: "nurse-a", confirmedAt: at, applicable: true,
  disclaimer: "Synthetic component fixture only.", label: "test-fixture", version: 1 };
const overview: Overview = {
  profile: { id: "patient-a", profile: { displayName: "Synthetic review patient" }, recordedCondition: null, version: 1, createdAt: at, updatedAt: at, source: { actorId: "nurse-a", recordedAt: at } },
  currentDischarge: { id: "source-a", patientId: "patient-a", episodeId: "episode-a", version: 1, sourceText: "Synthetic source", createdAt: at, actorId: "nurse-a", patientVersion: 1 },
  confirmedRisk: { status: "confirmed", current: evidence, previous: null }, latestAssessment: null,
  permissions: { managePatient: true, reviewRisk: true, provisionPatient: false, manageAssignments: false },
  currentPlan: { availability: "unavailable", reason: "domain_source_not_connected" },
  latestReport: null, latestAnalysis: null,
  activeBookingCounts: { availability: "unavailable", reason: "domain_source_not_connected" },
  openAlertCounts: { availability: "unavailable", reason: "domain_source_not_connected" },
};
const waiting = (patch: Partial<Review> = {}): Review => ({
  id: "review-a", patientId: "patient-a", draftId: "draft-a", state: "WAITING_FOR_HUMAN", version: 4,
  upstreamStatus: "suspended", gate: { requestId: "gate-a", options: [{ actionId: "approve", label: "Approve" }, { actionId: "request_changes", label: "Request Changes" }] },
  decision: null, revisedDraftId: null, failureCode: null, createdAt: at, updatedAt: at, ...patch,
});

type Deferred<T> = { promise: Promise<T>; resolve(value: T): void };
const deferred = <T,>(): Deferred<T> => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };

let reviewGets = 0, decisionPosts = 0;
let heldReview: Deferred<Response> | null = null;
let heldDecision: Deferred<Response> | null = null;
let snapshot: Review;
let transport: ReturnType<typeof vi.fn>;

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  reviewGets = 0; decisionPosts = 0; heldReview = null; heldDecision = null; snapshot = waiting();
  transport = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method ?? "GET";
    if (url.endsWith("/overview")) return Response.json({ data: overview, requestId: "synthetic-overview" });
    if (url.includes("/v1/reviews?patientId=")) return Response.json({ data: [snapshot], nextCursor: null, requestId: "synthetic-list" });
    if (method === "GET" && url.endsWith("/v1/reviews/review-a")) {
      reviewGets++;
      if (heldReview) return heldReview.promise;
      return Response.json({ data: snapshot, requestId: "synthetic-review" });
    }
    if (method === "POST" && url.endsWith("/v1/reviews/review-a/decisions")) {
      decisionPosts++;
      if (heldDecision) return heldDecision.promise;
      return decisionResponse();
    }
    throw new Error(`unexpected synthetic request: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", transport);
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function decisionResponse(state: Review["state"] = "APPROVED") {
  return Response.json({ data: { resource: waiting({
    state, version: 5, gate: state === "WAITING_FOR_HUMAN" ? waiting().gate : null,
    decision: { actionId: "approve", actorId: "nurse-a", state: "CONFIRMED", recordedAt: at },
  }), replayed: false }, requestId: "synthetic-decision" });
}

function mount() {
  return render(createElement(PlanWorkspacePage, { principalId: "nurse-a", csrfToken: "synthetic-csrf", patientId: "patient-a", initialReviewId: "review-a" }));
}

describe("review desk polling and decision interactions", () => {
  test("a held ordinary background poll leaves the cached valid gate operable and uses the cookie EventSource", async () => {
    mount();
    const approve = await screen.findByRole("button", { name: "Kirim keputusan Approve" });
    expect((approve as HTMLButtonElement).disabled).toBe(false);
    expect(FakeEventSource.instances.map(events => events.url)).toEqual(["/api/syncare/v1/reviews/review-a/stream"]);

    heldReview = deferred<Response>();
    await waitFor(() => expect(reviewGets).toBe(2), { timeout: 5000 });
    const stillEnabled = screen.getByRole("button", { name: "Kirim keputusan Approve" }) as HTMLButtonElement;
    expect(stillEnabled.disabled).toBe(false);
    fireEvent.click(stillEnabled);
    await waitFor(() => expect(decisionPosts).toBe(1));
    expect(new Headers(transport.mock.calls.find(call => String(call[1]?.method) === "POST")?.[1]?.headers).get("idempotency-key"))
      .toMatch(/^[0-9a-f-]{36}$/i);
    heldReview.resolve(Response.json({ data: waiting(), requestId: "synthetic-review-late" }));
    await screen.findByText("Status review: Persetujuan terverifikasi", {}, { timeout: 5000 });
  }, 15000);

  test("a held decision mutation accepts one intent from a double click and reports the server CAS fields", async () => {
    heldDecision = deferred<Response>();
    mount();
    const approve = await screen.findByRole("button", { name: "Kirim keputusan Approve" });
    fireEvent.click(approve);
    fireEvent.click(approve);
    await waitFor(() => expect(decisionPosts).toBe(1));
    const post = transport.mock.calls.find(call => String(call[1]?.method) === "POST")!;
    const body = JSON.parse(String(post[1]?.body));
    expect(body).toMatchObject({ expectedVersion: 4, requestId: "gate-a", actionId: "approve" });
    expect((screen.getByRole("button", { name: "Kirim keputusan Approve" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Kirim keputusan Approve" }));
    expect(decisionPosts).toBe(1);
    heldDecision.resolve(decisionResponse("APPROVED"));
    await screen.findByText("Status review: Persetujuan terverifikasi", {}, { timeout: 5000 });
    expect(decisionPosts).toBe(1);
  }, 15000);

  test("DECISION_UNKNOWN renders no new decision controls", async () => {
    snapshot = waiting({ state: "DECISION_UNKNOWN" });
    mount();
    await screen.findByText(/Hasil belum dapat dipastikan/);
    expect(screen.queryByRole("button", { name: /Kirim keputusan/ })).toBeNull();
  });
});
