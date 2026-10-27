import {readPrivateJson} from '../../SynCare-be/src/security/private-files.cjs'
import { expect, test, type Page } from "@playwright/test";

test.use({ trace: "off" });
const accounts = readPrivateJson(new URL("../../SynCare-be/data/local-demo-accounts.json", import.meta.url)) as {
  nurses: { identifier: string; password: string }[]; patients: { identifier: string; password: string }[];
};
const manifest = readPrivateJson(new URL("../../SynCare-be/data/local-demo-manifest.json", import.meta.url)) as {
  nurses: { accountId: string; identifier: string }[]; patients: { patientId: string; nurseIdentifier: string }[];
};

async function login(page: Page, account = accounts.nurses[0]!) {
  await page.goto("/login");
  await page.getByLabel("Identitas akun").fill(account.identifier);
  await page.evaluate(password => {
    const input = document.getElementById("password") as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, password);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, account.password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.getByRole("heading", { name: "Ruang kerja perawat" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Keluar", exact: true })).toBeEnabled();
}

test("browser_session_isolation: two real nurse logins get private cookies and separate assigned patient scopes", async ({ browser }) => {
  const first = await browser.newContext(), second = await browser.newContext();
  try {
    const pageA = await first.newPage(), pageB = await second.newPage();
    await login(pageA);
    await login(pageB, accounts.nurses[1]!);
    const cookieA = (await first.cookies()).find(cookie => cookie.name === "syncare_session");
    expect(cookieA?.httpOnly).toBe(true);
    expect(cookieA?.sameSite).toBe("Lax");
    expect(cookieA?.value.startsWith("v1.")).toBe(true);
    expect(await pageA.evaluate(() => document.cookie.includes("syncare_session"))).toBe(false);
    expect(await pageA.evaluate(() => Object.values(localStorage).some(value => /sc_[A-Za-z0-9_-]{43}/.test(value)))).toBe(false);
    const ids = (page: Page) => page.evaluate(async () => {
      const response = await fetch("/api/syncare/v1/patients", { cache: "no-store" });
      const body = await response.json();
      return { status: response.status, ids: body.data.map((row: { id: string }) => row.id).sort() as string[] };
    });
    const actualA = await ids(pageA), actualB = await ids(pageB);
    expect(actualA.status).toBe(200); expect(actualB.status).toBe(200);
    expect(actualA.ids).toEqual(manifest.patients.filter(patient => patient.nurseIdentifier === accounts.nurses[0]!.identifier).map(patient => patient.patientId).sort());
    expect(actualB.ids).toEqual(manifest.patients.filter(patient => patient.nurseIdentifier === accounts.nurses[1]!.identifier).map(patient => patient.patientId).sort());
    const foreign = actualB.ids[0]!;
    expect((await first.request.get(`/api/syncare/v1/patients/${foreign}`)).status()).toBe(404);
  } finally { await first.close(); await second.close(); }
});

test("forged Origin and wrong CSRF are denied before registry writes; logout revokes cookie replay and browser back", async ({ page, context }) => {
  await login(page);
  const cookie = (await context.cookies()).find(value => value.name === "syncare_session")!;
  const session = await (await context.request.get("/api/auth/session")).json();
  const before = (await (await context.request.get("/api/syncare/v1/patients")).json()).data.length;
  const body = { profile: { displayName: "Synthetic forbidden mutation" }, initialCondition: null };
  const forged = await context.request.post("/api/syncare/v1/patients", { headers: { Origin: "https://attacker.invalid", "X-CSRF-Token": session.data.csrfToken, "Idempotency-Key": "00000000-0000-4000-8000-000000000001" }, data: body });
  expect(forged.status()).toBe(403);
  const csrf = await context.request.post("/api/syncare/v1/patients", { headers: { Origin: "http://127.0.0.1:3101", "X-CSRF-Token": "wrong", "Idempotency-Key": "00000000-0000-4000-8000-000000000002" }, data: body });
  expect(csrf.status()).toBe(403);
  expect((await (await context.request.get("/api/syncare/v1/patients")).json()).data.length).toBe(before);
  await page.getByRole("button", { name: "Keluar", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.request.get("/api/auth/session")).status()).toBe(401);
  await context.clearCookies();
  await context.addCookies([cookie]);
  expect((await context.request.get("/api/auth/session")).status()).toBe(401);
  await page.goBack();
  await expect(page.getByText(`ID akun: ${manifest.nurses[0]!.accountId}`, { exact: true })).toHaveCount(0);
});

test("offline logout closes local content and states that remote revocation is unconfirmed", async ({ page, context }) => {
  await login(page);
  await context.setOffline(true);
  await page.getByRole("button", { name: "Keluar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Akses lokal telah ditutup" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("belum terkonfirmasi");
  await expect(page.getByText(`ID akun: ${manifest.nurses[0]!.accountId}`, { exact: true })).toHaveCount(0);
  await context.setOffline(false);
  expect((await context.request.get("/api/syncare/v1/patients")).status()).toBe(401);
});

test("login form validates, rejects patient web login and reflows with keyboard focus at narrow large text", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/login");
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page.getByText("Isi identitas akun.", { exact: true })).toBeVisible();
  await expect(page.getByText("Isi kata sandi.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByLabel("Identitas akun").focus();
  expect(await page.getByLabel("Identitas akun").evaluate(input => getComputedStyle(input).outlineStyle)).toBe("solid");
  await page.screenshot({ path: testInfo.outputPath("login-320-text200.png"), fullPage: true });
  await page.getByLabel("Identitas akun").fill(accounts.patients[0]!.identifier);
  await page.evaluate(password => {
    const input = document.getElementById("password") as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, password);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, accounts.patients[0]!.password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Gunakan akun perawat" })).toBeVisible();
  expect((await page.context().cookies()).some(cookie => cookie.name === "syncare_session")).toBe(false);
});
