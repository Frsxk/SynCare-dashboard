import { z } from "zod";
import { errorEnvelope, type ErrorCode } from "./contracts";

const messages = {
  unauthenticated: "Silakan masuk kembali.",
  rate_limited: "Terlalu banyak percobaan masuk. Coba kembali nanti.",
  forbidden: "Anda tidak memiliki akses untuk tindakan ini.",
  not_found: "Data tidak ditemukan.",
  validation_failed: "Periksa kembali data yang dikirim.",
  version_conflict: "Data telah berubah. Muat data terbaru sebelum melanjutkan.",
  booking_schedule_conflict: "Jadwal petugas bertabrakan dengan kunjungan lain. Pilih waktu atau petugas lain.",
  idempotency_conflict: "Identitas permintaan telah digunakan untuk data berbeda.",
  dependency_unavailable: "Layanan belum tersedia. Coba muat kembali.",
  processing_failed: "Proses belum berhasil diselesaikan.",
  outcome_unknown: "Hasil permintaan belum dapat dipastikan. Periksa status sebelum mengirim ulang.",
  invalid_flow_output: "Hasil pemrosesan tidak dapat ditampilkan.",
  emergency_guidance_unavailable: "Informasi layanan darurat belum tersedia.",
  invalid_response: "Respons layanan tidak dapat ditampilkan.",
  session_changed: "Sesi telah berubah. Muat data melalui sesi saat ini.",
  cancelled: "Permintaan dihentikan.",
} as const;
export class ApiFailure extends Error {
  readonly retryable: boolean;
  constructor(readonly code: ErrorCode | "invalid_response" | "session_changed" | "cancelled",
    readonly details: { requestId?: string; resourceId?: string; currentVersion?: number } = {}) {
    super(messages[code]); this.name = "ApiFailure";
    this.retryable = code === "dependency_unavailable";
  }
}

export interface RequestOptions<T> {
  schema: z.ZodType<T>;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}
export interface ClientDependencies { fetch?: typeof fetch; csrfToken?: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function gatewayPath(path: string) {
  const [pathname, query, extra] = path.split("?");
  if (extra !== undefined || !/^\/v1\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+$/.test(pathname ?? "") || path.length > 4096 || path.includes("#")) throw new ApiFailure("validation_failed");
  const params = new URLSearchParams(query);
  const seen = new Set<string>();
  for (const [key] of params) {
    if (!["cursor", "limit", "patientId", "status"].includes(key) || seen.has(key)) throw new ApiFailure("validation_failed");
    seen.add(key);
  }
  return `/api/syncare${path}`;
}

export class ApiClient {
  private readonly transport: typeof fetch;
  private csrfToken: string | undefined;
  private readonly lifetime = new AbortController();
  constructor(dependencies: ClientDependencies = {}) {
    this.transport = dependencies.fetch ?? globalThis.fetch.bind(globalThis);
    this.csrfToken = dependencies.csrfToken;
  }
  dispose() { this.csrfToken = undefined; this.lifetime.abort(); }
  async request<T>(path: string, options: RequestOptions<T>): Promise<T> {
    if (this.lifetime.signal.aborted) throw new ApiFailure("session_changed");
    const url = gatewayPath(path);
    const method = options.method ?? "GET";
    const mutation = method !== "GET";
    const timeoutMs = options.timeoutMs ?? 30000;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 180000) throw new ApiFailure("validation_failed");
    const headers = new Headers({ Accept: "application/json" });
    let body: string | undefined;
    if (mutation) {
      if (!this.csrfToken || (path !== "/v1/auth/session" && !uuid.test(options.idempotencyKey ?? ""))) throw new ApiFailure("validation_failed");
      const parsed = z.json().safeParse(options.body ?? {});
      if (!parsed.success) throw new ApiFailure("validation_failed");
      body = JSON.stringify(parsed.data);
      if (new TextEncoder().encode(body).length > 262144) throw new ApiFailure("validation_failed");
      headers.set("Content-Type", "application/json");
      headers.set("X-CSRF-Token", this.csrfToken);
      if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);
    } else if (options.body !== undefined) throw new ApiFailure("validation_failed");
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), timeoutMs);
    const signal = AbortSignal.any([this.lifetime.signal, timeout.signal, ...(options.signal ? [options.signal] : [])]);
    try {
      const response = await this.transport(url, { method, headers, body, signal, credentials: "same-origin", cache: "no-store", redirect: "error" });
      if (this.lifetime.signal.aborted) throw new ApiFailure("session_changed");
      if (signal.aborted) throw new ApiFailure(mutation ? "outcome_unknown" : "cancelled");
      if (response.status === 204) {
        const empty = options.schema.safeParse(undefined);
        if (!empty.success) throw new ApiFailure(mutation ? "outcome_unknown" : "invalid_response");
        return empty.data;
      }
      let raw: unknown;
      try { raw = await response.json(); } catch { throw new ApiFailure(mutation && response.ok ? "outcome_unknown" : "invalid_response"); }
      if (this.lifetime.signal.aborted) throw new ApiFailure("session_changed");
      if (signal.aborted) throw new ApiFailure(mutation ? "outcome_unknown" : "cancelled");
      if (!response.ok) {
        const parsed = errorEnvelope.safeParse(raw);
        if (!parsed.success) throw new ApiFailure(mutation ? "outcome_unknown" : "invalid_response");
        const { code, requestId, resourceId, currentVersion } = parsed.data.error;
        throw new ApiFailure(code, { requestId, resourceId, currentVersion });
      }
      const parsed = options.schema.safeParse(raw);
      if (!parsed.success) throw new ApiFailure(mutation ? "outcome_unknown" : "invalid_response");
      return parsed.data;
    } catch (error) {
      if (this.lifetime.signal.aborted) throw new ApiFailure("session_changed");
      if (error instanceof ApiFailure) throw error;
      if (options.signal?.aborted && !mutation) throw new ApiFailure("cancelled");
      throw new ApiFailure(mutation ? "outcome_unknown" : "dependency_unavailable");
    } finally { clearTimeout(timer); }
  }
}
