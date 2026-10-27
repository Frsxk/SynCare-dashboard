import {readPrivateJson} from '../../SynCare-be/src/security/private-files.cjs'
import { expect, type Page, type APIRequestContext } from "@playwright/test";

export const accounts = readPrivateJson(new URL("../../SynCare-be/data/local-demo-accounts.json", import.meta.url)) as {
  nurses: { identifier: string; password: string }[];
};
export const manifest = readPrivateJson(new URL("../../SynCare-be/data/local-demo-manifest.json", import.meta.url)) as {
  patients: { patientId: string; nurseIdentifier: string }[];
};
export const targetPatient = manifest.patients[2]!.patientId;
export async function loginNurse(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Identitas akun").fill(accounts.nurses[0]!.identifier);
  await page.evaluate(password => {
    const input = document.getElementById("password") as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, password);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, accounts.nurses[0]!.password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace$/, { timeout: 20000 });
  await expect(page.getByRole("button", { name: "Keluar", exact: true })).toBeEnabled({ timeout: 20000 });
}
export async function mutationHeaders(request: APIRequestContext) {
  const session = await (await request.get("/api/auth/session")).json();
  return { Origin: "http://127.0.0.1:3101", "X-CSRF-Token": session.data.csrfToken as string, "Idempotency-Key": crypto.randomUUID() };
}
export const syntheticSource = `DATA SINTETIS UNTUK PENGUJIAN M03, BUKAN PASIEN NYATA.
Diagnosis: congestive heart failure (CHF), NYHA III.
length_of_stay_days: 6. admission_type: emergency. comorbidity_count: 4. admissions_prior_12m: 3.
Obat: furosemide 40 mg sekali sehari. Instruksi: kontrol dan pembatasan garam sesuai arahan dokter.
Kebutuhan tindak lanjut: pemantauan gejala dan kepatuhan obat.`;
