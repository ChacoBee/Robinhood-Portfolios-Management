import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

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

test.describe('Aurum dashboard', () => {
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
      const response = await page.goto(route);
      expect(response?.ok()).toBe(true);
      await expect(page.getByText('Synthetic Demo').first()).toBeVisible();
      const scan = await new AxeBuilder({ page }).analyze();
      expect(scan.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([]);
    });
  }

  test('mobile navigation exposes four direct destinations and the exact More menu', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/holdings');

    const navigation = page.getByRole('navigation', { name: 'Mobile primary' });
    await expect(navigation.getByRole('link', { name: 'Overview' })).toBeVisible();
    await expect(navigation.getByRole('link', { name: 'Holdings' })).toHaveAttribute('aria-current', 'page');
    await expect(navigation.getByRole('link', { name: 'Activity' })).toBeVisible();
    await expect(navigation.getByRole('link', { name: 'Alerts' })).toBeVisible();
    await navigation.getByRole('button', { name: 'More navigation' }).click();
    await expect(page.getByRole('menuitem').allTextContents()).resolves.toEqual([
      'Accounts',
      'Performance',
      'Analytics',
      'Settings',
    ]);
  });

  test('screen privacy survives in-app navigation for the browser session', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Hide financial values' }).click();
    await expect(page.getByText('$128,640.25').first()).toBeHidden();
    await page.goto('/holdings');
    await expect(page.getByText('$117,140.25')).toBeHidden();
    await expect(page.getByText('••••••').first()).toBeVisible();
  });

  test('safe Demo import requires preview and explicit confirmation', async ({ page }) => {
    await page.goto('/activity/imports');
    await page.getByRole('button', { name: 'Load synthetic fixture' }).click();
    await expect(page.getByRole('region', { name: 'Import preview rows' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm 2 selected' })).toBeEnabled();
    await page.getByRole('button', { name: 'Confirm 2 selected' }).click();
    await expect(page.getByText('Import complete. This changed only the local synthetic preview.')).toBeVisible();
  });

  test('alert evidence and destructive settings gates are interactive', async ({ page }) => {
    await page.goto('/alerts');
    await page.getByRole('button', { name: 'Evidence' }).first().click();
    await expect(page.getByText(/Synthetic top-two concentration exceeded 30%/)).toBeVisible();

    await page.goto('/settings');
    const deletion = page.getByRole('button', { name: 'Preview deletion' });
    await expect(deletion).toBeDisabled();
    await page.getByLabel('Type DELETE SYNTHETIC DEMO').fill('DELETE SYNTHETIC DEMO');
    await expect(deletion).toBeEnabled();
  });

  test('key routes do not overflow at phone, tablet, or desktop widths', async ({ page }) => {
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ['/', '/holdings', '/activity/imports', '/settings']) {
        await page.goto(route);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${route} overflows at ${width}px`).toBeLessThanOrEqual(1);
      }
    }
  });
});
