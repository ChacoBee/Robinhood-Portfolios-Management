import { describe, expect, it } from 'vitest';
import { calculateAllocation, usd } from '../src/index';

describe('allocation', () => {
  it('keeps cash, unclassified value, and residual as separate whole-portfolio slices', () => {
    expect(
      calculateAllocation({
        providerTotal: usd('1000'),
        headlineEligible: true,
        slices: [
          { key: 'equities', label: 'Equities', kind: 'classified', value: usd('550') },
          {
            key: 'unclassified',
            label: 'Unclassified',
            kind: 'unclassified',
            value: usd('150'),
          },
          { key: 'cash', label: 'Cash', kind: 'cash', value: usd('200') },
          {
            key: 'residual',
            label: 'Unsupported / residual',
            kind: 'residual',
            value: usd('100'),
          },
        ],
      }),
    ).toEqual({
      state: 'available',
      scope: 'whole_portfolio',
      denominator: usd('1000'),
      quality: 'partial',
      concentrationEligible: true,
      chartEligible: true,
      slices: [
        {
          key: 'equities',
          label: 'Equities',
          kind: 'classified',
          value: usd('550'),
          weight: { value: '0.55' },
        },
        {
          key: 'unclassified',
          label: 'Unclassified',
          kind: 'unclassified',
          value: usd('150'),
          weight: { value: '0.15' },
        },
        {
          key: 'cash',
          label: 'Cash',
          kind: 'cash',
          value: usd('200'),
          weight: { value: '0.2' },
        },
        {
          key: 'residual',
          label: 'Unsupported / residual',
          kind: 'residual',
          value: usd('100'),
          weight: { value: '0.1' },
        },
      ],
    });
  });

  it('labels the result supported-only when the provider denominator is unusable', () => {
    expect(
      calculateAllocation({
        providerTotal: null,
        headlineEligible: false,
        slices: [
          { key: 'equities', label: 'Equities', kind: 'classified', value: usd('550') },
          { key: 'cash', label: 'Cash', kind: 'cash', value: usd('200') },
          {
            key: 'residual',
            label: 'Unsupported / residual',
            kind: 'residual',
            value: usd('100'),
          },
        ],
      }),
    ).toMatchObject({
      state: 'available',
      scope: 'supported_assets_only',
      denominator: usd('750'),
      quality: 'partial',
      concentrationEligible: false,
      slices: [
        expect.objectContaining({ key: 'equities', weight: { value: '0.73333333333333333333' } }),
        expect.objectContaining({ key: 'cash', weight: { value: '0.26666666666666666667' } }),
      ],
    });
  });

  it('marks negative slices as ineligible for pie-style charts', () => {
    expect(
      calculateAllocation({
        providerTotal: usd('100'),
        headlineEligible: true,
        slices: [
          { key: 'positions', label: 'Positions', kind: 'classified', value: usd('110') },
          { key: 'margin', label: 'Margin', kind: 'liability', value: usd('-10') },
        ],
      }),
    ).toMatchObject({ chartEligible: false });
  });
});
