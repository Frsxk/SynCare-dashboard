import { expect, test } from '@playwright/test';
import { loginNurse } from './local-accounts';
test.use({ trace: 'off', screenshot: 'off' });

test('AT16 browser login reflows at320/1200 text200 with48px controls, visible keyboard focus and semantic color contrast', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Masuk', exact: true })).toBeEnabled();
  for (const width of [320, 768, 1200]) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    for (const control of await page.locator('main input,main button').all()) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  }
  const identifier = page.getByLabel('Identitas akun', { exact: true });
  await identifier.focus(); await identifier.press('Tab');
  await expect(page.getByLabel('Kata sandi', { exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(identifier).toBeFocused();
  expect(await identifier.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none');
  await page.getByRole('button', { name: 'Masuk', exact: true }).press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: 'Isi identitas akun.' })).toBeVisible();
  const ratios = await page.evaluate(() => {
    const tokens = getComputedStyle(document.documentElement);
    const color = (name: string) => tokens.getPropertyValue('--'+name).trim();
    const luminance = (hex: string) => {
      const rgb = hex.slice(1).match(/../g)!.map(value => parseInt(value,16)/255).map(value => value <= .04045 ? value/12.92 : ((value+.055)/1.055)**2.4);
      return rgb[0]!*.2126+rgb[1]!*.7152+rgb[2]!*.0722;
    };
    return [['foreground','background'],['muted-foreground','background'],['navigation','card'],['navigation','supporting-surface'],['primary-foreground','primary'],['primary-foreground','primary-hover'],['warning-foreground','warning'],['urgent-foreground','urgent']].map(([a,b]) => {
      const x=luminance(color(a!)),y=luminance(color(b!));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
    });
  });
  expect(Math.min(...ratios)).toBeGreaterThanOrEqual(4.5);
});

test('AT16 held browser request announces loading; typed503 shows retry and keyboard recovery reads actual assigned data', async ({ page, context }) => {
  await loginNurse(page);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let mode: 'failure' | 'actual' = 'failure';
  await page.route(url => url.pathname === '/api/syncare/v1/patients', async route => {
    await held;
    if (mode === 'actual') await route.continue();
    else await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'dependency_unavailable', message: 'M11_PRIVATE_SENTINEL must not be rendered', requestId: 'm11-fixture', retryable: true } }) });
  });
  try {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await page.goto('/patients');
    await expect(page.getByRole('status').filter({ hasText: 'Memuat data' })).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toBeVisible();
    expect(await page.getByRole('link', { name: /Pasien sintetis/ }).count()).toBe(0);
    release();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText('M11_PRIVATE_SENTINEL', { exact: false })).toHaveCount(0);
    mode = 'actual';
    const retry = page.getByRole('button', { name: 'Coba lagi', exact: true });
    await retry.focus(); await retry.press('Enter');
    await expect(page.locator('.patient-list a').first()).toBeVisible();
    for (const width of [320, 1200]) {
      await page.setViewportSize({ width, height: 800 });
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
    const skip = page.getByRole('link', { name: 'Lewati ke konten', exact: true });
    await skip.focus(); await skip.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
    const response = await context.request.get('/api/auth/session');
    if (response.ok()) { const session = await response.json(); await context.request.delete('/api/auth/session', { headers: { Origin:'http://127.0.0.1:3101', 'X-CSRF-Token':session.data.csrfToken } }); }
  }
});
