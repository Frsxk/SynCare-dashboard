import { expect, test } from "@playwright/test";
import { loginNurse } from "./local-accounts";
import { createScenario, fillSchedule, openScenario, recordScenario, slotAfter } from "./homecare-scenarios";
test.use({ trace: "off" });
test("terminal_action_reason_visible: required reason, uncertain rejection retains input and commits one terminal history", async ({ page }) => {
  const booking = await createScenario("rejection-reason"); await openScenario(page, booking.id);
  await page.getByRole("button", { name: "Tolak pengajuan", exact: true }).click(); await expect(page.getByRole("alert").filter({ hasText: "Isi alasan" })).toBeVisible();
  await page.getByLabel("Alasan untuk pasien").fill("Permintaan simulasi ditolak dengan alasan yang dapat dibaca pasien."); let drop = true; const keys: string[] = [];
  await page.route(`**/api/syncare/v1/bookings/${booking.id}/transitions`, route => { keys.push(route.request().headers()["idempotency-key"]!); if (drop) { drop = false; return route.abort(); } return route.continue(); });
  await page.getByRole("button", { name: "Tolak pengajuan", exact: true }).click(); await expect(page.getByRole("button", { name: "Periksa tindakan yang sama", exact: true })).toBeVisible(); await expect(page.getByLabel("Alasan untuk pasien")).toHaveValue("Permintaan simulasi ditolak dengan alasan yang dapat dibaca pasien.");
  await page.getByRole("button", { name: "Periksa tindakan yang sama", exact: true }).click(); await expect(page.getByText("Status: Ditolak", { exact: true })).toBeVisible(); expect(keys[0]).toBe(keys[1]);
  await expect(page.getByRole("button", { name: "Batalkan booking", exact: true })).toHaveCount(0); await expect(page.getByText("Permintaan simulasi ditolak dengan alasan yang dapat dibaca pasien.", { exact: true })).toBeVisible();
  await page.getByRole("navigation").getByRole("link", { name: "Homecare", exact: true }).click(); await expect(page.getByLabel("Status booking")).toHaveValue("active");
  await expect(page.locator(`a[href="/homecare/${booking.id}"]`)).toHaveCount(0); await page.getByLabel("Status booking").selectOption("Rejected"); await expect(page.locator(`a[href="/homecare/${booking.id}"]`)).toBeVisible();
  await page.getByLabel("Status booking").focus(); await page.getByLabel("Status booking").selectOption("all"); await expect(page.locator(`a[href="/homecare/${booking.id}"]`)).toBeVisible();
  await page.getByLabel("Status booking").selectOption("active"); await expect(page.locator(`a[href="/homecare/${booking.id}"]`)).toHaveCount(0); recordScenario("rejected", booking.id);
});
test("schedule/cancel independent sessions: stale cancel409 rereads, retains reason and explicit fresh cancellation commits", async ({ page, browser }) => {
  test.setTimeout(90000);
  const booking = await createScenario("schedule-cancel-race"); await openScenario(page, booking.id);
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:3101" }), other = await context.newPage();
  try {
    await loginNurse(other); await other.goto(`/homecare/${booking.id}`); await expect(other.getByRole("button", { name: "Batalkan booking", exact: true })).toBeEnabled(); await other.getByLabel("Alasan untuk pasien").fill("Pembatalan simulasi setelah membaca jadwal terbaru.");
    await fillSchedule(page, slotAfter()); await page.getByRole("button", { name: "Konfirmasi jadwal dan perawat", exact: true }).click(); await expect(page.getByText("Status: Terjadwal", { exact: true })).toBeVisible();
    const conflict = other.waitForResponse(r => r.url().endsWith(`/bookings/${booking.id}/transitions`) && r.status() === 409); await other.getByRole("button", { name: "Batalkan booking", exact: true }).click(); await conflict;
    await expect(other.getByText("Status: Terjadwal", { exact: true })).toBeVisible(); await expect(other.getByText("Pembatalan tersimpan.", { exact: true })).toHaveCount(0); await expect(other.getByLabel("Alasan untuk pasien")).toHaveValue("Pembatalan simulasi setelah membaca jadwal terbaru.");
    await expect(other.getByRole("button", { name: "Batalkan booking", exact: true })).toBeEnabled(); await other.getByRole("button", { name: "Batalkan booking", exact: true }).click(); await expect(other.getByText("Status: Dibatalkan", { exact: true })).toBeVisible();
    const stored = (await (await other.request.get(`/api/syncare/v1/bookings/${booking.id}`)).json()).data; expect(stored.timeline.filter((e: { toStatus: string }) => e.toStatus === "Cancelled")).toHaveLength(1); recordScenario("cancelled", booking.id);
  } finally { await context.close(); }
});
