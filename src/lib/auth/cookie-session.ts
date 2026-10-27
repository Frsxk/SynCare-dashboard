import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { unprotectEnvironment } from "../../../../SynCare-be/src/security/private-files.cjs";

export const SESSION_COOKIE = "syncare_session";
export const SIGNED_OUT_COOKIE = "syncare_signed_out";
const credential = z.object({ token: z.string().regex(/^sc_[A-Za-z0-9_-]{43}$/), expiresAt: z.iso.datetime({ offset: true }) }).strict();
export type BrowserCredential = z.infer<typeof credential>;

export function authConfiguration(environment: Record<string, string | undefined> = process.env) {
  unprotectEnvironment(environment);
  const allowHttp = environment.SYNCARE_ALLOW_LOCAL_HTTP === "true";
  const origin = (raw: string | undefined) => {
    const url = new URL(raw ?? "");
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error("invalid_auth_origin");
    return url.origin;
  };
  const secret = environment.SYNCARE_SESSION_SECRET ?? "";
  if (Buffer.byteLength(secret) < 32) throw new Error("session_secret_required");
  return { secret, webOrigin: origin(environment.SYNCARE_WEB_ORIGIN), backendOrigin: origin(environment.SYNCARE_BACKEND_ORIGIN) };
}

function key(secret: string): Buffer {
  if (Buffer.byteLength(secret) < 32) throw new Error("session_secret_required");
  return createHash("sha256").update(secret).digest();
}

export function sealCredential(value: BrowserCredential, secret: string): string {
  const parsed = credential.parse(value);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  cipher.setAAD(Buffer.from(SESSION_COOKIE));
  const payload = Buffer.concat([cipher.update(JSON.stringify(parsed), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), payload.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}

export function openCredential(value: string | undefined, secret: string, now = Date.now()): BrowserCredential | null {
  if (!value || value.length > 2048) return null;
  try {
    const parts = value.split(".");
    if (parts.length !== 4 || parts[0] !== "v1" || parts.slice(1).some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
    const iv = Buffer.from(parts[1]!, "base64url"), tag = Buffer.from(parts[3]!, "base64url");
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(secret), iv);
    decipher.setAAD(Buffer.from(SESSION_COOKIE));
    decipher.setAuthTag(tag);
    const text = Buffer.concat([decipher.update(Buffer.from(parts[2]!, "base64url")), decipher.final()]).toString("utf8");
    const result = credential.safeParse(JSON.parse(text));
    return result.success && Date.parse(result.data.expiresAt) > now ? result.data : null;
  } catch { return null; }
}

export function csrfToken(token: string, secret: string): string {
  return createHmac("sha256", key(secret)).update(`csrf:${token}`).digest("base64url");
}

export function validCsrf(presented: string | null, token: string, secret: string): boolean {
  if (!presented || !/^[A-Za-z0-9_-]{43}$/.test(presented)) return false;
  return timingSafeEqual(Buffer.from(presented), Buffer.from(csrfToken(token, secret)));
}
