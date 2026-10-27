import { test, expect, type Page } from '@playwright/test';
import { readPrivateJson } from '../../SynCare-be/src/security/private-files.cjs';

test.use({ trace: 'off', screenshot: 'off' });
const base = 'http://127.0.0.1:3001';
const fixture = readPrivateJson(new URL('../../SynCare-be/data/m10-fixtures-private.json', import.meta.url));
const cases = readPrivateJson(new URL('../../SynCare-be/data/m10-cross-client-private.json', import.meta.url)).cases;
const sdk = readPrivateJson(new URL('../../SynCare-be/data/m10-sdk-identity_commit-evidence.json', import.meta.url));
const sees = async (page: Page, text: string) => expect.poll(async () => (await page.locator('body').ariaSnapshot()).includes(text), { timeout: 30000 }).toBe(true);
const edit = async (page: Page, label: string, value: string) => {
  const field = page.getByRole('textbox', { name: label === 'Pertanyaan' ? /^Pertanyaan(?:\s|$)/ : label, exact: label !== 'Pertanyaan' });
  await field.click();
  await expect.poll(() => field.evaluate(element => document.activeElement === element)).toBe(true);
  await page.keyboard.press('Control+A'); await page.keyboard.insertText(value);
};
async function inspect(page: Page) {
  let text = '';
  for (let i = 0; i < 9; i++) {
    text += '\n' + await page.locator('body').ariaSnapshot();
    await page.mouse.wheel(0, 500);
  }
  expect(text).not.toMatch(/ID (akun|pasien|laporan|booking|pengajuan):|Skor F[12]:|Sumber versi|Baseline asli|Pencatat:|Detail SATUSEHAT|Diterapkan:|rencana_disetujui_workflow_sintetis|draf_edukasi_tidak_disetujui|DRAFT pending human approval/);
  return text;
}

test('compiled patient demo omits technical details, keeps care warnings, and uses calendar/clock controls', async ({ page }, info) => {
  test.setTimeout(180000);
  const grants: string[] = [], errors: string[] = [];
  let writes = 0;
  page.on('pageerror', error => errors.push(error.name));
  page.on('request', request => { if (request.method() === 'POST' && /\/(checkins|bookings)$/.test(new URL(request.url()).pathname)) writes++; });
  page.on('response', async response => { if (response.url().endsWith('/api/v1/auth/login') && response.ok()) grants.push((await response.json()).data.sessionToken); });
  const go = async (route: string, title: string) => { await page.evaluate(route => { location.hash = route; }, route); await sees(page, title); };
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base);
    await page.locator('flt-semantics-placeholder').waitFor({ state: 'attached' });
    await page.locator('flt-semantics-placeholder').evaluate(element => (element as HTMLElement).click());
    for (const patient of fixture.patients) {
      await edit(page, 'Identitas akun', patient.identifier); await edit(page, 'Kata sandi', patient.password);
      await page.getByRole('button', { name: 'Masuk', exact: true }).click(); await sees(page, 'Akun saya');
      expect(await inspect(page)).not.toContain(patient.patientId);
      await go('/patient/home', 'Ringkasan saya'); await inspect(page);
      await page.screenshot({ path: info.outputPath(`patient-${patient.slot}-overview.png`) });
      await go('/patient/profile', 'Profil saya'); await inspect(page);
      await go('/patient/plan', patient.slot === 'high' ? 'Persetujuan terverifikasi:' : 'Belum ada rencana terverifikasi');
      await inspect(page);
      if (patient.slot === 'high') {
        await go(`/patient/bookings/${cases.booking_complete.id}`, 'Kunjungan selesai'); await inspect(page);
        await page.setViewportSize({ width: 320, height: 844 });
        await go('/patient/homecare/post-discharge-nurse-demo/request', 'Ajukan homecare');
        await page.getByRole('button', { name: /Tanggal kunjungan/ }).click();
        await sees(page, 'Pilih tanggal');
        await page.screenshot({ path: info.outputPath('patient-calendar.png') });
        await page.getByRole('button', { name: 'Pilih tanggal', exact: true }).click();
        await page.getByRole('button', { name: /Jam mulai \(WIB\)/ }).click(); await sees(page, 'Pilih jam');
        await page.screenshot({ path: info.outputPath('patient-clock.png') });
        await page.getByRole('button', { name: 'Pilih jam', exact: true }).click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        await inspect(page);
        await page.setViewportSize({ width: 390, height: 844 });
        await go('/patient/ask', 'Tanya Rencana');
        await edit(page, 'Pertanyaan', 'Apa aktivitas tindak lanjut rutin pada rencana saya?');
        const answerResponse = page.waitForResponse(response => /\/questions$/.test(response.url()) && response.request().method() === 'POST');
        await page.getByRole('button', { name: 'Tanya', exact: true }).click();
        const answer = (await (await answerResponse).json()).data;
        expect(answer.kind).toBe('answer'); await sees(page, 'Sumber jawaban');
        const shown = await inspect(page);
        for (const citation of answer.citations) expect(shown).not.toContain(citation.id);
      } else {
        const report = sdk.data.reports.find((record: { patientId: string }) => record.patientId === patient.patientId);
        await go(`/patient/checkins/${report.id}`, 'Perlu pertolongan segera');
        const urgent = await inspect(page); expect(urgent).toContain('Jangan menunggu balasan aplikasi');
        await go(`/patient/alerts/${cases.acute_alert.id}`, 'Status: Ditutup'); await inspect(page);
      }
      await go('/account', 'Akun saya');
      await page.getByRole('button', { name: 'Keluar', exact: true }).click(); await sees(page, 'Masuk ke akun');
    }
    expect(writes).toBe(0); expect(errors).toEqual([]);
  } finally {
    for (const token of grants) await page.request.delete(base + '/api/v1/auth/session', { headers: { Authorization: `Bearer ${token}`, Origin: base } }).catch(() => {});
  }
});
