# Aurum UI/UX Refresh Design

**Date:** 2026-08-26

**Status:** Approved direction; pending final spec review

**Scope:** Design 1 — global visual system and application shell only

## 1. Objective

Refresh Aurum's UI/UX using the supplied portfolio-monitor mock as visual inspiration while preserving Aurum's identity and product behavior. The result should feel like a precise, modern financial workspace: dark, compact, legible, responsive, and trustworthy.

This change does not rename the product, imitate the mock's branding, or replace Aurum's existing screens and features. Aurum remains Aurum.

## 2. Design Principles

1. **Aurum identity stays intact.** Keep the Aurum name, A monogram, gold accent, read-only positioning, privacy controls, and source-provenance language.
2. **Information before ornament.** Reduce bronze washes, large decorative gradients, oversized radii, and unnecessary empty space.
3. **Gold is an accent.** Use gold for active navigation, primary chart series, important controls, and selected states—not as a large background treatment.
4. **Financial data must scan quickly.** Use compact spacing, tabular numerals, aligned columns, clear positive/negative states, and quiet supporting labels.
5. **Connected mode remains truthful.** Never substitute synthetic values when connected data is unavailable. Preserve unavailable states, freshness indicators, quality warnings, and read-only disclosures.
6. **Responsive without losing hierarchy.** Desktop, tablet, and mobile should expose the same key state with layouts appropriate to each viewport.

## 3. Scope

### In scope

- Global color, typography, spacing, radius, border, focus, and motion tokens.
- Desktop application shell: sidebar, navigation, page frame, header, status controls, and connection footer.
- Mobile application shell: compact header, bottom navigation, and access to secondary routes.
- Consistent visual treatment for existing cards, tables, filters, badges, empty states, errors, loading states, and privacy-masked values.
- More compact page gutters and responsive content widths across all existing routes.
- Navigation label refinement where it improves clarity, while preserving the existing URLs.
- Existing account navigation presented more clearly without changing account ownership or data semantics.
- Accessibility and reduced-motion behavior.

### Out of scope

- Renaming Aurum or replacing its logo with the mock's brand.
- Adding, removing, or redesigning the information architecture of individual pages as described in "Design 2."
- New portfolio metrics, watchlists, benchmarks, allocation algorithms, charts, or brokerage capabilities.
- Changes to Robinhood synchronization, data contracts, valuation logic, permissions, or trading boundaries.
- Synthetic fallback values in Connected mode.
- Authentication architecture changes; those remain a separate functional fix.

## 4. Visual Foundation

### Color system

- Canvas: neutral near-black (`#08090B`).
- Raised canvas: `#0C0E12`.
- Panel: `#12151A`.
- Strong panel: `#171B22`.
- Default border: `#252B35`.
- Strong border: `#343C49`.
- Primary text: warm off-white (`#F4F1E8`).
- Secondary text: cool gray (`#A4ACB9`).
- Muted text: `#737D8D`.
- Aurum gold: `#E2B93F` with a brighter highlight for focus/selected states.
- Positive: `#2CCF9B`.
- Negative: `#FF6868`.
- Warning: `#E3A84B`.

Large brown gradients will be removed. Any ambient highlight must be subtle enough that panel contrast remains visually neutral.

### Typography

- Use Geist Sans for navigation, labels, headings, and body content.
- Use Geist Mono or tabular-number features for financial values and dense table cells.
- Reserve large type for the primary portfolio value; other headings remain compact.
- Remove decorative serif typography from interface chrome and financial cards.

### Geometry and density

- Standard panel radius: 10–12px.
- Control radius: 8–10px.
- One-pixel borders define hierarchy; shadows are minimal.
- Desktop content gutters: 24–32px depending on viewport.
- Base spacing follows a 4px scale, with 8/12/16/24px as the common steps.

## 5. Desktop Application Shell

### Sidebar

- Fixed width near 208px, narrower than the current 236px rail.
- Aurum brand block stays at the top with the existing A monogram and tagline.
- Navigation rows become shorter and less ornamental, with clear gold active treatment.
- Existing primary routes remain available: Dashboard/Overview, Accounts, Holdings, Performance, Analytics, Activity, Alerts, and Settings.
- Account navigation may appear as a compact section when existing account data is already available to the shell; otherwise the Accounts route remains the source of truth. The UI refresh must not introduce a second data-fetching path solely to populate the rail.
- The footer shows sync/connection state and the explicit boundary: `Read-only · No trading access`.

### Header

- The header becomes page-contextual: title and short subtitle on the left; source mode, freshness, privacy, refresh, and user controls on the right.
- Height is reduced while preserving 44px minimum interactive targets.
- Connected, demo, degraded, and refreshing states remain visually distinct.
- Controls keep accessible names, keyboard focus, and disabled/loading feedback.

### Content frame

- Content uses the available viewport instead of a narrow centered column.
- Existing page components retain their information and behavior, but inherit tighter panels, typography, and spacing.
- No page should produce large accidental empty regions because of fixed card heights.

## 6. Mobile and Tablet Behavior

- At tablet widths, the sidebar may collapse to an icon rail or drawer without hiding source/freshness state.
- On mobile, primary destinations use the existing bottom navigation pattern with a clear secondary-route affordance.
- The mobile header retains page title, privacy state, refresh, and account access without overflowing.
- Dense tables remain semantically tables on larger screens; at small widths they may scroll horizontally or use an existing compact representation without dropping labels.
- Safe-area insets and at least 44px touch targets are required.

## 7. Shared Component Treatment

- **Cards:** neutral panels, thin borders, compact headings, no bronze glow.
- **Tables:** sticky or visually persistent headers where already supported, aligned tabular values, restrained row hover, and clear sort/filter states.
- **Charts:** Aurum gold for the primary series; blue/purple only for comparisons; positive/negative colors remain semantic.
- **Badges:** smaller, higher-contrast, and used only for actionable state or provenance.
- **Errors:** compact fail-closed panels that explain the unavailable source without displaying synthetic data.
- **Loading:** skeletons preserve final layout dimensions and do not flash invented balances.
- **Privacy mode:** masked values keep their layout width and accessible context.

## 8. Accessibility and Interaction

- Meet WCAG AA contrast for text and controls.
- Maintain visible `:focus-visible` states using Aurum gold without relying on color alone.
- Preserve semantic landmarks, heading order, table semantics, and live-region announcements.
- Honor `prefers-reduced-motion` and avoid decorative continuous animation.
- Hover is supplementary; every interaction must remain understandable by keyboard and touch.

## 9. Verification Criteria

The refresh is complete only when:

1. Aurum branding and all existing routes/features remain present.
2. Connected mode never falls back to demo values.
3. Existing unit, component, integration, and end-to-end tests pass.
4. New or adjusted shell behavior has test-first coverage.
5. Desktop screenshots are reviewed at approximately 1440px and 1920px widths.
6. Responsive screenshots are reviewed at approximately 1024px, 768px, and 390px widths.
7. Keyboard navigation, focus states, privacy masking, error states, and reduced motion are manually verified.
8. No secret, account identifier, raw provider payload, or unmasked private value is added to snapshots, fixtures, or logs.

## 10. Implementation Boundary

This design intentionally stops at the global visual system and application shell. Individual screen restructuring—such as a new movers panel, allocation treemap, watchlist, or benchmark dashboard—requires a separate approved design. The implementation should improve every existing screen through shared styles without silently expanding product scope.
