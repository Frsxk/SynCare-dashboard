import "server-only";
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { NurseSession } from "../auth/session-contract";

interface GatewayDependencies {
  resolveSession: () => Promise<NurseSession | null>;
  fetch?: typeof fetch;
  backendOrigin: () => string;
  webOrigin: () => string;
  allowLoopbackHttp: () => boolean;
  timeoutMs?: number;
}

const id = "[a-zA-Z0-9_-]+";
const rules: readonly [RegExp, readonly string[]][] = [
  // Credential exchange needs T-0104's cookie handler; never relay raw session grants to browser JS.
  [/^v1\/auth\/session$/, ["GET", "DELETE"]],
  [/^v1\/accounts\/patient-links$/, ["POST"]],
  [/^v1\/patients$/, ["GET", "POST"]],
  [new RegExp(`^v1/patients/${id}$`), ["GET", "PATCH"]],
  [new RegExp(`^v1/patients/${id}/(?:assignments|discharges|care-plan-drafts|questions)$`), ["POST"]],
  [new RegExp(`^v1/patients/${id}/(?:overview|assessments|alerts|care-plans)$`), ["GET"]],
  [new RegExp(`^v1/patients/${id}/(?:checkins|bookings)$`), ["GET", "POST"]],
  [new RegExp(`^v1/discharges/${id}/assessments$`), ["POST"]],
  [new RegExp(`^v1/assessments/${id}/confirmations$`), ["POST"]],
  [new RegExp(`^v1/checkins/${id}$`), ["GET"]],
  [/^v1\/(?:monitoring|emergency-guidance|homecare\/services|homecare\/staff|bookings|alerts|reviews)$/, ["GET"]],
  [new RegExp(`^v1/(?:bookings|alerts|care-plan-drafts|reviews)/${id}$`), ["GET"]],
  [new RegExp(`^v1/bookings/${id}/transitions$`), ["POST"]],
  [new RegExp(`^v1/alerts/${id}/actions$`), ["POST"]],
  [new RegExp(`^v1/care-plan-drafts/${id}/reviews$`), ["POST"]],
  [new RegExp(`^v1/reviews/${id}/stream$`), ["GET"]],
  [new RegExp(`^v1/reviews/${id}/decisions$`), ["POST"]],
];
const allowedQueryKeys = new Set(["cursor", "limit", "patientId", "status"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function responseHeaders(requestId: string, contentType = "application/json"): Headers {
  return new Headers({
    "Content-Type": contentType,
    "Cache-Control": "private, no-store, max-age=0",
    Vary: "Cookie",
    "X-Content-Type-Options": "nosniff",
    "X-Request-Id": requestId,
  });
}

function failure(status: number, code: string, requestId: string, retryable = false): Response {
  return new Response(JSON.stringify({ error: { code, message: code, requestId, retryable } }),
    { status, headers: responseHeaders(requestId) });
}

function origin(value: string, allowHttp: boolean): string {
  const parsed = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash ||
      (parsed.protocol !== "https:" && !(allowHttp && local && parsed.protocol === "http:"))) {
    throw new Error("invalid_origin");
  }
  return parsed.origin;
}

function equalToken(first: string | null, second: string): boolean {
  if (!first || !second || first.length > 512) return false;
  const a = Buffer.from(first), b = Buffer.from(second);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function jsonBody(request: Request): Promise<string> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new Error("invalid_body");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_body");
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 262144) throw new Error("invalid_body");
      parts.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const parsed: unknown = JSON.parse(text);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_body");
  return text;
}

export function createGateway(deps: GatewayDependencies) {
  return async (request: Request, segments: readonly string[]): Promise<Response> => {
    const requestId = randomUUID();
    if (!segments.length || segments.some((part) => !/^[a-zA-Z0-9_-]{1,128}$/.test(part))) {
      return failure(404, "not_found", requestId);
    }
    const path = segments.join("/");
    const rule = rules.find(([pattern]) => pattern.test(path));
    if (!rule) return failure(404, "not_found", requestId);
    if (!rule[1].includes(request.method)) return failure(405, "validation_failed", requestId);
    const url = new URL(request.url);
    if (url.search.length > 4096 || [...url.searchParams.keys()].some((key) => !allowedQueryKeys.has(key))) {
      return failure(400, "validation_failed", requestId);
    }
    let session: NurseSession | null;
    try { session = await deps.resolveSession(); } catch { return failure(503, "dependency_unavailable", requestId); }
    if (!session?.token || !session.principal?.id || session.principal.role !== "nurse") {
      return failure(401, "unauthenticated", requestId);
    }
    let backend: string, web: string;
    try {
      backend = origin(deps.backendOrigin(), deps.allowLoopbackHttp());
      web = origin(deps.webOrigin(), deps.allowLoopbackHttp());
    } catch { return failure(503, "dependency_unavailable", requestId); }
    const unsafe = !["GET", "HEAD"].includes(request.method);
    if (unsafe && (request.headers.get("origin") !== web ||
        !equalToken(request.headers.get("x-csrf-token"), session.csrfToken))) {
      return failure(403, "forbidden", requestId);
    }
    const headers = new Headers({ Authorization: `Bearer ${session.token}`, Accept: "application/json", "X-Request-Id": requestId });
    const key = request.headers.get("idempotency-key");
    const sessionOperation = path.startsWith("v1/auth/");
    if (unsafe && !sessionOperation && (!key || !uuid.test(key))) return failure(400, "validation_failed", requestId);
    if (key) {
      if (!uuid.test(key)) return failure(400, "validation_failed", requestId);
      headers.set("Idempotency-Key", key);
    }
    const stream = path.endsWith("/stream");
    if (stream) {
      headers.set("Accept", "text/event-stream");
      const cursor = request.headers.get("last-event-id");
      if (cursor) {
        if (!/^[a-zA-Z0-9_:.\-]{1,512}$/.test(cursor)) return failure(400, "validation_failed", requestId);
        headers.set("Last-Event-ID", cursor);
      }
    }
    let body: string | undefined;
    if (unsafe && request.method !== "DELETE") {
      try { body = await jsonBody(request); } catch { return failure(400, "validation_failed", requestId); }
      headers.set("Content-Type", "application/json");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 180000);
    try {
      const upstream = await (deps.fetch ?? fetch)(`${backend}/api/${path}${url.search}`, {
        method: request.method, headers, body,
        cache: "no-store", redirect: "manual",
        signal: AbortSignal.any([request.signal, controller.signal]),
      });
      if (upstream.status >= 300 && upstream.status < 400) return failure(503, "dependency_unavailable", requestId);
      const type = upstream.headers.get("content-type") ?? "";
      if (upstream.status !== 204 && !type.startsWith("application/json") && !type.startsWith("text/event-stream")) {
        return failure(502, "dependency_unavailable", requestId);
      }
      return new Response(upstream.status === 204 ? null : upstream.body, {
        status: upstream.status,
        headers: responseHeaders(requestId, type || "application/json"),
      });
    } catch {
      return failure(unsafe ? 502 : 503, unsafe ? "outcome_unknown" : "dependency_unavailable", requestId, !unsafe);
    } finally { clearTimeout(timer); }
  };
}

