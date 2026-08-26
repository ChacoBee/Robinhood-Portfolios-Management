import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const routes = [
  '/',
  '/accounts',
  '/accounts/acct-synth-individual',
  '/holdings',
  '/holdings/inst-synth-1',
  '/performance?range=YTD',
  '/analytics',
  '/activity',
  '/activity/imports',
  '/activity/reconciliation',
  '/alerts',
  '/settings',
] as const;

async function gotoPage(page: Page, route: string) {
  const response = await page.goto(route);
  expect(response?.ok()).toBe(true);
  return response;
}

test.describe('Aurum dashboard', () => {
  test('desktop shell uses the approved Aurum visual tokens and geometry', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await gotoPage(page, '/');

    const tokens = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return {
        canvas: root.getPropertyValue('--canvas').trim().toUpperCase(),
        panel: root.getPropertyValue('--panel').trim().toUpperCase(),
        border: root.getPropertyValue('--border').trim().toUpperCase(),
        gold: root.getPropertyValue('--gold').trim().toUpperCase(),
        rail: root.getPropertyValue('--rail-width').trim(),
        radius: root.getPropertyValue('--radius-lg').trim(),
      };
    });
    expect(tokens).toEqual({
      canvas: '#08090B', panel: '#12151A', border: '#252B35',
      gold: '#E2B93F', rail: '208px', radius: '12px',
    });
    await expect(page.locator('.side-rail')).toHaveCSS('width', '208px');
    await expect(page.locator('.global-header')).toHaveCSS('min-height', '68px');
    expect((await page.locator('.global-header').boundingBox())?.height).toBe(68);
  });

  test('serves browser security headers on rendered routes', async ({ request }) => {
    const response = await request.get('/');
    expect(response.status()).toBe(200);
    const headers = response.headers();
    expect(headers['content-security-policy']).toContain("default-src 'self'");
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
  });

  for (const route of routes) {
    test(`${route} renders a labeled synthetic source`, async ({ page }) => {
      await gotoPage(page, route);
      await expect(page.getByText('Synthetic Demo').first()).toBeVisible();
      const scan = await new AxeBuilder({ page }).analyze();
      expect(scan.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([]);
    });
  }

  test('mobile navigation exposes four direct destinations and the exact More menu', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoPage(page, '/holdings');

    const navigation = page.getByRole('navigation', { name: 'Mobile primary' });
    await expect(navigation).toHaveAttribute('data-aurum-ready', 'true');
    await expect(navigation.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(navigation.getByRole('link', { name: 'Holdings' })).toHaveAttribute('aria-current', 'page');
    await expect(navigation.getByRole('link', { name: 'Activity' })).toBeVisible();
    await expect(navigation.getByRole('link', { name: 'Alerts' })).toBeVisible();
    await navigation.getByRole('button', { name: 'More navigation' }).click();
    await expect(page.getByRole('menuitem').allTextContents()).resolves.toEqual([
      'Accounts',
      'Performance',
      'Allocation',
      'Settings',
    ]);
  });

  test('mobile shell keeps primary controls reachable and hides the desktop rail', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoPage(page, '/holdings');

    await expect(page.locator('.side-rail')).toBeHidden();
    await expect(page.locator('.mobile-tab-bar')).toBeVisible();
    const targets = await page.locator('.mobile-tab-bar a, .mobile-tab-bar button').evaluateAll((items) =>
      items.map((item) => item.getBoundingClientRect().height),
    );
    expect(targets.every((height) => height >= 44)).toBe(true);
    await expect(page.getByRole('heading', { name: 'Holdings' }).first()).toBeVisible();
  });

  test('screen privacy survives in-app navigation for the browser session', async ({ page }) => {
    await gotoPage(page, '/');
    await expect(page.locator('[data-aurum-island="screen-privacy"]').first()).toHaveAttribute('data-aurum-ready', 'true');
    await page.getByRole('button', { name: 'Hide financial values' }).click();
    await expect(page.getByText('$128,640.25').first()).toBeHidden();
    await gotoPage(page, '/holdings');
    await expect(page.getByText('$117,140.25')).toBeHidden();
    await expect(page.getByText('••••••').first()).toBeVisible();
  });

  test('safe Demo import requires preview and explicit confirmation', async ({ page }) => {
    await gotoPage(page, '/activity/imports');
    await expect(page.locator('[data-aurum-island="import-screen"]')).toHaveAttribute('data-aurum-ready', 'true');
    await page.getByRole('button', { name: 'Load synthetic fixture' }).click();
    await expect(page.getByRole('region', { name: 'Import preview rows' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm 2 selected' })).toBeEnabled();
    await page.getByRole('button', { name: 'Confirm 2 selected' }).click();
    await expect(page.getByText('Import complete. This changed only the local synthetic preview.')).toBeVisible();
  });

  test('alert evidence and destructive settings gates are interactive', async ({ page }) => {
    await gotoPage(page, '/alerts');
    await expect(page.locator('[data-aurum-island="alerts-center"]')).toHaveAttribute('data-aurum-ready', 'true');
    await page.getByRole('button', { name: 'Evidence' }).first().click();
    await expect(page.getByText(/Synthetic top-two concentration exceeded 30%/)).toBeVisible();

    await gotoPage(page, '/settings');
    await expect(page.locator('[data-aurum-island="data-controls"]')).toHaveAttribute('data-aurum-ready', 'true');
    const deletion = page.getByRole('button', { name: 'Preview deletion' });
    await expect(deletion).toBeDisabled();
    await page.getByLabel('Type DELETE SYNTHETIC DEMO').fill('DELETE SYNTHETIC DEMO');
    await expect(deletion).toBeEnabled();
  });

  test('key routes do not overflow at phone, tablet, or desktop widths', async ({ page }) => {
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ['/', '/holdings', '/activity/imports', '/settings']) {
        await gotoPage(page, route);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${route} overflows at ${width}px`).toBeLessThanOrEqual(1);
      }
    }
  });
});
