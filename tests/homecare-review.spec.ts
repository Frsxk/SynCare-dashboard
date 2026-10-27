import {readPrivateJson} from '../../SynCare-be/src/security/private-files.cjs'
import { expect, test } from "@playwright/test";
import { loginNurse } from "./local-accounts";
const patients = (readPrivateJson(new URL("../../SynCare-be/data/local-demo-accounts.json", import.meta.url)) as { patients: { identifier: string; password: string }[] }).patients;
async function createBooking() {
  const account = patients[0]!;
  const response = await fetch("http://127.0.0.1:8080/api/v1/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier: account.identifier, password: account.password }) });
  expect(response.status).toBe(200);
  const grant = (await response.json()).data;
  try {
    const result = await fetch(`http://127.0.0.1:8080/api/v1/patients/${grant.principal.patientId}/bookings`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${grant.sessionToken}`, "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ serviceId: "post-discharge-nurse-demo", address: { fullAddress: "Alamat sintetis browser M05", kelurahan: "Kelurahan uji", kecamatan: "Kecamatan uji", city: "Jakarta Pusat" }, preferredWindow: { startAt: "2030-01-02T01:00:00.000Z", endAt: "2030-01-02T02:00:00.000Z", timezone: "Asia/Jakarta" }, visitNote: "Pengajuan sintetis browser." }) });
    expect(result.status).toBe(201);
    return (await result.json()).data.resource as { id: string; version: number };
  } finally { await fetch("http://127.0.0.1:8080/api/v1/auth/session", { method: "DELETE", headers: { authorization: `Bearer ${grant.sessionToken}` } }); }
}
test.use({ trace: "off" });
test("booking_review_ui_conflict: two real sessions, stale reviewer gets409/refetch, keyboard and narrow layout", async ({ page, browser }, testInfo) => {
  test.setTimeout(90000);
  const booking = await createBooking();
  const other = await browser.newContext({ baseURL: "http://127.0.0.1:3101" }), second = await other.newPage();
  try {
    await loginNurse(page); await loginNurse(second);
    await page.getByRole("navigation").getByRole("link", { name: "Homecare", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Antrean homecare" })).toBeVisible();
    const link = page.locator(`a[href="/homecare/${booking.id}"]`); await expect(link).toBeVisible(); await link.focus(); await link.press("Enter");
    await second.goto(`/homecare/${booking.id}`);
    await expect(page.getByRole("button", { name: "Mulai review", exact: true })).toBeEnabled();
    await expect(second.getByRole("button", { name: "Mulai review", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Mulai review", exact: true }).focus(); await page.getByRole("button", { name: "Mulai review", exact: true }).press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Status review tersimpan." })).toBeVisible();
    const conflict = second.waitForResponse(r => r.url().endsWith(`/bookings/${booking.id}/transitions`) && r.status() === 409);
    await second.getByRole("button", { name: "Mulai review", exact: true }).click(); await conflict;
    await expect(second.getByRole("alert").filter({ hasText: "Data telah berubah" })).toBeVisible();
    await expect(second.getByText("Status: Sedang ditinjau", { exact: true })).toBeVisible();
    await expect(second.getByText("Status review tersimpan.", { exact: true })).toHaveCount(0);
    const stored = (await (await second.request.get(`/api/syncare/v1/bookings/${booking.id}`)).json()).data;
    expect(stored.timeline.length).toBe(2); expect(stored.confirmedSlot).toBeNull(); expect(stored.assignedStaff).toBeNull();
    await page.screenshot({ path: testInfo.outputPath("m05-homecare-desktop.png"), fullPage: true });
    for (const width of [320, 768, 1280]) { await page.setViewportSize({ width, height: 800 }); await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true); }
    await page.setViewportSize({ width: 320, height: 800 }); await page.screenshot({ path: testInfo.outputPath("m05-homecare-320-text200.png"), fullPage: true });
  } finally { await other.close(); }
});
test("lost review response reconciles same key; refresh retains allowed detail and denial removes private content", async ({ page }) => {
  const booking = await createBooking(); await loginNurse(page); await page.goto(`/homecare/${booking.id}`);
  await expect(page.getByRole("button", { name: "Mulai review", exact: true })).toBeEnabled();
  const keys: string[] = []; let first = true;
  await page.route(`**/api/syncare/v1/bookings/${booking.id}/transitions`, async route => {
    keys.push(route.request().headers()["idempotency-key"]!);
    if (first) { first = false; const committed = await route.fetch(); expect(committed.status()).toBe(200); await route.abort(); } else await route.continue();
  });
  await page.getByRole("button", { name: "Mulai review", exact: true }).click();
  await expect(page.getByRole("button", { name: "Periksa review yang sama" })).toBeVisible();
  await page.getByRole("button", { name: "Periksa review yang sama" }).click();
  await expect(page.getByText("Status: Sedang ditinjau", { exact: true })).toBeVisible(); expect(keys.length).toBe(2); expect(keys[0]).toBe(keys[1]);
  await page.route(`**/api/syncare/v1/bookings/${booking.id}`, route => route.abort());
  await page.getByRole("button", { name: "Muat ulang pengajuan" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Layanan belum tersedia" })).toBeVisible();
  await expect(page.getByText(/Alamat sintetis browser M05,/)).toBeVisible();
  await page.unroute(`**/api/syncare/v1/bookings/${booking.id}`);
  await page.route(`**/api/syncare/v1/bookings/${booking.id}`, route => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { code: "not_found", message: "Data tidak ditemukan.", requestId: "revoked-synthetic", retryable: false } }) }));
  await page.getByRole("button", { name: "Muat ulang pengajuan" }).click();
  await expect(page.getByText(/Alamat sintetis browser M05,/)).toHaveCount(0);
});
