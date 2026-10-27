import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  backend: vi.fn(),
  jar: null as null | { values: Map<string, string>; sets: { name: string; value: string; options: unknown }[]; get(name: string): { name: string; value: string } | undefined; set(name: string, value: string, options: unknown): void },
}));

vi.mock("next/headers", () => ({ cookies: async () => state.jar }));
vi.mock("@/lib/auth/server", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/auth/server")>();
  return { ...actual, backendAuthRequest: state.backend };
});

import { browserLogin, browserSession } from "../src/lib/auth/handlers";

const origin = "http://127.0.0.1:3000";
const token = `sc_${"A".repeat(43)}`;
const nurseGrant = {
  principal: { id: "synthetic-nurse", role: "nurse", capabilities: ["patient.read"] },
  expiresAt: "2099-01-01T00:00:00.000Z", sessionToken: token,
};

function jar() {
  const values = new Map<string, string>();
  const sets: { name: string; value: string; options: unknown }[] = [];
  return {
    values, sets,
    get: (name: string) => values.has(name) ? { name, value: values.get(name)! } : undefined,
    set: (name: string, value: string, options: unknown) => { values.set(name, value); sets.push({ name, value, options }); },
  };
}

function loginRequest(requestOrigin?: string, body = JSON.stringify({ identifier: "synthetic-nurse", password: "synthetic-password" })) {
  return new Request("http://127.0.0.1:3000/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", ...(requestOrigin ? { origin: requestOrigin } : {}) },
    body,
  });
}

beforeEach(() => {
  process.env.SYNCARE_SESSION_SECRET = "s".repeat(32);
  process.env.SYNCARE_BACKEND_ORIGIN = "http://127.0.0.1:8080";
  process.env.SYNCARE_WEB_ORIGIN = origin;
  process.env.SYNCARE_ALLOW_LOCAL_HTTP = "true";
  state.jar = jar();
  state.backend.mockReset();
});

describe("login Origin diagnostics (injected synthetic grants; not live authentication)", () => {
  test.each([["http://localhost:3000"], ["https://outside.invalid"], [undefined]])(
    "rejects Origin %j before credential exchange with the handler-local code",
    async requestOrigin => {
      const response = await browserLogin(loginRequest(requestOrigin));
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: "origin_not_allowed" } });
      expect(state.backend).not.toHaveBeenCalled();
      expect(state.jar!.sets).toHaveLength(0);
    },
  );

  test("the exact configured Origin still exchanges a nurse grant into the encrypted host cookie", async () => {
    state.backend.mockResolvedValueOnce(Response.json({ data: nurseGrant }));
    const response = await browserLogin(loginRequest(origin));
    expect(response.status).toBe(200);
    expect(state.backend).toHaveBeenCalledTimes(1);
    const session = state.jar!.sets.filter(cookie => cookie.name === "syncare_session");
    expect(session).toHaveLength(1);
    expect(session[0]!.value).not.toContain(token);
    expect(state.jar!.sets.some(cookie => cookie.name === "syncare_signed_out")).toBe(true);
  });

  test("an actual non-nurse grant stays forbidden, revoked and cookie-free", async () => {
    state.backend.mockImplementation(async (method: string, _data?: unknown, presented?: string) => {
      if (method === "POST") return Response.json({ data: { ...nurseGrant, principal: { ...nurseGrant.principal, role: "patient" } } });
      return Response.json({ data: { revoked: presented === token } });
    });
    const response = await browserLogin(loginRequest(origin));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "forbidden" } });
    expect(state.backend).toHaveBeenCalledTimes(2);
    expect(state.backend.mock.calls[1]).toEqual(["DELETE", undefined, token]);
    expect(state.jar!.values.has("syncare_session")).toBe(false);
  });

  test("logout Origin failure is distinct and occurs before saved cookies are used", async () => {
    state.jar!.values.set("syncare_session", "caller-controlled-cookie");
    const response = await browserSession(new Request("http://127.0.0.1:3000/api/auth/session", {
      method: "DELETE", headers: { origin: "http://localhost:3000", "x-csrf-token": "synthetic-csrf" },
    }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "origin_not_allowed" } });
    expect(state.backend).not.toHaveBeenCalled();
    expect(state.jar!.sets).toHaveLength(0);
  });
});
