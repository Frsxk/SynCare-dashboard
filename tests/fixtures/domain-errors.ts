// Explicit synthetic fixtures shaped like the reviewed public wire envelope.
// They are not a runtime import of the backend and do not prove live interoperability.
export type WireFailure = {
  status: number;
  body: { error: { code: string; message: string; requestId: string; retryable: boolean; resourceId?: string; currentVersion?: number } };
};

const failure = (status: number, code: string, message: string, retryable: boolean, extra: Record<string, unknown> = {}): WireFailure => ({
  status, body: { error: { code, message, requestId: "synthetic-wire-request", retryable, ...extra } },
});

export const domainErrorFixtures = {
  unauthenticated: failure(401, "unauthenticated", "Silakan masuk kembali.", false),
  forbidden: failure(403, "forbidden", "Anda tidak memiliki akses untuk tindakan ini.", false),
  versionConflict: failure(409, "version_conflict", "Data telah berubah. Muat data terbaru sebelum melanjutkan.", false, { resourceId: "synthetic-patient", currentVersion: 7 }),
  validationFailed: failure(422, "validation_failed", "Periksa kembali data yang dikirim.", false),
  outcomeUnknown: failure(502, "outcome_unknown", "Hasil permintaan belum dapat dipastikan. Periksa status sebelum mengirim ulang.", false),
  dependencyUnavailable: failure(503, "dependency_unavailable", "Layanan belum tersedia. Coba muat kembali.", true),
} as const satisfies Record<string, WireFailure>;

export function wireFailureResponse(fixture: WireFailure): Response {
  return Response.json(fixture.body, { status: fixture.status });
}
