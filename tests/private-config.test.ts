import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { unprotectEnvironment } from "../src/lib/security/private-config";

const sentinel = "synthetic-private-value-sentinel";
const sealedValue = (text: string) => `dpapi:v1:${Buffer.from(text, "utf8").toString("base64")}`;

describe("dashboard-owned private configuration adapter", () => {
  test("plain configuration passes through unchanged without a sibling checkout", () => {
    const environment = { SYNCARE_SESSION_SECRET: "plain-synthetic-secret", SYNCARE_WEB_ORIGIN: "http://127.0.0.1:3000", OPTIONAL: undefined };
    expect(unprotectEnvironment(environment)).toBe(environment);
    expect(environment).toMatchObject({ SYNCARE_SESSION_SECRET: "plain-synthetic-secret", SYNCARE_WEB_ORIGIN: "http://127.0.0.1:3000", OPTIONAL: undefined });
    const source = readFileSync(new URL("../src/lib/security/private-config.ts", import.meta.url), "utf8");
    expect(source).not.toContain("SynCare-be");
    expect(source).not.toContain("private-files.cjs");
    expect(readFileSync(new URL("../src/lib/auth/cookie-session.ts", import.meta.url), "utf8")).toContain('"../security/private-config"');
  });

  test.each(["dpapi:v1:", "dpapi:v1:not+base64!", "dpapi:v1:AAAA-AA", `dpapi:v1:${"A".repeat(64)}`])(
    "malformed or semantically invalid envelope %j fails closed without leaking its value",
    value => {
      const environment: Record<string, string | undefined> = { SYNTHETIC: value };
      let failure: unknown;
      try { unprotectEnvironment(environment); } catch (error) { failure = error; }
      if (value === `dpapi:v1:${"A".repeat(64)}`) {
        // Valid base64 with the right prefix reaches the platform/decryption boundary instead of shape acceptance.
        expect(failure).toBeInstanceOf(Error);
        expect((failure as Error).message).toMatch(process.platform === "win32" ? /private_material_unavailable|invalid_private_envelope/ : /windows_protection_required/);
      } else {
        expect((failure as Error).message).toBe("invalid_private_envelope");
      }
      expect(String(failure)).not.toContain(value);
      expect(String(failure)).not.toContain(sentinel);
    },
  );

  test.each([
    `dpapi:v2:${"A".repeat(64)}`,
    `dpapi:${"A".repeat(64)}`,
    `dpapi:v10:${"A".repeat(64)}`,
  ])("unsupported DPAPI envelope form %j fails closed without leaking its value", value => {
    const environment: Record<string, string | undefined> = { SYNTHETIC: value };
    let failure: unknown;
    try { unprotectEnvironment(environment); } catch (error) { failure = error; }
    expect((failure as Error)?.message).toBe("invalid_private_envelope");
    expect(environment.SYNTHETIC).toBe(value);
    expect(String(failure)).not.toContain(value);
    expect(String(failure)).not.toContain("AAAAAAAA");
  });

  test.skipIf(process.platform === "win32")("a well-formed DPAPI value rejects explicitly on non-Windows", () => {
    const value = sealedValue(sentinel);
    expect(() => unprotectEnvironment({ SYNTHETIC: value })).toThrow("windows_protection_required");
    expect(() => unprotectEnvironment({ SYNTHETIC: value })).not.toThrow(sentinel);
  });

  test.skipIf(process.platform !== "win32")("Windows-only synthetic CurrentUser parity and corrupt round-trip (NOT RUN on Linux)", async ctx => {
    const require = createRequire(import.meta.url);
    const candidates = ["../../backend/src/security/private-files.cjs", "../../SynCare-be/src/security/private-files.cjs", "../../syncare-be/src/security/private-files.cjs"];
    const referencePath = candidates.map(candidate => fileURLToPath(new URL(candidate, import.meta.url))).find(existsSync);
    if (!referencePath) return ctx.skip("backend private-files sibling is unavailable");
    const reference = require(referencePath) as { protectText(text: string): string };
    const sealed = reference.protectText(sentinel);
    expect(sealed.startsWith("dpapi:v1:")).toBe(true);
    expect(unprotectEnvironment({ SYNTHETIC: sealed }).SYNTHETIC).toBe(sentinel);
    const corrupt = sealed.slice(0, -4) + "AAAA";
    expect(() => unprotectEnvironment({ SYNTHETIC: corrupt })).toThrow(/private_material_unavailable|invalid_private_envelope/);
    expect(() => unprotectEnvironment({ SYNTHETIC: corrupt })).not.toThrow(sentinel);
  });
});
