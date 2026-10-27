// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { LoginForm, loginFailureMessage } from "@/components/auth/login-form";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const originCopy = "Buka dashboard melalui alamat yang diberikan operator";
const roleCopy = "Gunakan akun perawat yang berwenang";
const genericCopy = "Masuk tidak dapat dilakukan";

describe("bounded login failure copy", () => {
  test("recognized collector codes select distinct safe Indonesian copy", () => {
    expect(loginFailureMessage(403, { error: { code: "origin_not_allowed", message: "ignore-me" } })).toContain(originCopy);
    expect(loginFailureMessage(403, { error: { code: "forbidden", message: "ignore-me" } })).toContain(roleCopy);
    expect(loginFailureMessage(401, { error: { code: "unauthenticated", message: "ignore-me" } })).toBe("Akun atau kata sandi tidak sesuai.");
    expect(loginFailureMessage(429, null)).toContain("Terlalu banyak percobaan");
    expect(loginFailureMessage(503, null)).toContain("Belum dapat terhubung");
  });

  test("unknown 403s and arbitrary server text never become an account-role claim", () => {
    const message = loginFailureMessage(403, { error: { code: "synthetic_unknown_code", message: "Origin https://caller.invalid secret-sentinel" } });
    expect(message).toContain(genericCopy);
    expect(message).not.toContain(roleCopy);
    expect(message).not.toContain("caller.invalid");
    expect(message).not.toContain("secret-sentinel");
    expect(loginFailureMessage(403, null)).toBe(message);
    expect(loginFailureMessage(403, { error: { code: "x".repeat(65) } })).toBe(message);
  });
});

describe("rendered login form errors", () => {
  async function submitWith(response: Response) {
    vi.stubGlobal("fetch", vi.fn(async () => response));
    render(createElement(LoginForm));
    fireEvent.change(screen.getByLabelText("Identitas akun"), { target: { value: "synthetic-nurse" } });
    fireEvent.change(screen.getByLabelText("Kata sandi"), { target: { value: "synthetic-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Masuk" }));
    return screen.findByRole("alert");
  }

  test("origin rejection renders actionable address guidance without echoing message or Origin", async () => {
    const alert = await submitWith(Response.json({ error: {
      code: "origin_not_allowed", message: "synthetic-untrusted-message <img src=x> http://localhost:3000",
      requestId: "synthetic-request", retryable: false,
    } }, { status: 403 }));
    expect(alert.textContent).toContain(originCopy);
    expect(alert.textContent).not.toContain(roleCopy);
    expect(alert.textContent).not.toContain("untrusted-message");
    expect(alert.textContent).not.toContain("localhost");
  });

  test("actual wrong-role rejection renders nurse-account copy", async () => {
    const alert = await submitWith(Response.json({ error: {
      code: "forbidden", message: "synthetic-untrusted-message", requestId: "synthetic-request", retryable: false,
    } }, { status: 403 }));
    expect(alert.textContent).toContain(roleCopy);
    expect(alert.textContent).not.toContain("untrusted-message");
  });
});
