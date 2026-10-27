import { expect, test } from "@playwright/test";
import { loginNurse, mutationHeaders, targetPatient } from "./local-accounts";

test.use({ trace: "off" });
test("nurse_registry_discharge: create receipt, assigned list and profile conflict retain entered data without granting assignment", async ({ page, context }, testInfo) => {
  await loginNurse(page);
  await page.getByRole("navigation").getByRole("link", { name: "Pasien", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pasien yang ditugaskan" })).toBeVisible();
  await page.getByRole("button", { name: "Buat profil pasien" }).click();
  await expect(page.getByText("Isi nama pasien.")).toBeVisible();
  await page.getByLabel("Nama pasien").fill(`Profil sintetis M03 ${Date.now()}`);
  await page.getByLabel("Kondisi yang dicatat perawat").fill("Data sintetis untuk uji registrasi.");
  await page.getByRole("button", { name: "Buat profil pasien" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Operator perlu menetapkan penugasan" })).toBeVisible();
  await page.locator(`a[href="/patients/${targetPatient}"]`).click();
  await expect(page.getByLabel("Nama pasien")).toBeVisible();
  await expect(page.getByRole("button", { name: "Periksa hasil terbaru" })).toBeEnabled();
  await expect(page.getByRole("button", { name: /(?:Atur|Ubah) penugasan/ })).toHaveCount(0);
  const current = (await (await context.request.get(`/api/syncare/v1/patients/${targetPatient}`)).json()).data;
  const external = await context.request.patch(`/api/syncare/v1/patients/${targetPatient}`, {
    headers: await mutationHeaders(context.request), data: { expectedVersion: current.version, profile: { displayName: current.profile.displayName }, recordedCondition: "Kondisi terbaru dari sesi lain, sintetis." },
  });
  expect(external.status()).toBe(200);
  await page.getByLabel("Kondisi yang dicatat perawat").fill("Isian lokal dipertahankan setelah konflik.");
  const submitted = page.waitForRequest(request => request.method() === "PATCH" && request.url().endsWith(`/api/syncare/v1/patients/${targetPatient}`));
  await page.getByRole("button", { name: "Simpan profil", exact: true }).click();
  const body = (await submitted).postDataJSON();
  expect(body.recordedCondition).toBe("Isian lokal dipertahankan setelah konflik.");
  expect(body.expectedVersion).toBe(current.version);
  await expect(page.getByRole("alert").filter({ hasText: "Data telah berubah" })).toBeVisible();
  await expect(page.getByLabel("Kondisi yang dicatat perawat")).toHaveValue("Isian lokal dipertahankan setelah konflik.");
  await expect(page.getByText(/Data tersimpan versi.*Kondisi terbaru dari sesi lain/)).toBeVisible();
  const forbidden = await context.request.post(`/api/syncare/v1/patients/${targetPatient}/assignments`, {
    headers: await mutationHeaders(context.request), data: { operation: "grant", nurseAccountId: "synthetic-no-authority", expectedVersion: current.version },
  });
  expect(forbidden.status()).toBe(403);
  await page.screenshot({ path: testInfo.outputPath("m03-patient-desktop.png"), fullPage: true });
});

test("permission loss hides stale patient detail while an unavailable refresh retains content and offers retry", async ({ page }) => {
  await loginNurse(page);
  await page.goto(`/patients/${targetPatient}`);
  await expect(page.getByLabel("Nama pasien")).toBeVisible();
  const name = await page.getByRole("heading", { level: 1 }).textContent();
  await page.route(`**/api/syncare/v1/patients/${targetPatient}/overview`, route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: {
    code: "dependency_unavailable", message: "unavailable", requestId: "synthetic-unavailable", retryable: true,
  } }) }));
  await page.getByRole("button", { name: "Periksa hasil terbaru" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Layanan belum tersedia" })).toBeVisible();
  await expect(page.getByRole("heading", { name: name!, exact: true })).toBeVisible();
  await page.unroute(`**/api/syncare/v1/patients/${targetPatient}/overview`);
  await page.route(`**/api/syncare/v1/patients/${targetPatient}/overview`, route => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: {
    code: "not_found", message: "scope denied", requestId: "synthetic-denied", retryable: false,
  } }) }));
  await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
  await expect(page.getByText("Data tidak ditemukan.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: name!, exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Nama pasien")).toHaveCount(0);
});
