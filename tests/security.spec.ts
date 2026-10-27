import {readPrivateJson} from '../../SynCare-be/src/security/private-files.cjs'
import { randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { accounts, loginNurse } from './local-accounts';

const cases = readPrivateJson(new URL('../../SynCare-be/data/m10-cross-client-private.json', import.meta.url)).cases;
const patients = readPrivateJson(new URL('../../SynCare-be/data/m10-fixtures-private.json', import.meta.url)).patients as {slot:string;patientId:string;identifier:string;password:string}[];
const high = patients.find(patient => patient.slot === 'high')!;
test.use({ trace: 'off', screenshot: 'off' });

async function logout(context: BrowserContext) {
  const response = await context.request.get('/api/auth/session');
  if (response.ok()) {
    const session = await response.json();
    await context.request.delete('/api/auth/session', { headers: { Origin: 'http://127.0.0.1:3101', 'X-CSRF-Token': session.data.csrfToken } });
  }
}

async function otherLogin(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Identitas akun', { exact: true }).fill(accounts.nurses[1]!.identifier);
  await page.getByLabel('Kata sandi', { exact: true }).fill(accounts.nurses[1]!.password);
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect(page).toHaveURL(/\/workspace$/);
}

test('security_matrix_zero_leak: real cookie-bound nurse sessions cannot read foreign profile/report/booking/alert/review/stream', async ({ browser }) => {
  const first = await browser.newContext({ baseURL: 'http://127.0.0.1:3101' });
  const second = await browser.newContext({ baseURL: 'http://127.0.0.1:3101' });
  try {
    await loginNurse(await first.newPage());
    await otherLogin(await second.newPage());
    const paths = [
      `patients/${high.patientId}/overview`, `patients/${high.patientId}/checkins`,
      `bookings/${cases.booking_complete.id}`, `alerts/${cases.acute_alert.id}`,
      `reviews/${cases.plan_ui_approve.reviewId}`, `reviews/${cases.plan_ui_approve.reviewId}/stream`,
      `care-plan-drafts/${cases.plan_ui_approve.draftId}`, `patients/${high.patientId}/care-plans`,
    ];
    for (const path of paths) {
      const own = await first.request.get(`/api/syncare/v1/${path}`);
      expect(own.status()).toBe(200);
      await own.dispose();
      const foreign = await second.request.get(`/api/syncare/v1/${path}`, { headers: { 'X-Role': 'nurse', 'X-Patient-Id': high.patientId } });
      expect(foreign.status()).toBe(404);
      expect(await foreign.text()).not.toContain(high.patientId);
      expect(foreign.headers()['cache-control']).toContain('no-store');
    }
    const session = (await (await first.request.get('/api/auth/session')).json()).data;
    expect(session).not.toHaveProperty('token');
    expect(session).not.toHaveProperty('sessionToken');
  } finally {
    await logout(first); await logout(second); await first.close(); await second.close();
  }
});

test('security_matrix_zero_leak: cookie is private; forged origin/CSRF and arbitrary proxy cannot write or leak credentials', async ({ page, context }) => {
  await loginNurse(page);
  try {
    const cookie = (await context.cookies()).find(value => value.name === 'syncare_session')!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Lax');
    expect(await page.evaluate(() => document.cookie.includes('syncare_session'))).toBe(false);
    expect(await page.evaluate(() => Object.values(localStorage).some(value => /sc_[A-Za-z0-9_-]{43}/.test(value)))).toBe(false);
    const session = (await (await context.request.get('/api/auth/session')).json()).data;
    const before = await (await context.request.get(`/api/syncare/v1/patients/${high.patientId}/overview`)).json();
    for (const [origin, csrf] of [['https://attacker.invalid', session.csrfToken], ['http://127.0.0.1:3101', 'forged']]) {
      for (const path of ['patients', `patients/${high.patientId}/care-plan-drafts`, `alerts/${cases.acute_alert.id}/actions`, `bookings/${cases.booking_complete.id}/transitions`, `reviews/${cases.plan_ui_approve.reviewId}/decisions`]) {
        const denied = await context.request.post(`/api/syncare/v1/${path}`, { headers: { Origin: origin!, 'X-CSRF-Token': csrf!, 'Idempotency-Key': randomUUID() }, data: { malformed: 'M11 synthetic negative input' } });
        expect(denied.status()).toBe(403);
        expect(denied.headers()['cache-control']).toContain('no-store');
      }
    }
    expect((await context.request.get('/api/syncare/v1/patients?url=https://attacker.invalid')).status()).toBe(400);
    expect((await context.request.get('/api/syncare/v1/unknown')).status()).toBe(404);
    const after = await (await context.request.get(`/api/syncare/v1/patients/${high.patientId}/overview`)).json();
    expect(after.data).toEqual(before.data);
  } finally { await logout(context); }
});

test('security_matrix_zero_leak: patient login is denied on nurse BFF and logged-out cookie cannot replay protected pages', async ({ page, context }) => {
  const patientLogin = await context.request.post('/api/auth/login', { data: { identifier: high.identifier, password: high.password } });
  expect(patientLogin.status()).toBe(403);
  expect((await context.cookies()).some(value => value.name === 'syncare_session')).toBe(false);
  await loginNurse(page);
  const cookie = (await context.cookies()).find(value => value.name === 'syncare_session')!;
  await page.getByRole('button', { name: 'Keluar', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect.poll(async () => (await context.request.get('/api/auth/session')).status()).toBe(401);
  expect((await context.request.get(`/api/syncare/v1/patients/${high.patientId}/overview`, { headers: { Cookie: `${cookie.name}=${cookie.value}` } })).status()).toBe(401);
  await page.goto(`/patients/${high.patientId}`);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Kategori risiko pasien', { exact: true })).toHaveCount(0);
});
