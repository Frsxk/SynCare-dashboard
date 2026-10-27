import { expect, test } from '@playwright/test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AsyncPanel, type PanelState } from '../src/components/states/async-panel';
import { ApiFailure } from '../src/lib/api/client';
import { TableViewport } from '../src/components/ui/table-viewport';
import { Shell } from '../src/components/layout/shell';

test('public foundation shows Indonesian identity and synthetic limitation', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  await expect(page).toHaveTitle('SynCare: Dashboard perawat');
  await expect(page.getByRole('heading', { name: 'Dashboard perawat' })).toBeVisible();
  await expect(page.getByRole('note')).toHaveText('Demo sintetis. Belum divalidasi klinis.');
  await expect(page.locator('html')).toHaveAttribute('lang', 'id');
});

test('protected workspace redirects without exposing private content', async ({ request }) => {
  const response = await request.get('/workspace', { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe('/login');
  expect(response.headers()['cache-control']).toContain('no-store');
});

test('unverified caller cookie and bearer never unlock the BFF', async ({ request }) => {
  const response = await request.get('/api/syncare/v1/patients', {
    headers: { cookie: 'session=synthetic-caller-sentinel', authorization: 'Bearer synthetic-caller-sentinel' },
  });
  expect(response.status()).toBe(401);
  expect((await response.json()).error.code).toBe('unauthenticated');
  expect(response.headers()['cache-control']).toContain('private, no-store');
  expect(response.headers()['set-cookie']).toBeUndefined();
});

test('arbitrary proxy target/method are rejected', async ({ request }) => {
  expect((await request.get('/api/syncare/v1/unknown')).status()).toBe(404);
  expect((await request.put('/api/syncare/v1/patients')).status()).toBe(405);
  expect((await request.get('/api/syncare/v1/patients?url=https://outside.invalid')).status()).toBe(400);
});

test('foundation reflows at 320px and 200% root text size', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect(page.getByRole('heading', { name: 'Dashboard perawat' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('foundation-320-text200.png'), fullPage: true });
});

test('shared state fixture reflows with long content and visible keyboard focus', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  const styles = await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => (link as HTMLLinkElement).href));
  const recover = () => {};
  const states: PanelState[] = [
    { kind: 'loading' },
    { kind: 'empty', message: 'Belum ada laporan.' },
    { kind: 'no-matches', onClear: recover },
    { kind: 'error', failure: new ApiFailure('outcome_unknown'), onRetry: recover },
    { kind: 'content', content: `Laporan sintetis ${'x'.repeat(160)}`, refresh: { kind: 'error', failure: new ApiFailure('dependency_unavailable'), onRetry: recover } },
  ];
  const panels = states.map(state => renderToStaticMarkup(createElement(AsyncPanel, { state }))).join('<hr>');
  // Isolated markup fixture, not a production route or authenticated clinical screen.
  await page.setContent(`<html lang="id"><head>${styles.map(href => `<link rel="stylesheet" href="${href}">`).join('')}</head><body><main style="padding:1rem">${panels}</main></body></html>`);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect(page.getByText('Belum ada laporan.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.keyboard.press('Tab');
  const clear = page.getByRole('button', { name: 'Hapus filter' });
  await expect(clear).toBeFocused();
  expect(await clear.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid');
  const controls = await page.getByRole('button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().height));
  expect(controls.every(height => height >= 48)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('shared-states-320-text200.png'), fullPage: true });
});

test('shell and wide tables remain accessible without adding unavailable routes', async ({ page }, testInfo) => {
  await page.goto('/');
  const styles = await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => (link as HTMLLinkElement).href));
  const table = createElement('table', { style: { minWidth: '60rem' } },
    createElement('caption', null, 'Fixture tabel sintetis'),
    createElement('thead', null, createElement('tr', null,
      createElement('th', { scope: 'col' }, 'Identitas fixture'),
      createElement('th', { scope: 'col' }, 'Keterangan fixture'),
    )),
    createElement('tbody', null, createElement('tr', null,
      createElement('td', null, 'SYNTHETIC-ROW'),
      createElement('td', null, 'Data uji untuk memeriksa gulir tabel.'),
    )),
  );
  const markup = renderToStaticMarkup(createElement(Shell,
    { displayName: 'Fixture tampilan sintetis' },
    createElement(TableViewport, { label: 'Tabel uji sintetis' }, table),
  ));
  await page.setContent(`<html lang="id"><head>${styles.map(href => `<link rel="stylesheet" href="${href}">`).join('')}</head><body>${markup}</body></html>`);

  for (const textSize of ['100%', '200%']) {
    for (const width of [320, 768, 1200]) {
      await page.setViewportSize({ width, height: 800 });
      await page.evaluate(size => { document.documentElement.style.fontSize = size; }, textSize);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await expect(page.getByRole('navigation', { name: 'Navigasi perawat' })).toBeVisible();
      await expect(page.getByText('Belum tersedia', { exact: true })).toHaveCount(4);
      await expect(page.getByRole('navigation').getByRole('link')).toHaveCount(0);
    }
  }

  await page.setViewportSize({ width: 1200, height: 800 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '100%'; });
  await page.screenshot({ path: testInfo.outputPath('shell-table-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const skip = page.getByRole('link', { name: 'Lewati ke konten' });
  await skip.focus();
  await skip.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  const viewport = page.getByRole('region', { name: 'Tabel uji sintetis' });
  await viewport.focus();
  await expect(viewport).toBeFocused();
  expect(await viewport.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid');
  expect(await viewport.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => viewport.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('shell-table-320-text200.png'), fullPage: true });
});
