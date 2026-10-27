import { afterEach, expect, test } from "vitest";
import { createCipheriv, randomBytes } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authConfiguration, csrfToken, openCredential, sealCredential, validCsrf } from "../src/lib/auth/cookie-session";

const directories: string[] = [];

function keyFile(key: Buffer): string {
  const directory = mkdtempSync(join(tmpdir(), "syncare-session-key-"));
  directories.push(directory);
  const path = join(directory, "private.key");
  writeFileSync(path, key, { mode: 0o600 });
  chmodSync(path, 0o600);
  return path;
}

function sealLinux(text: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from("SynCare.local.private.v1:aesgcm:v1", "utf8"));
  const ciphertext = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return `aesgcm:v1:${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64")}`;
}

afterEach(() => {
  while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true });
});

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

test("browser auth rejects an unsupported Linux envelope even when its ciphertext exceeds the minimum length", () => {
  const environment = { SYNCARE_SESSION_SECRET: randomBytes(32).toString("base64url"), SYNCARE_BACKEND_ORIGIN: "http://127.0.0.1:8080", SYNCARE_WEB_ORIGIN: "http://127.0.0.1:3000", SYNCARE_ALLOW_LOCAL_HTTP: "true" };
  const ciphertext = `aesgcm:v2:${randomBytes(64).toString("base64")}`;
  expect(Buffer.byteLength(ciphertext)).toBeGreaterThanOrEqual(32);
  let failure: unknown;
  try { authConfiguration({ ...environment, SYNCARE_SESSION_SECRET: ciphertext }); } catch (error) { failure = error; }
  expect((failure as Error)?.message).toBe("invalid_private_envelope");
  expect(String(failure)).not.toContain(ciphertext);
  expect(String(failure)).not.toContain(ciphertext.slice("aesgcm:v2:".length, 48));
});

test.skipIf(process.platform !== "linux")("browser auth accepts a decrypted Linux session secret and rejects wrong material", () => {
  const key = randomBytes(32);
  const secret = randomBytes(32).toString("base64url");
  const path = keyFile(key);
  const environment = { SYNCARE_SESSION_SECRET: randomBytes(32).toString("base64url"), SYNCARE_BACKEND_ORIGIN: "http://127.0.0.1:8080", SYNCARE_WEB_ORIGIN: "http://127.0.0.1:3000", SYNCARE_ALLOW_LOCAL_HTTP: "true" };
  const sealed = sealLinux(secret, key);
  expect(authConfiguration({ ...environment, SYNCARE_PRIVATE_KEY_FILE: path, SYNCARE_SESSION_SECRET: sealed }).secret).toBe(secret);
  writeFileSync(path, randomBytes(32), { mode: 0o600 });
  chmodSync(path, 0o600);
  let failure: unknown;
  try { authConfiguration({ ...environment, SYNCARE_PRIVATE_KEY_FILE: path, SYNCARE_SESSION_SECRET: sealed }); } catch (error) { failure = error; }
  expect((failure as Error)?.message).toBe("private_material_unavailable");
  expect(String(failure)).not.toContain(secret);
  expect(String(failure)).not.toContain(path);
  expect(String(failure)).not.toContain(sealed);
});

test("browser auth requires private key and exact HTTPS origins or the explicit loopback exception", () => {
  const environment = { SYNCARE_SESSION_SECRET: randomBytes(32).toString("base64url"), SYNCARE_BACKEND_ORIGIN: "http://127.0.0.1:8080", SYNCARE_WEB_ORIGIN: "http://127.0.0.1:3000", SYNCARE_ALLOW_LOCAL_HTTP: "true" };
  expect(authConfiguration(environment).webOrigin).toBe(environment.SYNCARE_WEB_ORIGIN);
  expect(() => authConfiguration({ ...environment, SYNCARE_SESSION_SECRET: "" })).toThrow();
  expect(() => authConfiguration({ ...environment, SYNCARE_WEB_ORIGIN: "*" })).toThrow();
  expect(() => authConfiguration({ ...environment, SYNCARE_ALLOW_LOCAL_HTTP: "false" })).toThrow();
  expect(() => authConfiguration({ ...environment, SYNCARE_WEB_ORIGIN: "http://192.168.1.2:3000" })).toThrow();
});
