import "server-only";
import { execFileSync } from "node:child_process";
import { createDecipheriv } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { isAbsolute } from "node:path";

const dpapiPrefix = "dpapi:v1:";
const aesPrefix = "aesgcm:v1:";
const entropy = "SynCare.local.private.v1";
const aesAdditionalData = `${entropy}:aesgcm:v1`;
const powershell = "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
const maxEnvelopeLength = 32 * 1024 * 1024;
const keySize = 32;
const ivSize = 12;
const tagSize = 16;
const unwrapped = new Map<string, string>();

function fail(code: string): never {
  throw new Error(code);
}

function transform(value: Buffer, operation: "Protect" | "Unprotect"): Buffer {
  if (process.platform !== "win32") fail("windows_protection_required");
  const script = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $entropy=[Text.Encoding]::UTF8.GetBytes('${entropy}'); $result=[Security.Cryptography.ProtectedData]::${operation}($bytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))`;
  try {
    // The secret travels only through stdin/stdout. Arguments contain the fixed script, never configuration material.
    const output = execFileSync(powershell, ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], {
      input: value.toString("base64"), encoding: "utf8", windowsHide: true, timeout: 15000, stdio: ["pipe", "pipe", "pipe"],
    });
    return Buffer.from(output.trim(), "base64");
  } catch { return fail("private_material_unavailable"); }
}

function unprotectDpapi(text: string): string {
  if (!text.startsWith(dpapiPrefix) || text.length > maxEnvelopeLength) fail("invalid_private_envelope");
  const payload = text.slice(dpapiPrefix.length);
  if (!/^[A-Za-z0-9+/]+=*$/.test(payload)) fail("invalid_private_envelope");
  if (!unwrapped.has(text)) unwrapped.set(text, transform(Buffer.from(payload, "base64"), "Unprotect").toString("utf8"));
  return unwrapped.get(text)!;
}

function decodeCanonicalBase64(payload: string): Buffer {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload)) fail("invalid_private_envelope");
  const decoded = Buffer.from(payload, "base64");
  if (decoded.toString("base64") !== payload) fail("invalid_private_envelope");
  return decoded;
}

// Linux envelope: aesgcm:v1: + canonical base64(iv[12] || tag[16] || ciphertext).
function parseAesEnvelope(text: string): Buffer {
  if (!text.startsWith(aesPrefix) || text.length > maxEnvelopeLength) fail("invalid_private_envelope");
  const raw = decodeCanonicalBase64(text.slice(aesPrefix.length));
  if (raw.length < ivSize + tagSize) fail("invalid_private_envelope");
  return raw;
}

// Raw 32-byte key from the explicit absolute path in this environment object; never generated or cached.
function readKey(environment: Record<string, string | undefined>): Buffer {
  const path = environment.SYNCARE_PRIVATE_KEY_FILE;
  if (typeof path !== "string" || !isAbsolute(path)) fail("private_key_unavailable");
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = fstatSync(descriptor);
    const uid = process.getuid?.();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size !== keySize || (stat.mode & 0o7777) !== 0o600 ||
      uid === undefined || stat.uid !== uid) fail("private_key_unavailable");
    const key = Buffer.alloc(keySize);
    let offset = 0;
    while (offset < keySize) {
      const read = readSync(descriptor, key, offset, keySize - offset, offset);
      if (read === 0) fail("private_key_unavailable");
      offset += read;
    }
    return key;
  } catch {
    return fail("private_key_unavailable");
  } finally {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* descriptor already unusable */ }
    }
  }
}

function decryptAesGcm(raw: Buffer, key: Buffer): string {
  try {
    const iv = raw.subarray(0, ivSize);
    const tag = raw.subarray(ivSize, ivSize + tagSize);
    const ciphertext = raw.subarray(ivSize + tagSize);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(aesAdditionalData, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return fail("private_material_unavailable");
  }
}

// Dashboard-owned adapter: only the environment unwrapping needed by server auth, with no sibling source import.
export function unprotectEnvironment(environment: Record<string, string | undefined> = process.env): Record<string, string | undefined> {
  let aesKey: Buffer | undefined;
  try {
    for (const [name, value] of Object.entries(environment)) {
      if (typeof value !== "string") continue;
      if (value.startsWith("aesgcm:")) {
        // Parse before the platform check so unsupported versions fail identically everywhere.
        const raw = parseAesEnvelope(value);
        if (process.platform === "win32") fail("unsupported_private_envelope");
        aesKey ??= readKey(environment);
        environment[name] = decryptAesGcm(raw, aesKey);
      } else if (value.startsWith("dpapi:")) {
        // Every enveloped value is passed to unprotectDpapi so unsupported versions fail closed rather than being used as literals.
        environment[name] = unprotectDpapi(value);
      }
    }
  } finally {
    aesKey?.fill(0);
  }
  return environment;
}
