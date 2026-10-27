import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import type { NurseSession } from "./session-contract";
import { authConfiguration, csrfToken, openCredential, SESSION_COOKIE, SIGNED_OUT_COOKIE } from "./cookie-session";

export const principalSchema = z.object({
  id: z.string().min(1), role: z.enum(["patient", "nurse"]), capabilities: z.array(z.string()), patientId: z.string().optional(),
}).strict();
export const snapshotSchema = z.object({ principal: principalSchema, expiresAt: z.iso.datetime({ offset: true }) }).strict();
export const grantSchema = snapshotSchema.extend({ sessionToken: z.string().regex(/^sc_[A-Za-z0-9_-]{43}$/) });

export class BackendSessionUnavailable extends Error {
  constructor() { super("session_unverified"); }
}

export async function backendAuthRequest(method: "POST" | "GET" | "DELETE", data?: unknown, token?: string): Promise<Response> {
  const config = authConfiguration();
  try {
    return await fetch(`${config.backendOrigin}/api/v1/auth/${method === "POST" ? "login" : "session"}`, {
      method, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
      headers: { Accept: "application/json", ...(data === undefined ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  } catch { throw new BackendSessionUnavailable(); }
}

export async function resolveNurseSession(): Promise<NurseSession | null> {
  const jar = await cookies();
  if (jar.get(SIGNED_OUT_COOKIE)?.value === "1" || !jar.get(SESSION_COOKIE)) return null;
  let config: ReturnType<typeof authConfiguration>;
  try { config = authConfiguration(); } catch { throw new BackendSessionUnavailable(); }
  const saved = openCredential(jar.get(SESSION_COOKIE)?.value, config.secret);
  if (!saved) return null;
  const response = await backendAuthRequest("GET", undefined, saved.token);
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new BackendSessionUnavailable();
  const raw = await response.json().catch(() => null);
  const parsed = snapshotSchema.safeParse(raw?.data);
  if (!parsed.success || Date.parse(parsed.data.expiresAt) <= Date.now()) throw new BackendSessionUnavailable();
  if (parsed.data.principal.role !== "nurse") return null;
  return {
    token: saved.token,
    csrfToken: csrfToken(saved.token, config.secret),
    principal: { id: parsed.data.principal.id, role: "nurse", displayName: `ID akun: ${parsed.data.principal.id}`, capabilities: parsed.data.principal.capabilities },
  };
}
