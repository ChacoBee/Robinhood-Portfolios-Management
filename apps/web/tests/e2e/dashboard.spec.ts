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

const routesWithObservedSource = new Set<string>([
  '/',
  '/accounts',
  '/accounts/acct-synth-individual',
  '/holdings',
  '/holdings/inst-synth-1',
  '/performance?range=YTD',
  '/analytics',
  '/activity',
  '/activity/reconciliation',
  '/alerts',
]);

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

  test('content uses the full frame with capped gutters and compact ordinary headings', async ({ page }) => {
    for (const width of [1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      await gotoPage(page, '/accounts');

      const layout = await page.locator('.dashboard-main').evaluate((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const frameRect = document.querySelector('.app-frame')?.getBoundingClientRect();
        const headingStyle = getComputedStyle(element.querySelector('.page-heading h1')!);
        return {
          frameWidth: frameRect?.width ?? 0,
          mainWidth: rect.width,
          paddingLeft: style.paddingLeft,
          paddingRight: style.paddingRight,
          headingSize: Number.parseFloat(headingStyle.fontSize),
        };
      });

      expect(layout.mainWidth, `main width at ${width}px`).toBeCloseTo(layout.frameWidth, 0);
      expect(layout.paddingLeft).toBe('32px');
      expect(layout.paddingRight).toBe('32px');
      expect(layout.headingSize).toBeLessThanOrEqual(32);
    }
  });

  test('narrow phones keep ordinary page headings compact while retaining the primary portfolio value hierarchy', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoPage(page, '/accounts');

    const headingSize = await page.locator('.page-heading h1').evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(headingSize).toBeLessThanOrEqual(32);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page.getByRole('heading', { name: 'Portfolio value' })).toBeVisible();
    const primaryValueSize = await page.locator('.hero-value').evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(primaryValueSize).toBeGreaterThan(headingSize);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });

  test('accounts use the shared neutral financial surface contract', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await gotoPage(page, '/accounts');

    const account = page.locator('.account-card').first();
    await expect(account).toHaveCSS('background-color', 'rgb(18, 21, 26)');
    await expect(account).toHaveCSS('background-image', 'none');
    await expect(account).toHaveCSS('border-radius', '12px');
    await expect(account).toHaveCSS('border-top-color', 'rgb(37, 43, 53)');
    await expect(account).toHaveCSS('box-shadow', 'none');
    await account.hover();
    await expect(account).toHaveCSS('transform', 'none');
    await expect(account).toHaveCSS('box-shadow', 'none');
  });

  test('desktop navigation links retain 44px touch targets', async ({ page }) => {
    for (const width of [1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await gotoPage(page, '/');
      await expect(page.locator('.side-rail')).toBeVisible();
      const heights = await page.locator('.side-rail .nav-link').evaluateAll((links) =>
        links.map((link) => link.getBoundingClientRect().height),
      );
      expect(heights.every((height) => height >= 44), `nav targets at ${width}px`).toBe(true);
    }
  });

  test('persistent header reports observed freshness and explicit unavailable state', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoPage(page, '/');

    const shellStatus = page.getByRole('status', { name: 'Shell data source status' });
    await expect(shellStatus).toContainText('Synthetic Demo');
    await expect(shellStatus).toContainText('fresh');
    await expect(shellStatus).toContainText('Aug 25, 2026, 10:14 AM ET');
    await expect(page.getByRole('region', { name: 'Data source and quality' })).toBeVisible();

    await gotoPage(page, '/settings');
    await expect(shellStatus).toContainText('Source unavailable');
    await expect(shellStatus).toContainText('Freshness unavailable');
  });

  test('persistent header clears or replaces source observations during client-side navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoPage(page, '/');

    const shellStatus = page.getByRole('status', { name: 'Shell data source status' });
    await expect(shellStatus).toContainText('Synthetic Demo');
    await expect(shellStatus).toContainText('fresh');

    await page.getByRole('link', { name: 'Allocation' }).click();
    await expect(page).toHaveURL(/\/analytics$/);
    await expect(shellStatus).toContainText('Synthetic Demo');
    await expect(shellStatus).toContainText('fresh');
    await expect(shellStatus).toContainText('Timestamp unavailable');
    await expect(shellStatus).not.toContainText('Aug 25, 2026, 10:14 AM ET');

    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(shellStatus).toContainText('Source unavailable');
    await expect(shellStatus).toContainText('Freshness unavailable');
    await expect(shellStatus).not.toContainText('Synthetic Demo');
    await expect(shellStatus).not.toContainText('Aug 25, 2026, 10:14 AM ET');
  });

  test('shell focus remains visible and reduced motion disables transitions', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoPage(page, '/');

    await page.keyboard.press('Tab');
    const focused = page.locator(':focus-visible');
    await expect(focused).toBeVisible();
    expect(await focused.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    const transition = await page.locator('.nav-link').first().evaluate((element) => getComputedStyle(element).transitionDuration);
    expect(transition.split(',').every((value) => value.trim() === '0s')).toBe(true);
  });

  test('shared financial surfaces use compact neutral panels', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await gotoPage(page, '/');

    const hero = page.locator('.hero-card');
    await expect(hero).toHaveCSS('background-color', 'rgb(18, 21, 26)');
    await expect(hero).toHaveCSS('border-radius', '12px');
    await expect(hero).toHaveCSS('border-top-color', 'rgb(37, 43, 53)');
    await expect(page.locator('.hero-context')).toHaveCSS('color', 'rgb(127, 135, 146)');
    await expect(page.locator('.insight-card')).toHaveCSS('background-color', 'rgb(18, 21, 26)');
    await expect(page.locator('.insight-card')).toHaveCSS('border-top-color', 'rgb(37, 43, 53)');

    await gotoPage(page, '/holdings');
    await expect(page.locator('.data-card')).toHaveCSS('background-color', 'rgb(18, 21, 26)');
    const firstNumericCell = page.locator('tbody td').filter({ hasText: '$' }).first();
    expect(await firstNumericCell.evaluate((element) => getComputedStyle(element).fontVariantNumeric)).toContain('tabular-nums');
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
    test(`${route} renders an accurate shell source state`, async ({ page }) => {
      await gotoPage(page, route);
      const shellStatus = page.getByRole('status', { name: 'Shell data source status' });
      if (routesWithObservedSource.has(route)) {
        await expect(shellStatus).toContainText('Synthetic Demo');
      } else {
        await expect(shellStatus).toContainText('Source unavailable');
      }
      const scan = await new AxeBuilder({ page }).analyze();
      expect(scan.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([]);
    });
  }

  test('mobile navigation uses a native More disclosure with natural keyboard order', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoPage(page, '/holdings');

    const navigation = page.getByRole('navigation', { name: 'Mobile primary' });
    await expect(navigation).toHaveAttribute('data-aurum-ready', 'true');
    await expect(navigation.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(navigation.getByRole('link', { name: 'Holdings' })).toHaveAttribute('aria-current', 'page');
    await expect(navigation.getByRole('link', { name: 'Activity' })).toBeVisible();
    await expect(navigation.getByRole('link', { name: 'Alerts' })).toBeVisible();
    const trigger = navigation.getByRole('button', { name: 'More navigation' });
    await expect(trigger).not.toHaveAttribute('aria-haspopup');
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const disclosure = page.getByLabel('More pages');
    await expect(disclosure).toBeVisible();
    await expect(disclosure.getByRole('link').allTextContents()).resolves.toEqual([
      'Accounts',
      'Performance',
      'Allocation',
      'Settings',
    ]);
    await expect(page.getByRole('menu')).toHaveCount(0);

    const firstLink = disclosure.getByRole('link', { name: 'Accounts' });
    expect(await trigger.evaluate((button, link) => Boolean(button.compareDocumentPosition(link as Node) & Node.DOCUMENT_POSITION_FOLLOWING), await firstLink.elementHandle())).toBe(true);
    await page.keyboard.press('Tab');
    await expect(firstLink).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(disclosure).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    const menuStyles = await disclosure.evaluate((element) => {
      const style = getComputedStyle(element);
      const firstDisclosureLink = element.querySelector('a');
      return {
        backgroundColor: style.backgroundColor,
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow,
        linkGap: firstDisclosureLink ? getComputedStyle(firstDisclosureLink).columnGap : '',
      };
    });
    expect(menuStyles).toEqual({
      backgroundColor: 'rgb(23, 27, 34)',
      borderRadius: '10px',
      boxShadow: 'rgba(0, 0, 0, 0.24) 0px 8px 20px 0px',
      linkGap: '8px',
    });
    await page.locator('.header-title').click();
    await expect(disclosure).toBeHidden();
  });

  test('narrow mobile keeps a visible compact source and freshness status without overflow', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await gotoPage(page, '/');

    const shellStatus = page.getByRole('status', { name: 'Shell data source status' });
    await expect(shellStatus).toBeVisible();
    await expect(shellStatus).toContainText('Synthetic Demo');
    await expect(shellStatus).toContainText('fresh');
    const bounds = await shellStatus.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(360);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

    await gotoPage(page, '/settings');
    await expect(shellStatus).toContainText('Source unavailable');
    await expect(shellStatus).toContainText('Freshness unavailable');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
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
