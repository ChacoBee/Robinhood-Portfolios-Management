# Aurum UI/UX Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh Aurum's global visual system and application shell into a compact, modern financial workspace without changing product behavior, data semantics, routes, or branding.

**Architecture:** Keep the existing React/vinext route and screen components intact. Introduce one pure page-context resolver and one focused navigation-icon component, then update the existing shell components and global CSS in small TDD cycles. Behavioral tests protect navigation, truth boundaries, privacy, and accessibility; Playwright computed-style and responsive checks protect the visual contract without committing screenshots containing financial values.

**Tech Stack:** TypeScript 5.9, React 19, vinext 1.0 beta, Next-compatible App Router APIs, Tailwind CSS 4 import layer, Vitest 4, Testing Library, Playwright 1.62, axe-core.

**Spec:** `docs/superpowers/specs/2026-08-26-aurum-ui-ux-refresh-design.md`

## Global Constraints

- The product name remains **Aurum** and the existing A monogram remains the brand mark.
- This plan changes the visual system and application shell only; individual page information architecture remains unchanged.
- Existing URLs, data contracts, Robinhood synchronization, valuation logic, permissions, and read-only boundary remain unchanged.
- Connected mode must never substitute synthetic values when data is unavailable.
- No new icon, chart, or UI dependency is added.
- Primary tokens are fixed by the spec: canvas `#08090B`, raised canvas `#0C0E12`, panel `#12151A`, strong panel `#171B22`, border `#252B35`, strong border `#343C49`, text `#F4F1E8`, secondary text `#A4ACB9`, muted text `#737D8D`, gold `#E2B93F`, positive `#2CCF9B`, negative `#FF6868`, warning `#E3A84B`.
- Touch targets are at least 44px, focus remains visible, WCAG AA contrast is required, and `prefers-reduced-motion` is honored.
- Do not stage or modify `apps/server/src/app.ts`; its existing diagnostic worktree change is outside this UI plan.
- Never commit screenshots, secrets, account identifiers, raw provider payloads, or unmasked connected financial values.

## File Structure

### New files

- `apps/web/components/app-shell/page-context.ts` — pure pathname-to-title/subtitle resolver.
- `apps/web/components/app-shell/NavigationIcon.tsx` — dependency-free decorative SVG icons for shell navigation.
- `apps/web/tests/unit/page-context.test.ts` — resolver contract.
- `apps/web/tests/component/AppShell.test.tsx` — Aurum branding, navigation, header, and truth-boundary contract.

### Modified files

- `apps/web/components/app-shell/navigation.ts` — labels and icon names for the existing routes.
- `apps/web/components/app-shell/DashboardShell.tsx` — shell state attributes and unchanged privacy boundary.
- `apps/web/components/app-shell/DesktopSideRail.tsx` — compact Aurum rail structure and read-only footer.
- `apps/web/components/app-shell/GlobalHeader.tsx` — contextual title/subtitle and compact controls.
- `apps/web/components/app-shell/MobileTabBar.tsx` — compact mobile navigation using the same route metadata.
- `apps/web/app/globals.css` — tokens, geometry, shell, shared surfaces, and responsive behavior.
- `apps/web/tests/component/MobileTabBar.test.tsx` — updated visible navigation contract.
- `apps/web/tests/component/ConnectedTruthBoundary.test.tsx` — preserved fail-closed copy in the redesigned shell.
- `apps/web/tests/e2e/dashboard.spec.ts` — computed-style, responsive, focus, reduced-motion, overflow, and regression checks.

---

### Task 1: Contextual Page Header Contract

**Files:**
- Create: `apps/web/components/app-shell/page-context.ts`
- Create: `apps/web/tests/unit/page-context.test.ts`
- Modify: `apps/web/components/app-shell/GlobalHeader.tsx`

**Interfaces:**
- Produces: `type PageContext = Readonly<{ title: string; subtitle: string }>`.
- Produces: `pageContext(pathname: string): PageContext`.
- Consumes: `usePathname(): string | null` from `next/navigation`.

- [ ] **Step 1: Write the failing resolver test**

```ts
import { describe, expect, it } from 'vitest';
import { pageContext } from '../../components/app-shell/page-context';

describe('page context', () => {
  it.each([
    ['/', { title: 'Dashboard', subtitle: 'Overview across all portfolios' }],
    ['/accounts', { title: 'Accounts', subtitle: 'Connected portfolio accounts' }],
    ['/accounts/account-1', { title: 'Account details', subtitle: 'Balances, holdings, and source quality' }],
    ['/holdings', { title: 'Holdings', subtitle: 'Every position currently tracked' }],
    ['/holdings/instrument-1', { title: 'Holding details', subtitle: 'Position value, return, and provenance' }],
    ['/performance', { title: 'Performance', subtitle: 'Read-only portfolio history' }],
    ['/analytics', { title: 'Allocation', subtitle: 'Exposure, concentration, and portfolio structure' }],
    ['/activity/imports', { title: 'Imports', subtitle: 'Preview and confirm portfolio records' }],
    ['/activity/reconciliation', { title: 'Reconciliation', subtitle: 'Provider totals and coverage evidence' }],
    ['/activity', { title: 'Activity', subtitle: 'Sync, import, and portfolio events' }],
    ['/alerts', { title: 'Alerts', subtitle: 'Read-only portfolio monitoring rules' }],
    ['/settings', { title: 'Settings', subtitle: 'Security, privacy, and data controls' }],
  ])('maps %s to its visible context', (pathname, expected) => {
    expect(pageContext(pathname)).toEqual(expected);
  });

  it('fails safely to the dashboard context for an unknown route', () => {
    expect(pageContext('/unknown')).toEqual({
      title: 'Dashboard',
      subtitle: 'Overview across all portfolios',
    });
  });
});
```

- [ ] **Step 2: Run the resolver test and confirm RED**

Run:

```powershell
npm run test --workspace @aurum/web -- apps/web/tests/unit/page-context.test.ts
```

Expected: FAIL because `components/app-shell/page-context` does not exist.

- [ ] **Step 3: Implement the pure resolver**

```ts
export type PageContext = Readonly<{ title: string; subtitle: string }>;

const dashboard: PageContext = {
  title: 'Dashboard',
  subtitle: 'Overview across all portfolios',
};

export function pageContext(pathname: string): PageContext {
  if (pathname === '/') return dashboard;
  if (/^\/accounts\/[^/]+$/.test(pathname)) return { title: 'Account details', subtitle: 'Balances, holdings, and source quality' };
  if (pathname === '/accounts') return { title: 'Accounts', subtitle: 'Connected portfolio accounts' };
  if (/^\/holdings\/[^/]+$/.test(pathname)) return { title: 'Holding details', subtitle: 'Position value, return, and provenance' };
  if (pathname === '/holdings') return { title: 'Holdings', subtitle: 'Every position currently tracked' };
  if (pathname === '/performance') return { title: 'Performance', subtitle: 'Read-only portfolio history' };
  if (pathname === '/analytics') return { title: 'Allocation', subtitle: 'Exposure, concentration, and portfolio structure' };
  if (pathname === '/activity/imports') return { title: 'Imports', subtitle: 'Preview and confirm portfolio records' };
  if (pathname === '/activity/reconciliation') return { title: 'Reconciliation', subtitle: 'Provider totals and coverage evidence' };
  if (pathname === '/activity') return { title: 'Activity', subtitle: 'Sync, import, and portfolio events' };
  if (pathname === '/alerts') return { title: 'Alerts', subtitle: 'Read-only portfolio monitoring rules' };
  if (pathname === '/settings') return { title: 'Settings', subtitle: 'Security, privacy, and data controls' };
  return dashboard;
}
```

- [ ] **Step 4: Make `GlobalHeader` consume the resolver**

Add `'use client';`, import `usePathname` and `pageContext`, then replace the fixed `All portfolios` block with:

```tsx
const context = pageContext(usePathname() ?? '/');

<div className="header-title">
  <h1>{context.title}</h1>
  <p className="header-account-count">{context.subtitle}</p>
</div>
```

Keep `source-badge`, `ScreenPrivacyToggle`, `RefreshControl`, and `userControl` unchanged.

- [ ] **Step 5: Run focused tests and confirm GREEN**

```powershell
npm run test --workspace @aurum/web -- apps/web/tests/unit/page-context.test.ts apps/web/tests/component/ConnectedTruthBoundary.test.tsx
```

Expected: both files PASS; Connected mode still displays `Connected mode` and `Verification required` without claiming verified brokerage data.

- [ ] **Step 6: Commit Task 1**

```powershell
git add apps/web/components/app-shell/page-context.ts apps/web/components/app-shell/GlobalHeader.tsx apps/web/tests/unit/page-context.test.ts
git commit -m "feat: add contextual Aurum page headers"
```

---

### Task 2: Aurum Desktop Shell and Visual Tokens

**Files:**
- Create: `apps/web/components/app-shell/NavigationIcon.tsx`
- Create: `apps/web/tests/component/AppShell.test.tsx`
- Modify: `apps/web/components/app-shell/navigation.ts`
- Modify: `apps/web/components/app-shell/DashboardShell.tsx`
- Modify: `apps/web/components/app-shell/DesktopSideRail.tsx`
- Modify: `apps/web/components/app-shell/GlobalHeader.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/tests/e2e/dashboard.spec.ts`

**Interfaces:**
- Produces: `type NavigationIconName = 'dashboard' | 'accounts' | 'holdings' | 'performance' | 'allocation' | 'activity' | 'alerts' | 'settings'`.
- Produces: `NavigationIcon({ name }: { name: NavigationIconName }): JSX.Element` with `aria-hidden="true"`.
- Changes `primaryNavigation` entries to `{ label, href, icon }` while preserving all existing `href` values.
- Adds `data-shell-mode={mode}` to `.app-shell` for deterministic shell styling only.

- [ ] **Step 1: Write the failing shell component test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DashboardShell } from '../../components/app-shell/DashboardShell';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

describe('Aurum application shell', () => {
  it('keeps Aurum branding and exposes the compact finance navigation', () => {
    const { container } = render(
      <DashboardShell apiBaseUrl="" mode="demo"><p>Content</p></DashboardShell>,
    );

    expect(screen.getByText('Aurum')).toBeVisible();
    expect(screen.getByText('Portfolio intelligence')).toBeVisible();
    expect(screen.getByRole('link', { name: /Dashboard/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /Allocation/ })).toHaveAttribute('href', '/analytics');
    expect(screen.getByText('Read-only · No trading access')).toBeVisible();
    expect(screen.queryByText('Obsidian Ledger')).not.toBeInTheDocument();
    expect(container.querySelector('.app-shell')).toHaveAttribute('data-shell-mode', 'demo');
    expect(container.querySelectorAll('.nav-icon')).toHaveLength(8);
  });
});
```

- [ ] **Step 2: Add the failing desktop visual-contract test**

Append to `apps/web/tests/e2e/dashboard.spec.ts`:

```ts
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
});
```

- [ ] **Step 3: Run both tests and confirm RED**

```powershell
npm run test --workspace @aurum/web -- apps/web/tests/component/AppShell.test.tsx
npm run test:e2e -- --grep "desktop shell uses"
```

Expected: component test FAIL because the new labels, icons, disclosure, and shell attribute do not exist; E2E test FAIL on the old tokens and geometry.

- [ ] **Step 4: Implement the dependency-free icon component**

Use a single 20×20 outline SVG and a path registry. The component must emit no accessible text because the link label already names the destination:

```tsx
import type { SVGProps } from 'react';

export type NavigationIconName =
  | 'dashboard' | 'accounts' | 'holdings' | 'performance'
  | 'allocation' | 'activity' | 'alerts' | 'settings';

const paths: Record<NavigationIconName, readonly string[]> = {
  dashboard: ['M3 3h5v5H3z', 'M12 3h5v5h-5z', 'M3 12h5v5H3z', 'M12 12h5v5h-5z'],
  accounts: ['M3 6h14', 'M5 10h10', 'M7 14h6'],
  holdings: ['M4 5h12', 'M4 10h12', 'M4 15h12'],
  performance: ['M3 15l4-4 3 2 6-7', 'M13 6h3v3'],
  allocation: ['M10 3a7 7 0 1 0 7 7h-7z', 'M12 3.3V8h4.7A7 7 0 0 0 12 3.3z'],
  activity: ['M3 10h3l2-5 4 10 2-5h3'],
  alerts: ['M5 14h10l-1.5-2V8a3.5 3.5 0 0 0-7 0v4z', 'M8.5 16h3'],
  settings: ['M10 6.5A3.5 3.5 0 1 0 10 13.5 3.5 3.5 0 0 0 10 6.5z', 'M10 2v2', 'M10 16v2', 'M2 10h2', 'M16 10h2'],
};

export function NavigationIcon({ name, ...props }: { name: NavigationIconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} aria-hidden="true" className="nav-icon" fill="none" viewBox="0 0 20 20">
      {paths[name].map((path) => <path d={path} key={path} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />)}
    </svg>
  );
}
```

- [ ] **Step 5: Update route metadata and shell markup**

Change labels only where approved while retaining URLs:

```ts
export const primaryNavigation = [
  { label: 'Dashboard', href: '/', icon: 'dashboard' },
  { label: 'Accounts', href: '/accounts', icon: 'accounts' },
  { label: 'Holdings', href: '/holdings', icon: 'holdings' },
  { label: 'Performance', href: '/performance', icon: 'performance' },
  { label: 'Allocation', href: '/analytics', icon: 'allocation' },
  { label: 'Activity', href: '/activity', icon: 'activity' },
  { label: 'Alerts', href: '/alerts', icon: 'alerts' },
  { label: 'Settings', href: '/settings', icon: 'settings' },
] as const satisfies readonly {
  label: string;
  href: string;
  icon: NavigationIconName;
}[];
```

In `DashboardShell`, add `data-shell-mode={mode}`. In `DesktopSideRail`, replace `.nav-glyph` with `<NavigationIcon name={item.icon} />`, preserve Aurum branding and truth-boundary copy, and add:

```tsx
<p className="rail-read-only">Read-only · No trading access</p>
```

- [ ] **Step 6: Replace the global token block and desktop shell geometry**

Set the spec tokens exactly and update the shell selectors without rewriting unrelated page rules:

```css
:root {
  --canvas: #08090b;
  --canvas-raised: #0c0e12;
  --panel: #12151a;
  --panel-strong: #171b22;
  --panel-soft: #1b2028;
  --border: #252b35;
  --border-bright: #343c49;
  --gold: #e2b93f;
  --gold-bright: #f2cf62;
  --gold-deep: #a98419;
  --text: #f4f1e8;
  --muted: #737d8d;
  --muted-strong: #a4acb9;
  --positive: #2ccf9b;
  --negative: #ff6868;
  --amber: #e3a84b;
  --focus: #f2cf62;
  --rail-width: 208px;
  --radius-xl: 14px;
  --radius-lg: 12px;
}

body { background: var(--canvas); }
.side-rail { width: var(--rail-width); padding: 22px 14px 14px; background: var(--canvas-raised); backdrop-filter: none; }
.app-frame { margin-left: var(--rail-width); }
.global-header { min-height: 68px; padding: 10px clamp(20px, 2.4vw, 32px); background: rgb(8 9 11 / 92%); }
.nav-link { min-height: 40px; border-radius: 9px; }
.nav-icon { width: 18px; height: 18px; flex: 0 0 18px; }
.nav-link[aria-current='page'] { border-color: rgb(226 185 63 / 30%); background: rgb(226 185 63 / 10%); color: var(--gold-bright); }
.rail-read-only { margin: 8px 0 0; padding: 8px; border: 1px solid rgb(226 185 63 / 28%); border-radius: 8px; color: var(--gold-bright); font-size: .66rem; text-align: center; }
```

Remove the body radial gradient, serif interface font usage, bronze panel gradients, and large shell shadows.

- [ ] **Step 7: Run Task 2 tests and confirm GREEN**

```powershell
npm run test --workspace @aurum/web -- apps/web/tests/component/AppShell.test.tsx apps/web/tests/component/ConnectedTruthBoundary.test.tsx
npm run test:e2e -- --grep "desktop shell uses"
```

Expected: all focused tests PASS; no `Obsidian Ledger` string is rendered; token and geometry assertions match exactly.

- [ ] **Step 8: Commit Task 2**

```powershell
git add apps/web/components/app-shell/NavigationIcon.tsx apps/web/components/app-shell/navigation.ts apps/web/components/app-shell/DashboardShell.tsx apps/web/components/app-shell/DesktopSideRail.tsx apps/web/components/app-shell/GlobalHeader.tsx apps/web/app/globals.css apps/web/tests/component/AppShell.test.tsx apps/web/tests/e2e/dashboard.spec.ts
git commit -m "feat: refresh the Aurum desktop shell"
```

---

### Task 3: Responsive Mobile Shell

**Files:**
- Modify: `apps/web/components/app-shell/MobileTabBar.tsx`
- Modify: `apps/web/tests/component/MobileTabBar.test.tsx`
- Modify: `apps/web/tests/e2e/dashboard.spec.ts`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: `primaryNavigation` entries from Task 2.
- Preserves: `aria-label="Mobile primary"`, `aria-current="page"`, `aria-expanded`, Escape-to-close behavior, and `data-aurum-ready`.
- Direct destinations remain Dashboard, Holdings, Activity, and Alerts; Accounts, Performance, Allocation, and Settings remain in More.

- [ ] **Step 1: Update the component test first**

Change the expectations in `MobileTabBar.test.tsx` to the approved labels:

```tsx
expect(navigation).toHaveTextContent('Dashboard');
expect(navigation).toHaveTextContent('Holdings');
expect(navigation).toHaveTextContent('Activity');
expect(navigation).toHaveTextContent('Alerts');
// After opening More:
expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
  'Accounts',
  'Performance',
  'Allocation',
  'Settings',
]);
```

Also assert each direct link and the More button has a rendered box at least 44px high by mocking `getBoundingClientRect` only in the Playwright test, not in this component test.

- [ ] **Step 2: Add the failing mobile geometry test**

Append:

```ts
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
```

- [ ] **Step 3: Run focused mobile tests and confirm RED**

```powershell
npm run test --workspace @aurum/web -- apps/web/tests/component/MobileTabBar.test.tsx
npm run test:e2e -- --grep "mobile shell keeps"
```

Expected: FAIL on the old `Overview`/`Analytics` labels or old control geometry.

- [ ] **Step 4: Update `MobileTabBar` to use icons and approved labels**

Import `NavigationIcon`, render it before each direct label and menu label, and keep the existing interaction logic. The visible label always comes from `primaryNavigation`; do not duplicate a second label registry.

- [ ] **Step 5: Implement the compact responsive CSS**

At mobile breakpoints:

```css
@media (max-width: 760px) {
  .side-rail { display: none; }
  .app-frame { margin-left: 0; padding-bottom: calc(68px + env(safe-area-inset-bottom)); }
  .global-header { min-height: 60px; padding: 8px 14px; }
  .header-title h1 { font-size: 1rem; }
  .header-account-count { max-width: 48vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mobile-tab-bar { min-height: calc(60px + env(safe-area-inset-bottom)); background: rgb(12 14 18 / 96%); border-color: var(--border); }
  .mobile-tab-bar a,
  .mobile-tab-bar button { min-height: 44px; }
}
```

At tablet widths, keep the desktop rail only when its presence leaves at least 720px for content; otherwise use the mobile shell.

- [ ] **Step 6: Run focused tests and confirm GREEN**

```powershell
npm run test --workspace @aurum/web -- apps/web/tests/component/MobileTabBar.test.tsx
npm run test:e2e -- --grep "mobile navigation|mobile shell keeps|do not overflow"
```

Expected: all selected tests PASS at phone, tablet, and desktop widths.

- [ ] **Step 7: Commit Task 3**

```powershell
git add apps/web/components/app-shell/MobileTabBar.tsx apps/web/tests/component/MobileTabBar.test.tsx apps/web/tests/e2e/dashboard.spec.ts apps/web/app/globals.css
git commit -m "feat: refine Aurum responsive navigation"
```

---

### Task 4: Shared Financial Surfaces

**Files:**
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/tests/e2e/dashboard.spec.ts`
- Review without behavioral changes: `apps/web/components/ui/StatCard.tsx`, `apps/web/components/ui/SourceNotice.tsx`, `apps/web/components/tables/HoldingsTable.tsx`, `apps/web/components/charts/PortfolioTrend.tsx`, `apps/web/components/charts/AllocationChart.tsx`

**Interfaces:**
- Preserves every component prop and domain read model.
- Produces a shared surface contract through existing classes: `.hero-card`, `.trend-card`, `.allocation-card`, `.holdings-card`, `.data-card`, `.stat-card`, `.settings-card`, and table selectors.
- Does not add data, fields, charts, fallback values, or new user actions.

- [ ] **Step 1: Add a failing computed-style test for shared surfaces**

```ts
test('shared financial surfaces use compact neutral panels', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoPage(page, '/');

  const hero = page.locator('.hero-card');
  await expect(hero).toHaveCSS('background-color', 'rgb(18, 21, 26)');
  await expect(hero).toHaveCSS('border-radius', '12px');
  await expect(hero).toHaveCSS('border-top-color', 'rgb(37, 43, 53)');

  await gotoPage(page, '/holdings');
  await expect(page.locator('.data-card')).toHaveCSS('background-color', 'rgb(18, 21, 26)');
  const firstNumericCell = page.locator('tbody td').filter({ hasText: '$' }).first();
  expect(await firstNumericCell.evaluate((element) => getComputedStyle(element).fontVariantNumeric)).toContain('tabular-nums');
});
```

- [ ] **Step 2: Run the surface test and confirm RED**

```powershell
npm run test:e2e -- --grep "shared financial surfaces"
```

Expected: FAIL because the old panel colors, 18–24px radii, gradients, or numeric typography remain.

- [ ] **Step 3: Restyle existing shared selectors without changing markup behavior**

Apply the neutral surface contract:

```css
.hero-card,
.trend-card,
.allocation-card,
.holdings-card,
.data-card,
.stat-card,
.settings-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--panel);
  box-shadow: none;
}

.hero-card::after { content: none; }
.hero-value,
.financial-value,
td.numeric,
th.numeric { font-variant-numeric: tabular-nums lining-nums; }

table { border-collapse: collapse; }
thead th { color: var(--muted); font-size: .68rem; letter-spacing: .06em; text-transform: uppercase; }
tbody tr { border-top: 1px solid var(--border); }
tbody tr:hover { background: rgb(255 255 255 / 2.5%); }

.positive { color: var(--positive); }
.negative { color: var(--negative); }
```

Reduce excessive section gaps and padding, but keep 44px controls and the existing semantic hierarchy. Ensure chart primary strokes use `var(--gold)` and comparison strokes remain distinguishable without gold.

- [ ] **Step 4: Verify existing truth, privacy, and interaction components still pass**

```powershell
npm run test --workspace @aurum/web -- apps/web/tests/component/OverviewScreen.test.tsx apps/web/tests/component/ScreenPrivacyToggle.test.tsx apps/web/tests/component/AlertsCenter.test.tsx apps/web/tests/component/SettingsScreen.test.tsx
npm run test:e2e -- --grep "shared financial surfaces|screen privacy|alert evidence"
```

Expected: all focused component and E2E tests PASS; privacy still hides values and settings gates remain disabled until explicitly satisfied.

- [ ] **Step 5: Commit Task 4**

```powershell
git add apps/web/app/globals.css apps/web/tests/e2e/dashboard.spec.ts
git commit -m "feat: modernize Aurum financial surfaces"
```

---

### Task 5: Accessibility, Motion, and Fail-Closed State Polish

**Files:**
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/tests/e2e/dashboard.spec.ts`
- Modify only if the test proves markup is insufficient: `apps/web/app/error.tsx`, `apps/web/app/loading.tsx`

**Interfaces:**
- Preserves existing error copy and no-synthetic-fallback behavior.
- Preserves `aria-current`, navigation labels, privacy live regions, and error heading hierarchy.
- Adds no animation required for understanding state.

- [ ] **Step 1: Add failing keyboard and reduced-motion tests**

```ts
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
```

- [ ] **Step 2: Run the test and confirm RED**

```powershell
npm run test:e2e -- --grep "focus remains visible"
```

Expected: FAIL if the old transition durations remain under reduced motion or the first focus outline is not visible.

- [ ] **Step 3: Implement focus and reduced-motion rules**

```css
:where(a, button, input, select, textarea):focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0s !important;
  }
}
```

Restyle `.error-panel`, loading skeletons, source notices, and privacy masks using the same neutral surfaces. Do not change error text or introduce synthetic fallback balances.

- [ ] **Step 4: Run the accessibility and route matrix**

```powershell
npm run test:e2e -- --grep "focus remains visible|renders a labeled synthetic source|do not overflow"
```

Expected: PASS with zero serious or critical axe violations on every existing route, visible focus, zero reduced-motion transition duration, and no horizontal overflow.

- [ ] **Step 5: Commit Task 5**

```powershell
git add apps/web/app/globals.css apps/web/tests/e2e/dashboard.spec.ts apps/web/app/error.tsx apps/web/app/loading.tsx
git diff --cached --quiet; if ($LASTEXITCODE -eq 0) { throw 'Task 5 produced no staged change' }
git commit -m "fix: polish Aurum accessible shell states"
```

If `error.tsx` and `loading.tsx` did not require markup changes, omit them from `git add` rather than editing them for churn.

---

### Task 6: Full Verification and Visual Review

**Files:**
- Verify: all files changed by Tasks 1–5.
- Do not commit: generated screenshots and Playwright traces.

**Interfaces:**
- Consumes the complete refreshed shell.
- Produces a clean, reviewable branch with test evidence and no unrelated staged changes.

- [ ] **Step 1: Run formatting-sensitive checks**

```powershell
git diff --check
npm run lint
npm run typecheck
```

Expected: all commands exit 0 with no TypeScript or ESLint errors.

- [ ] **Step 2: Run the complete unit/component/integration suite**

```powershell
npm test
```

Expected: every test passes; no Connected-mode test observes a demo fallback.

- [ ] **Step 3: Build production artifacts**

```powershell
npm run build
```

Expected: server, domain, and web builds exit 0; all existing routes remain in the vinext route table.

- [ ] **Step 4: Run the complete browser suite**

```powershell
npm run test:e2e
```

Expected: the complete Playwright suite passes, including axe, privacy, navigation, interaction, responsive, token, focus, and reduced-motion checks.

- [ ] **Step 5: Capture disposable Demo-mode screenshots for human review**

Start Demo mode using the existing safe development command, then capture only synthetic pages at these viewports:

```text
1920×1080: /, /holdings, /settings
1440×1000: /, /holdings, /alerts
1024×900: /, /holdings
768×1024: /, /settings
390×844: /, /holdings, /alerts
```

Inspect that Aurum branding is unchanged, the rail/header are compact, gold is accent-only, panels are neutral, tables align numerically, mobile controls remain reachable, and no content is clipped. Store screenshots only under Playwright's ignored output directory and delete them after review.

- [ ] **Step 6: Audit the final diff and staging boundary**

```powershell
git status --short
git diff --stat 99165ec..HEAD
git diff --name-only 99165ec..HEAD
git log -6 --oneline
```

Expected: UI changes are limited to the spec/plan and `apps/web`; `apps/server/src/app.ts` is not included in any UI commit; no `.env`, screenshot, trace, credential, or provider payload is tracked.

- [ ] **Step 7: Record final verification evidence**

Report the exact pass counts for Vitest and Playwright, the successful typecheck/build commands, the reviewed viewport list, and any known non-blocking visual limitations. Do not claim completion from earlier runs; use only output generated after the final code change.
