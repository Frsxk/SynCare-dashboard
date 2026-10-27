import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { backendAuthRequest, grantSchema, resolveNurseSession } from "./server";
import { authConfiguration, openCredential, sealCredential, SESSION_COOKIE, SIGNED_OUT_COOKIE, validCsrf } from "./cookie-session";

const credentials = z.object({ identifier: z.string().trim().min(1).max(320), password: z.string().min(1).max(128) }).strict();
const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
const failure = (status: number, code: string) => Response.json({ error: { code, message: code, retryable: status === 503, requestId: randomUUID() } }, { status, headers });

export async function browserLogin(request: Request): Promise<Response> {
  try {
    const config = authConfiguration();
    if (request.headers.get("origin") !== config.webOrigin) return failure(403, "forbidden");
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return failure(422, "validation_failed");
    const reader = request.body?.getReader();
    if (!reader) return failure(422, "validation_failed");
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 4096) { await reader.cancel(); return failure(422, "validation_failed"); }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    let input: z.infer<typeof credentials>;
    try { input = credentials.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)))); }
    catch { return failure(422, "validation_failed"); }
    const upstream = await backendAuthRequest("POST", input);
    if (!upstream.ok) return failure([401, 422, 429].includes(upstream.status) ? upstream.status : 503,
      upstream.status === 401 ? "unauthenticated" : upstream.status === 429 ? "rate_limited" : upstream.status === 422 ? "validation_failed" : "dependency_unavailable");
    const parsed = grantSchema.safeParse((await upstream.json().catch(() => null))?.data);
    if (!parsed.success || Date.parse(parsed.data.expiresAt) <= Date.now()) return failure(503, "dependency_unavailable");
    const grant = parsed.data;
    if (grant.principal.role !== "nurse") {
      await backendAuthRequest("DELETE", undefined, grant.sessionToken).catch(() => {});
      return failure(403, "forbidden");
    }
    const jar = await cookies();
    const previous = openCredential(jar.get(SESSION_COOKIE)?.value, config.secret);
    if (previous) await backendAuthRequest("DELETE", undefined, previous.token).catch(() => {});
    jar.set(SESSION_COOKIE, sealCredential({ token: grant.sessionToken, expiresAt: grant.expiresAt }, config.secret), {
      httpOnly: true, sameSite: "lax", secure: config.webOrigin.startsWith("https:"), path: "/", expires: new Date(grant.expiresAt),
    });
    jar.set(SIGNED_OUT_COOKIE, "", { path: "/", maxAge: 0, sameSite: "lax", secure: config.webOrigin.startsWith("https:") });
    return Response.json({ data: { authenticated: true }, requestId: randomUUID() }, { headers });
  } catch { return failure(503, "dependency_unavailable"); }
}

export async function browserSession(request: Request): Promise<Response> {
  if (request.method === "GET") {
    try {
      const session = await resolveNurseSession();
      return session ? Response.json({ data: { principal: session.principal, csrfToken: session.csrfToken }, requestId: randomUUID() }, { headers }) : failure(401, "unauthenticated");
    } catch { return failure(503, "dependency_unavailable"); }
  }
  try {
    const config = authConfiguration();
    if (request.headers.get("origin") !== config.webOrigin) return failure(403, "forbidden");
    const jar = await cookies();
    const saved = openCredential(jar.get(SESSION_COOKIE)?.value, config.secret);
    if (saved && !validCsrf(request.headers.get("x-csrf-token"), saved.token, config.secret)) return failure(403, "forbidden");
    let revoked = true;
    if (saved) {
      try { const response = await backendAuthRequest("DELETE", undefined, saved.token); revoked = response.status === 204 || response.status === 401; }
      catch { revoked = false; }
    }
    jar.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", sameSite: "lax", secure: config.webOrigin.startsWith("https:"), maxAge: 0 });
    jar.set(SIGNED_OUT_COOKIE, "1", { path: "/", sameSite: "lax", secure: config.webOrigin.startsWith("https:"), maxAge: 86400 });
    return Response.json({ data: { revoked }, requestId: randomUUID() }, { headers: { ...headers, "Clear-Site-Data": '"cache"' } });
  } catch { return failure(503, "dependency_unavailable"); }
}
