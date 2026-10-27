import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { ApiClient, ApiFailure } from "@/lib/api/client";
import { dataEnvelope, errorEnvelope } from "@/lib/api/contracts";
import { createSessionData } from "@/lib/query/client";
import { applyFormFailure, checkinFormSchema, checkinResolver, formFailure } from "@/lib/forms/contracts";
import { AsyncPanel } from "@/components/states/async-panel";
import { createGateway } from "@/lib/api/bff";
import { domainErrorFixtures, wireFailureResponse } from "./fixtures/domain-errors";

const scopeA = { principalId: "synthetic-nurse-a", sessionGeneration: "session-a" };
const scopeB = { principalId: "synthetic-nurse-b", sessionGeneration: "session-b" };
const schema = dataEnvelope(z.object({ id: z.string() }).strict());
const response = (id: string) => Response.json({ data: { id }, requestId: "request-a" });
const intent = "b32f13e3-d010-4109-8572-13d88d268423";

test("default browser transport retains the global fetch receiver", async () => {
  vi.stubGlobal("fetch", async function (this: typeof globalThis) {
    expect(this).toBe(globalThis);
    return response("bound-default-transport");
  });
  try {
    const client = new ApiClient();
    expect(await client.request("/v1/patients", { schema })).toMatchObject({ data: { id: "bound-default-transport" } });
    client.dispose();
  } finally { vi.unstubAllGlobals(); }
});

describe("session-scoped foundation", () => {
  test("query_account_generation_isolated: late A cannot populate B after disposal", async () => {
    let release!: (response: Response) => void;
    const held = new Promise<Response>(resolve => { release = resolve; });
    const a = createSessionData(scopeA, { fetch: vi.fn(() => held), csrfToken: "synthetic-csrf" });
    const pending = a.query.fetchQuery(a.options(["patients", "p1"], "/v1/patients/p1", schema));
    const assertion = expect(pending).rejects.toBeDefined();
    expect(a.query.getQueryState(a.key(["patients", "p1"]))?.fetchStatus).toBe("fetching");
    a.dispose();
    const b = createSessionData(scopeB, { fetch: vi.fn(async () => response("b-only")) });
    await b.query.fetchQuery(b.options(["patients", "p1"], "/v1/patients/p1", schema));
    release(response("a-late"));
    await assertion;
    expect(a.query.getQueryCache().getAll()).toHaveLength(0);
    expect(b.query.getQueryData(b.key(["patients", "p1"]))).toMatchObject({ data: { id: "b-only" } });
    expect(b.query.getQueryData(a.key(["patients", "p1"]))).toBeUndefined();
    expect(b.query.getDefaultOptions().mutations?.retry).toBe(0);
    b.dispose();
  });

  test("same principal new session gets a different cache; stale content survives failed refresh", async () => {
    let fail = false;
    const layer = createSessionData(scopeA, { fetch: vi.fn(async () => {
      if (fail) return Response.json({ error: { code: "dependency_unavailable", message: "raw engine text", requestId: "r", retryable: true } }, { status: 503 });
      return response("retained");
    }) });
    const options = layer.options(["patients"], "/v1/patients", schema);
    await layer.query.fetchQuery(options);
    fail = true;
    await expect(layer.query.fetchQuery(options)).rejects.toMatchObject({ code: "dependency_unavailable" });
    expect(layer.query.getQueryData(options.queryKey)).toMatchObject({ data: { id: "retained" } });
    const other = createSessionData({ ...scopeA, sessionGeneration: "new-session" });
    expect(other.key(["patients"])).not.toEqual(layer.key(["patients"]));
    expect(other.query.getQueryCache().getAll()).toHaveLength(0);
    layer.dispose(); other.dispose();
  });

  test("writes use cookie/CSRF/intent headers and never replay an uncertain mutation", async () => {
    const transport = vi.fn<typeof fetch>(async () => { throw new TypeError("synthetic disconnect"); });
    const api = new ApiClient({ fetch: transport, csrfToken: "csrf-synthetic" });
    await expect(api.request("/v1/patients", { method: "POST", body: { profile: {} }, idempotencyKey: intent, schema })).rejects.toMatchObject({ code: "outcome_unknown", retryable: false });
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe("/api/syncare/v1/patients");
    expect(init?.credentials).toBe("same-origin");
    const headers = new Headers(init?.headers);
    expect(headers.get("x-csrf-token")).toBe("csrf-synthetic");
    expect(headers.get("idempotency-key")).toBe(intent);
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("cookie")).toBe(false);
    api.dispose();
    await expect(api.request("/v1/patients", { schema })).rejects.toMatchObject({ code: "session_changed" });
  });

  test("rejects invalid paths, input and malformed success without fabricated data", async () => {
    const transport = vi.fn<typeof fetch>(async () => Response.json({ data: { invented: true } }));
    const api = new ApiClient({ fetch: transport });
    for (const path of ["https://other.invalid/v1/patients", "/v1/../secret", "/v1/patients#x", "/v1/patients?token=secret"]) {
      await expect(api.request(path, { schema })).rejects.toBeInstanceOf(ApiFailure);
    }
    expect(transport).not.toHaveBeenCalled();
    await expect(api.request("/v1/patients", { schema })).rejects.toMatchObject({ code: "invalid_response" });
    await expect(api.request("/v1/patients", { schema, method: "POST", body: {}, idempotencyKey: intent })).rejects.toMatchObject({ code: "validation_failed" });
  });

  test("version conflict requires reread; unknown outcome requires reconciliation; forms keep original text", () => {
    expect(formFailure(new ApiFailure("version_conflict", { currentVersion: 3 })).action).toBe("refetch");
    expect(formFailure(new ApiFailure("outcome_unknown")).action).toBe("reconcile");
    expect(checkinFormSchema.parse({ message: "  Original report  " }).message).toBe("  Original report  ");
    expect(checkinFormSchema.safeParse({ message: "hi", riskScore: 9 }).success).toBe(false);
    expect(checkinFormSchema.safeParse({ message: "x".repeat(8001) }).success).toBe(false);
    expect(checkinFormSchema.safeParse({ message: " " }).success).toBe(false);
  });

  test("state panel distinguishes pending, empty, filtered-empty, failure and stale refresh", () => {
    const retry = vi.fn();
    const loading = renderToStaticMarkup(createElement(AsyncPanel, { state: { kind: "loading" } }));
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('role="status"');
    expect(renderToStaticMarkup(createElement(AsyncPanel, { state: { kind: "empty", message: "Belum ada laporan." } }))).toContain("Belum ada laporan");
    expect(renderToStaticMarkup(createElement(AsyncPanel, { state: { kind: "no-matches", onClear: retry } }))).toContain("Hapus filter");
    const error = renderToStaticMarkup(createElement(AsyncPanel, { state: { kind: "error", failure: new ApiFailure("dependency_unavailable"), onRetry: retry } }));
    expect(error).toContain("Coba lagi");
    const stale = renderToStaticMarkup(createElement(AsyncPanel, { state: { kind: "content", content: "Existing report", refresh: { kind: "error", failure: new ApiFailure("dependency_unavailable"), onRetry: retry } } }));
    expect(stale).toContain("Existing report");
    expect(stale).toContain("Coba lagi");
    expect(stale).not.toContain("raw engine");
    const unknown = renderToStaticMarkup(createElement(AsyncPanel, { state: { kind: "error", failure: new ApiFailure("outcome_unknown"), onRetry: retry } }));
    expect(unknown).toContain("Periksa status");
    expect(unknown).not.toContain("Coba lagi");
  });

  test("explicit synthetic wire fixtures carry the reviewed nested error metadata", () => {
    for (const fixture of Object.values(domainErrorFixtures)) {
      expect(errorEnvelope.parse(fixture.body)).toMatchObject({ error: { code: fixture.body.error.code, requestId: "synthetic-wire-request", retryable: fixture.body.error.retryable } });
      expect(fixture.body.error.message.length).toBeGreaterThan(0);
    }
    expect(domainErrorFixtures.versionConflict.status).toBe(409);
  });

  test("synthetic nested wire payloads cross the BFF/client contract without exposing upstream text (not live interoperability)", async () => {
    const upstream = vi.fn<typeof fetch>(async () => wireFailureResponse(domainErrorFixtures.versionConflict));
    const gateway = createGateway({
      resolveSession: async () => ({ token: "synthetic-server-only", csrfToken: "synthetic-csrf", principal: { id: scopeA.principalId, role: "nurse", displayName: "Synthetic staff" } }),
      backendOrigin: () => "https://backend.synthetic.invalid", webOrigin: () => "https://web.synthetic.invalid", allowLoopbackHttp: () => false, fetch: upstream,
    });
    const browserTransport: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers); headers.set("Origin", "https://web.synthetic.invalid");
      return gateway(new Request(`https://web.synthetic.invalid${input}`, { ...init, headers }), ["v1", "patients", "p1"]);
    };
    const api = new ApiClient({ fetch: browserTransport, csrfToken: "synthetic-csrf" });
    await expect(api.request("/v1/patients/p1", { schema, method: "PATCH", body: { expectedVersion: 6 }, idempotencyKey: intent })).rejects.toMatchObject({ code: "version_conflict", details: { currentVersion: 7, resourceId: "synthetic-patient", requestId: "synthetic-wire-request" } });
    expect(new Headers(upstream.mock.calls[0]?.[1]?.headers).get("authorization")).toBe("Bearer synthetic-server-only");
    api.dispose();
  });

  test("RHF resolver preserves report text and sets server error without resetting form values", async () => {
    const values = { message: "  Synthetic report  " };
    const resolved = await checkinResolver(values, undefined, { fields: {}, shouldUseNativeValidation: false });
    expect(resolved.values).toEqual(values);
    const setError = vi.fn();
    expect(applyFormFailure(setError, new ApiFailure("outcome_unknown")).action).toBe("reconcile");
    expect(setError).toHaveBeenCalledWith("root.server", expect.objectContaining({ type: "server" }));
    expect(values.message).toBe("  Synthetic report  ");
  });

  test("empty successful response requires an explicit void schema; aborted writes never become success", async () => {
    const api = new ApiClient({ fetch: vi.fn(async () => new Response(null, { status: 204 })), csrfToken: "csrf" });
    expect(await api.request("/v1/auth/session", { method: "DELETE", schema: z.undefined() })).toBeUndefined();
    await expect(api.request("/v1/patients/p1", { method: "PATCH", body: {}, idempotencyKey: intent, schema })).rejects.toMatchObject({ code: "outcome_unknown" });
    api.dispose();
  });
});
