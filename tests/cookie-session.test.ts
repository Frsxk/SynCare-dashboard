import { expect, test } from "vitest";
import { randomBytes } from "node:crypto";
import { authConfiguration, csrfToken, openCredential, sealCredential, validCsrf } from "../src/lib/auth/cookie-session";

test("encrypted host cookie hides the backend token and rejects changes, wrong keys and absolute expiry", () => {
  const secret = randomBytes(32).toString("base64url");
  const value = { token: `sc_${randomBytes(32).toString("base64url")}`, expiresAt: "2026-10-26T06:00:00.000Z" };
  const sealed = sealCredential(value, secret);
  expect(sealed.includes(value.token)).toBe(false);
  expect(openCredential(sealed, secret, Date.parse("2026-10-25T06:00:00Z"))).toEqual(value);
  expect(openCredential(sealed.slice(0, -3) + "bad", secret, 0)).toBeNull();
  expect(openCredential(sealed, randomBytes(32).toString("base64url"), 0)).toBeNull();
  expect(openCredential(sealed, secret, Date.parse(value.expiresAt))).toBeNull();
  expect(openCredential("caller-controlled-cookie", secret)).toBeNull();
  expect(validCsrf(csrfToken(value.token, secret), value.token, secret)).toBe(true);
  expect(validCsrf(csrfToken(`sc_${randomBytes(32).toString("base64url")}`, secret), value.token, secret)).toBe(false);
  expect(validCsrf(null, value.token, secret)).toBe(false);
});

test("browser auth rejects an unsupported DPAPI envelope even when its ciphertext exceeds the minimum length", () => {
  const environment = { SYNCARE_SESSION_SECRET: randomBytes(32).toString("base64url"), SYNCARE_BACKEND_ORIGIN: "http://127.0.0.1:8080", SYNCARE_WEB_ORIGIN: "http://127.0.0.1:3000", SYNCARE_ALLOW_LOCAL_HTTP: "true" };
  const ciphertext = `dpapi:v2:${randomBytes(64).toString("base64")}`;
  expect(Buffer.byteLength(ciphertext)).toBeGreaterThanOrEqual(32);
  let failure: unknown;
  try { authConfiguration({ ...environment, SYNCARE_SESSION_SECRET: ciphertext }); } catch (error) { failure = error; }
  expect((failure as Error)?.message).toBe("invalid_private_envelope");
  expect(String(failure)).not.toContain(ciphertext);
  expect(String(failure)).not.toContain(ciphertext.slice("dpapi:v2:".length, 48));
});

test("browser auth requires private key and exact HTTPS origins or the explicit loopback exception", () => {
  const environment = { SYNCARE_SESSION_SECRET: randomBytes(32).toString("base64url"), SYNCARE_BACKEND_ORIGIN: "http://127.0.0.1:8080", SYNCARE_WEB_ORIGIN: "http://127.0.0.1:3000", SYNCARE_ALLOW_LOCAL_HTTP: "true" };
  expect(authConfiguration(environment).webOrigin).toBe(environment.SYNCARE_WEB_ORIGIN);
  expect(() => authConfiguration({ ...environment, SYNCARE_SESSION_SECRET: "" })).toThrow();
  expect(() => authConfiguration({ ...environment, SYNCARE_WEB_ORIGIN: "*" })).toThrow();
  expect(() => authConfiguration({ ...environment, SYNCARE_ALLOW_LOCAL_HTTP: "false" })).toThrow();
  expect(() => authConfiguration({ ...environment, SYNCARE_WEB_ORIGIN: "http://192.168.1.2:3000" })).toThrow();
});
