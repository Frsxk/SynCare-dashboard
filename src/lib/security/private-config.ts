import "server-only";
import { execFileSync } from "node:child_process";

const envelopePrefix = "dpapi:v1:";
const entropy = "SynCare.local.private.v1";
const powershell = "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
const maxEnvelopeLength = 32 * 1024 * 1024;
const unwrapped = new Map<string, string>();

function transform(value: Buffer, operation: "Protect" | "Unprotect"): Buffer {
  if (process.platform !== "win32") throw new Error("windows_protection_required");
  const script = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $entropy=[Text.Encoding]::UTF8.GetBytes('${entropy}'); $result=[Security.Cryptography.ProtectedData]::${operation}($bytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))`;
  try {
    // The secret travels only through stdin/stdout. Arguments contain the fixed script, never configuration material.
    const output = execFileSync(powershell, ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], {
      input: value.toString("base64"), encoding: "utf8", windowsHide: true, timeout: 15000, stdio: ["pipe", "pipe", "pipe"],
    });
    return Buffer.from(output.trim(), "base64");
  } catch { throw new Error("private_material_unavailable"); }
}

function unprotectText(text: string): string {
  if (typeof text !== "string" || !text.startsWith(envelopePrefix) || text.length > maxEnvelopeLength ||
    !/^[A-Za-z0-9+/]+=*$/.test(text.slice(envelopePrefix.length))) throw new Error("invalid_private_envelope");
  if (!unwrapped.has(text)) unwrapped.set(text, transform(Buffer.from(text.slice(envelopePrefix.length), "base64"), "Unprotect").toString("utf8"));
  return unwrapped.get(text)!;
}

// Dashboard-owned adapter: only the environment unwrapping needed by server auth, with no sibling source import.
export function unprotectEnvironment(environment: Record<string, string | undefined> = process.env): Record<string, string | undefined> {
  for (const [key, value] of Object.entries(environment)) {
    // Every enveloped value is passed to unprotectText so unsupported versions fail closed rather than being used as literals.
    if (typeof value === "string" && value.startsWith("dpapi:")) environment[key] = unprotectText(value);
  }
  return environment;
}
