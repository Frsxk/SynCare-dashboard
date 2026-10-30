import { describe, expect, test, vi } from 'vitest';
import { createGateway } from '../src/lib/api/bff';
import { resolveNurseSession } from '../src/lib/auth/server';
import type { NurseSession } from '../src/lib/auth/session-contract';

const session: NurseSession = {
  token: 'synthetic-server-session', csrfToken: 'synthetic-csrf-binding',
  principal: { id: 'synthetic-nurse', role: 'nurse', displayName: 'Perawat demo' },
};
type Dependencies = Parameters<typeof createGateway>[0];
function setup(overrides: Partial<Dependencies> = {}) {
  const upstream = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ fixture: 'synthetic-only' }, { headers: { 'set-cookie': 'synthetic-upstream-cookie=not-for-browser' } }));
  const gateway = createGateway({
    resolveSession: async () => session, fetch: upstream,
    backendOrigin: () => 'https://api.example.invalid', webOrigin: () => 'https://nurse.example.invalid',
    allowLoopbackHttp: () => false, ...overrides,
  });
  return { gateway, upstream };
}
function get(path = 'v1/patients', headers: HeadersInit = {}) {
  return new Request(`https://nurse.example.invalid/api/syncare/${path}`, { headers });
}
function post(overrides: HeadersInit = {}, body = '{"profile":{}}') {
  return new Request('https://nurse.example.invalid/api/syncare/v1/patients', {
    method: 'POST', body,
    headers: { 'content-type': 'application/json', origin: 'https://nurse.example.invalid',
      'x-csrf-token': session.csrfToken, 'idempotency-key': 'fe74cf3c-7583-414e-a1ef-2f5211b1aaf0', ...overrides },
  });
}

describe('BFF transport boundary (injected synthetic session; not a real login)', () => {
  test('session resolver requires a request-scoped cookie store and cannot create a fallback principal', async () => {
    await expect(resolveNurseSession()).rejects.toThrow('outside a request scope');
  });

  test.each([['https:', 'outside'], ['v1', 'patients', '..'], ['v1', 'patients', 'a%2Fb'], ['v1', 'unknown']])(
    'rejects non-allowlisted segments %j without contacting an upstream', async (...segments) => {
      const { gateway, upstream } = setup();
      expect((await gateway(get(), segments)).status).toBe(404);
      expect(upstream).not.toHaveBeenCalled();
    },
  );

  test('unknown method and query keys do not become an arbitrary proxy', async () => {
    const { gateway, upstream } = setup();
    expect((await gateway(new Request(get().url, { method: 'PUT' }), ['v1', 'patients'])).status).toBe(405);
    expect((await gateway(get('v1/patients?url=https://outside.invalid'), ['v1', 'patients'])).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  test('generic proxy never relays raw login session grants to browser JavaScript', async () => {
    const { gateway, upstream } = setup();
    expect((await gateway(post(), ['v1', 'auth', 'login'])).status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  test('caller authorization/cookie is not evidence of a valid session', async () => {
    const { gateway, upstream } = setup({ resolveSession: async () => null });
    const result = await gateway(get('v1/patients', { authorization: 'Bearer caller-sentinel', cookie: 'session=caller-sentinel' }), ['v1', 'patients']);
    expect(result.status).toBe(401);
    expect(await result.text()).not.toContain('caller-sentinel');
    expect(upstream).not.toHaveBeenCalled();
  });

  test('session lookup failure never exposes its raw exception', async () => {
    const { gateway } = setup({ resolveSession: async () => { throw new Error('secret-sentinel'); } });
    const result = await gateway(get(), ['v1', 'patients']);
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain('secret-sentinel');
  });

  test('same-origin and session-bound CSRF are both required for mutations', async () => {
    const { gateway, upstream } = setup();
    expect((await gateway(post({ origin: 'https://outside.invalid' }), ['v1', 'patients'])).status).toBe(403);
    expect((await gateway(post({ 'x-csrf-token': '' }), ['v1', 'patients'])).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  test('idempotency key and bounded structural JSON are required before forwarding', async () => {
    const { gateway, upstream } = setup();
    expect((await gateway(post({ 'idempotency-key': '' }), ['v1', 'patients'])).status).toBe(400);
    for (const body of ['not-json', '[]', JSON.stringify({ note: 'x'.repeat(262144) })]) {
      expect((await gateway(post({}, body), ['v1', 'patients'])).status).toBe(400);
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  test('forwards only the trusted session credential and explicit request headers', async () => {
    const { gateway, upstream } = setup();
    const result = await gateway(post({ authorization: 'Bearer caller-value', cookie: 'extra=caller-value' }), ['v1', 'patients']);
    expect(result.status).toBe(200);
    const [url, options] = upstream.mock.calls[0]!;
    const headers = new Headers(options?.headers);
    expect(url).toBe('https://api.example.invalid/api/v1/patients');
    expect(headers.get('authorization')).toBe(`Bearer ${session.token}`);
    expect(headers.has('cookie')).toBe(false);
    expect(options?.cache).toBe('no-store');
    expect(options?.redirect).toBe('manual');
    expect(result.headers.get('cache-control')).toContain('private, no-store');
    expect(result.headers.get('vary')).toBe('Cookie');
    expect(result.headers.has('set-cookie')).toBe(false);
  });

  test('unsafe configured origins fail closed', async () => {
    for (const backend of ['https://user:secret@api.example.invalid', 'https://api.example.invalid/other', 'http://remote.example.invalid']) {
      const { gateway, upstream } = setup({ backendOrigin: () => backend });
      const result = await gateway(get(), ['v1', 'patients']);
      expect(result.status).toBe(503);
      expect(await result.text()).not.toContain('secret');
      expect(upstream).not.toHaveBeenCalled();
    }
  });

  test('loopback HTTP is accepted only with its explicit development exception', async () => {
    const denied = setup({ backendOrigin: () => 'http://127.0.0.1:8080' });
    expect((await denied.gateway(get(), ['v1', 'patients'])).status).toBe(503);
    const allowed = setup({ backendOrigin: () => 'http://127.0.0.1:8080', allowLoopbackHttp: () => true });
    expect((await allowed.gateway(get(), ['v1', 'patients'])).status).toBe(200);
  });

  test('upstream redirects, HTML and transport errors cannot become fabricated success', async () => {
    for (const upstreamResponse of [new Response(null, { status: 302, headers: { location: 'https://outside.invalid' } }),
      new Response('<secret-sentinel>', { headers: { 'content-type': 'text/html' } })]) {
      const { gateway } = setup({ fetch: vi.fn<typeof fetch>().mockResolvedValue(upstreamResponse) });
      const result = await gateway(get(), ['v1', 'patients']);
      expect(result.status).toBeGreaterThanOrEqual(500);
      expect(result.headers.has('location')).toBe(false);
      expect(await result.text()).not.toContain('secret-sentinel');
    }
    const failed = vi.fn<typeof fetch>().mockRejectedValue(new Error('private-upstream-detail'));
    const { gateway } = setup({ fetch: failed });
    const mutation = await gateway(post(), ['v1', 'patients']);
    expect(mutation.status).toBe(502);
    expect((await mutation.json()).error).toMatchObject({ code: 'outcome_unknown', retryable: false });
    expect(failed).toHaveBeenCalledTimes(1);
  });

  test('separate sessions remain request-private', async () => {
    const first = setup();
    const secondSession = { ...session, token: 'another-synthetic-session', principal: { ...session.principal, id: 'other-nurse' } };
    const second = setup({ resolveSession: async () => secondSession });
    await Promise.all([first.gateway(get(), ['v1', 'patients']), second.gateway(get(), ['v1', 'patients'])]);
    expect(new Headers(first.upstream.mock.calls[0]![1]?.headers).get('authorization')).toBe(`Bearer ${session.token}`);
    expect(new Headers(second.upstream.mock.calls[0]![1]?.headers).get('authorization')).toBe(`Bearer ${secondSession.token}`);
  });

  test('timed-out mutations report unknown delivery and are never automatically repeated', async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation((_input, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('synthetic timeout', 'AbortError')), { once: true });
    }));
    const { gateway } = setup({ fetch: transport, timeoutMs: 10 });
    const response = await gateway(post(), ['v1', 'patients']);
    expect(response.status).toBe(502);
    expect((await response.json()).error).toMatchObject({ code: 'outcome_unknown', retryable: false });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  test('SSE returns the first chunk before completion and preserves cancellation', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('event: snapshot\ndata: {}\n\n')); },
      cancel() { cancelled = true; },
    });
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream, { headers: { 'content-type': 'text/event-stream' } }));
    const { gateway } = setup({ fetch: transport });
    const result = await gateway(get('v1/reviews/review-a/stream', { 'last-event-id': 'review-a:2' }), ['v1', 'reviews', 'review-a', 'stream']);
    expect(result.headers.get('content-type')).toBe('text/event-stream');
    expect(new Headers(transport.mock.calls[0]![1]?.headers).get('last-event-id')).toBe('review-a:2');
    const reader = result.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('event: snapshot');
    await reader.cancel();
    expect(cancelled).toBe(true);
  });

  test('nurse boundary keeps alert reads/actions and never proxies patient emergency creation', async () => {
    const emergency = (path: string, method: string) => new Request(`https://nurse.example.invalid/api/syncare/${path}`, {
      method, body: method === 'POST' ? '{"reason":"Patient asks for help"}' : undefined,
      headers: { 'content-type': 'application/json', origin: 'https://nurse.example.invalid',
        'x-csrf-token': session.csrfToken, 'idempotency-key': 'fe74cf3c-7583-414e-a1ef-2f5211b1aaf0' },
    });
    const blocked = setup();
    expect((await blocked.gateway(emergency('v1/patients/patient-a/emergencies', 'POST'), ['v1', 'patients', 'patient-a', 'emergencies'])).status).toBe(404);
    expect(blocked.upstream).not.toHaveBeenCalled();
    const allowed = setup();
    expect((await allowed.gateway(get('v1/alerts'), ['v1', 'alerts'])).status).toBe(200);
    expect((await allowed.gateway(emergency('v1/alerts/alert-a/actions', 'POST'), ['v1', 'alerts', 'alert-a', 'actions'])).status).toBe(200);
    expect(allowed.upstream).toHaveBeenCalledTimes(2);
  });
});
