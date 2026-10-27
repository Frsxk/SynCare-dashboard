import { createCipheriv, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, linkSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { unprotectEnvironment } from "../src/lib/security/private-config";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn(() => { throw new Error("child_process_called"); }) }));

const aad = "SynCare.local.private.v1:aesgcm:v1";
const sentinel = "synthetic-linux-private-value-sentinel";
const directories: string[] = [];

function workspace(): string {
  const directory = mkdtempSync(join(tmpdir(), "syncare-private-config-"));
  directories.push(directory);
  return directory;
}

function keyFile(key: Buffer, mode = 0o600): string {
  const path = join(workspace(), "private.key");
  writeFileSync(path, key, { mode });
  chmodSync(path, mode);
  return path;
}

function seal(text: string, key: Buffer, options: { aad?: string; version?: string } = {}): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(options.aad ?? aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return `aesgcm:${options.version ?? "v1"}:${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64")}`;
}

function envelope(raw: Buffer): string {
  return `aesgcm:v1:${raw.toString("base64")}`;
}

function payload(value: string): Buffer {
  return Buffer.from(value.slice("aesgcm:v1:".length), "base64");
}

function message(run: () => unknown): string {
  try { run(); } catch (error) { return (error as Error).message; }
  throw new Error("expected_failure");
}

afterEach(() => {
  while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true });
});

describe.skipIf(process.platform !== "linux")("Linux AES-256-GCM private configuration", () => {
  test("decodes the exact iv||tag||ciphertext envelope with the documented AAD and raw key file", () => {
    const key = randomBytes(32);
    const path = keyFile(key);
    const value = `sc_${randomBytes(32).toString("base64url")}`;
    const environment: Record<string, string | undefined> = {
      SYNCARE_PRIVATE_KEY_FILE: path,
      SYNCARE_SESSION_SECRET: seal(value, key),
      PLAIN_SETTING: "unchanged",
      OPTIONAL: undefined,
    };
    expect(unprotectEnvironment(environment)).toBe(environment);
    expect(environment.SYNCARE_SESSION_SECRET).toBe(value);
    expect(environment.PLAIN_SETTING).toBe("unchanged");
    expect(environment.OPTIONAL).toBeUndefined();
  });

  test("uses only the SYNCARE_PRIVATE_KEY_FILE from the supplied environment object", () => {
    const explicitKey = randomBytes(32);
    const otherKey = randomBytes(32);
    const explicitPath = keyFile(explicitKey);
    const otherPath = keyFile(otherKey);
    const previous = process.env.SYNCARE_PRIVATE_KEY_FILE;
    process.env.SYNCARE_PRIVATE_KEY_FILE = otherPath;
    try {
      expect(unprotectEnvironment({ SYNCARE_PRIVATE_KEY_FILE: explicitPath, SYNTHETIC: seal(sentinel, explicitKey) }).SYNTHETIC).toBe(sentinel);
      expect(message(() => unprotectEnvironment({ SYNTHETIC: seal(sentinel, otherKey) }))).toBe("private_key_unavailable");
    } finally {
      if (previous === undefined) delete process.env.SYNCARE_PRIVATE_KEY_FILE;
      else process.env.SYNCARE_PRIVATE_KEY_FILE = previous;
    }
  });

  test("rejects a wrong key or mismatched AAD without exposing secrets", () => {
    const key = randomBytes(32);
    const path = keyFile(key);
    const sealed = seal(sentinel, key);
    expect(message(() => unprotectEnvironment({ SYNCARE_PRIVATE_KEY_FILE: path, SYNTHETIC: seal(sentinel, randomBytes(32)) }))).toBe("private_material_unavailable");
    const failure = message(() => unprotectEnvironment({ SYNCARE_PRIVATE_KEY_FILE: path, SYNTHETIC: seal(sentinel, key, { aad: `${aad}:extra` }) }));
    expect(failure).toBe("private_material_unavailable");
    expect(failure).not.toContain(sentinel);
    expect(failure).not.toContain(path);
    expect(failure).not.toContain(sealed);
  });

  test("rejects corrupted ciphertext, corrupted tag and structurally short payloads", () => {
    const key = randomBytes(32);
    const path = keyFile(key);
    const raw = payload(seal(sentinel, key));
    expect(raw.length).toBeGreaterThan(28);
    const corruptCiphertext = Buffer.from(raw);
    corruptCiphertext[raw.length - 1] = corruptCiphertext[raw.length - 1]! ^ 1;
    const corruptTag = Buffer.from(raw);
    corruptTag[12] = corruptTag[12]! ^ 1;
    for (const value of [envelope(corruptCiphertext), envelope(corruptTag)]) {
      expect(message(() => unprotectEnvironment({ SYNCARE_PRIVATE_KEY_FILE: path, SYNTHETIC: value }))).toBe("private_material_unavailable");
    }
    for (const length of [0, 12, 27]) {
      expect(message(() => unprotectEnvironment({ SYNCARE_PRIVATE_KEY_FILE: path, SYNTHETIC: envelope(Buffer.alloc(length)) }))).toBe("invalid_private_envelope");
    }
  });

  test("decodes an authenticated empty value with a tag and no ciphertext bytes", () => {
    const key = randomBytes(32);
    const path = keyFile(key);
    const sealed = seal("", key);
    expect(payload(sealed).length).toBe(28);
    expect(unprotectEnvironment({ SYNCARE_PRIVATE_KEY_FILE: path, SYNTHETIC: sealed }).SYNTHETIC).toBe("");
  });

  test.each([
    `aesgcm:v2:${Buffer.alloc(32).toString("base64")}`,
    `aesgcm:${Buffer.alloc(32).toString("base64")}`,
    `aesgcm:v10:${Buffer.alloc(32).toString("base64")}`,
  ])("rejects unsupported envelope form %j instead of treating it as a literal", value => {
    const path = keyFile(randomBytes(32));
    const environment = { SYNCARE_PRIVATE_KEY_FILE: path, SYNTHETIC: value };
    expect(message(() => unprotectEnvironment(environment))).toBe("invalid_private_envelope");
    expect(environment.SYNTHETIC).toBe(value);
  });

  test.each([
    "aesgcm:v1:AAAA AAA=",
    "aesgcm:v1:AAAA-AAA",
    "aesgcm:v1:AAAA\nAAAA",
    "aesgcm:v1:AAA",
    "aesgcm:v1:AAAAA",
    "aesgcm:v1:",
  ])("rejects non-canonical or incomplete base64 %j", value => {
    const path = keyFile(randomBytes(32));
    expect(message(() => unprotectEnvironment({ SYNCARE_PRIVATE_KEY_FILE: path, SYNTHETIC: value }))).toBe("invalid_private_envelope");
  });

  test("rejects missing, relative, non-regular, wrong-sized, over-permissive, linked and symlinked key files", () => {
    const key = randomBytes(32);
    const safe = keyFile(key);
    const target = keyFile(key);
    const hardlink = join(dirname(target), "hardlink.key");
    linkSync(target, hardlink);
    const symlink = join(workspace(), "symlink.key");
    symlinkSync(safe, symlink);
    const directory = join(workspace(), "directory.key");
    mkdirSync(directory);
    const missing = join(workspace(), "missing.key");
    const wrongMode = keyFile(key, 0o644);
    const groupReadable = keyFile(key, 0o640);
    const ownerReadOnly = keyFile(key, 0o400);
    const ownerExecutable = keyFile(key, 0o700);
    const specialBits = keyFile(key, 0o4600);
    const short = keyFile(randomBytes(31));
    const long = keyFile(randomBytes(33));
    for (const path of [missing, "private.key", directory, wrongMode, groupReadable, ownerReadOnly, ownerExecutable, specialBits, short, long, target, symlink]) {
      expect(message(() => unprotectEnvironment({ SYNCARE_PRIVATE_KEY_FILE: path, SYNTHETIC: seal(sentinel, key) }))).toBe("private_key_unavailable");
    }
    expect(message(() => unprotectEnvironment({ SYNCARE_PRIVATE_KEY_FILE: safe, SYNTHETIC: seal(sentinel, randomBytes(32)) }))).toBe("private_material_unavailable");
  });

  test("re-reads the key file so rotation cannot resurrect a cached plaintext", () => {
    const first = randomBytes(32);
    const second = randomBytes(32);
    const path = keyFile(first);
    const sealed = seal(sentinel, first);
    expect(unprotectEnvironment({ SYNCARE_PRIVATE_KEY_FILE: path, SYNTHETIC: sealed }).SYNTHETIC).toBe(sentinel);
    writeFileSync(path, second, { mode: 0o600 });
    chmodSync(path, 0o600);
    expect(message(() => unprotectEnvironment({ SYNCARE_PRIVATE_KEY_FILE: path, SYNTHETIC: sealed }))).toBe("private_material_unavailable");
  });

  test("does not write decrypted material to the console", () => {
    const key = randomBytes(32);
    const path = keyFile(key);
    const spies = (["log", "info", "warn", "error", "debug"] as const).map(method => vi.spyOn(console, method));
    try {
      unprotectEnvironment({ SYNCARE_PRIVATE_KEY_FILE: path, SYNTHETIC: seal(sentinel, key) });
      expect(message(() => unprotectEnvironment({ SYNTHETIC: seal(sentinel, key) }))).toBe("private_key_unavailable");
    } finally {
      spies.forEach(spy => spy.mockRestore());
    }
    expect(spies.every(spy => spy.mock.calls.length === 0)).toBe(true);
  });

  test("decrypts without spawning a child process or passing material through shell arguments", () => {
    const key = randomBytes(32);
    const path = keyFile(key);
    expect(unprotectEnvironment({ SYNCARE_PRIVATE_KEY_FILE: path, SYNTHETIC: seal(sentinel, key) }).SYNTHETIC).toBe(sentinel);
    expect(vi.mocked(execFileSync)).not.toHaveBeenCalled();
  });
});
