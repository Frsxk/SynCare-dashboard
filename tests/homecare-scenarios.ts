import {readPrivateJson} from '../../SynCare-be/src/security/private-files.cjs'
import { writeFileSync, existsSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { loginNurse } from "./local-accounts";
export const testPatients = (readPrivateJson(new URL("../../SynCare-be/data/local-demo-accounts.json", import.meta.url)) as { patients: { identifier: string; password: string }[] }).patients;
export const toWib = (instant: number | string) => { const value = new Date((typeof instant === "number" ? instant : Date.parse(instant)) + 7 * 3600000).toISOString().slice(0, 19); return value.endsWith(":00") ? value.slice(0, 16) : value; };
export function slotAfter(delay = 120000) { const start = Math.floor((Date.now() + delay) / 1000) * 1000; return { start, end: start + 60000 }; }
export async function createScenario(scenario: string) {
  const account = testPatients[0]!;
  const login = await fetch("http://127.0.0.1:8080/api/v1/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier: account.identifier, password: account.password }) });
  expect(login.status).toBe(200); const grant = (await login.json()).data;
  const preferred = slotAfter(86400000);
  try {
    const response = await fetch(`http://127.0.0.1:8080/api/v1/patients/${grant.principal.patientId}/bookings`, { method: "POST", headers: { authorization: `Bearer ${grant.sessionToken}`, "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ serviceId: "post-discharge-nurse-demo", address: { fullAddress: `Alamat sintetis skenario ${scenario}`, kelurahan: "Kelurahan uji", kecamatan: "Kecamatan uji", city: "Jakarta Pusat" }, preferredWindow: { startAt: new Date(preferred.start).toISOString(), endAt: new Date(preferred.end).toISOString(), timezone: "Asia/Jakarta" }, visitNote: `DATA UJI M06: ${scenario}. Tidak ada kunjungan nyata.` }) });
    expect(response.status).toBe(201); return (await response.json()).data.resource as { id: string; patientId: string; version: number };
  } finally { await fetch("http://127.0.0.1:8080/api/v1/auth/session", { method: "DELETE", headers: { authorization: `Bearer ${grant.sessionToken}` } }); }
}
export async function openScenario(page: Page, id: string) {
  await loginNurse(page); await page.goto(`/homecare/${id}`); await expect(page.getByRole("button", { name: "Mulai review", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Mulai review", exact: true }).click(); await expect(page.getByText("Status: Sedang ditinjau", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Perawat kunjungan")).toBeEnabled();
}
export async function fillSchedule(page: Page, slot: { start: number; end: number }) {
  await page.getByLabel("Perawat kunjungan").selectOption({ label: "Perawat sintetis A" });
  await page.getByLabel("Mulai kunjungan (WIB)").fill(toWib(slot.start)); await page.getByLabel("Selesai kunjungan (WIB)").fill(toWib(slot.end));
}
export function recordScenario(scenario: string, id: string) {
  const file = new URL("../../SynCare-be/data/m06-browser-evidence.json", import.meta.url);
  const prior = existsSync(file) ? readPrivateJson(file) : {};
  prior[scenario] = { id, verifiedAt: new Date().toISOString() }; writeFileSync(file, JSON.stringify(prior, null, 2));
}
