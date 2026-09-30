import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WEAR_TIME_RULES,
  addMonthsIso,
  eligibilityDate,
  isEligibleForReplacement,
  computeSettlement,
  reconcileOep,
  settlementInputSchema,
} from './settlement.js';

describe('addMonthsIso', () => {
  it('hozzáad N hónapot', () => {
    expect(addMonthsIso('2025-01-15', 12)).toBe('2026-01-15');
    expect(addMonthsIso('2025-01-31', 1)).toBe('2025-03-03'); // febr. túlcsordulás
    expect(addMonthsIso('2025-06-30', 3)).toBe('2025-09-30');
  });
});

describe('eligibilityDate', () => {
  it('a vásárlás + kihordási idő', () => {
    expect(eligibilityDate('2025-01-10', 'maszk', DEFAULT_WEAR_TIME_RULES)).toBe(
      '2026-01-10',
    );
    expect(eligibilityDate('2025-01-10', 'szuro', DEFAULT_WEAR_TIME_RULES)).toBe(
      '2025-04-10',
    );
  });

  it('null ismeretlen terméktípusra', () => {
    expect(
      eligibilityDate('2025-01-10', 'ismeretlen', DEFAULT_WEAR_TIME_RULES),
    ).toBeNull();
  });
});

describe('isEligibleForReplacement', () => {
  it('igaz, ha letelt a kihordási idő', () => {
    expect(
      isEligibleForReplacement(
        '2024-01-10',
        'maszk',
        DEFAULT_WEAR_TIME_RULES,
        '2025-06-01',
      ),
    ).toBe(true);
  });

  it('hamis, ha még nem telt le', () => {
    expect(
      isEligibleForReplacement(
        '2025-01-10',
        'maszk',
        DEFAULT_WEAR_TIME_RULES,
        '2025-06-01',
      ),
    ).toBe(false);
  });

  it('a lejárat napján már jogosult', () => {
    expect(
      isEligibleForReplacement(
        '2025-01-10',
        'szuro',
        DEFAULT_WEAR_TIME_RULES,
        '2025-04-10',
      ),
    ).toBe(true);
  });

  it('hamis ismeretlen terméktípusra', () => {
    expect(
      isEligibleForReplacement(
        '2020-01-10',
        'ismeretlen',
        DEFAULT_WEAR_TIME_RULES,
        '2025-06-01',
      ),
    ).toBe(false);
  });
});

describe('computeSettlement', () => {
  it('visszajáró kaució (befizetés > levonás)', () => {
    const r = computeSettlement({
      payments: [
        { reference: 'B-1', amount: 50000, paidOn: '2025-01-01' },
        { reference: 'B-2', amount: 10000, paidOn: '2025-02-01' },
      ],
      deductions: [{ label: 'Tisztítási díj', amount: 8000 }],
    });
    expect(r.totalPaid).toBe(60000);
    expect(r.totalDeductions).toBe(8000);
    expect(r.balance).toBe(52000);
    expect(r.refundDue).toBe(true);
  });

  it('ráfizetés (levonás > befizetés)', () => {
    const r = computeSettlement({
      payments: [{ reference: 'B-1', amount: 10000, paidOn: '2025-01-01' }],
      deductions: [
        { label: 'TB-önrész', amount: 12000 },
        { label: 'Késedelem', amount: 3000 },
      ],
    });
    expect(r.totalPaid).toBe(10000);
    expect(r.totalDeductions).toBe(15000);
    expect(r.balance).toBe(-5000);
    expect(r.refundDue).toBe(false);
  });

  it('nulla egyenleg is visszajáró (nem ráfizetés)', () => {
    const r = computeSettlement({
      payments: [{ reference: 'B-1', amount: 10000, paidOn: '2025-01-01' }],
      deductions: [{ label: 'X', amount: 10000 }],
    });
    expect(r.balance).toBe(0);
    expect(r.refundDue).toBe(true);
  });

  it('kerekít 2 tizedesre', () => {
    const r = computeSettlement({
      payments: [{ reference: 'B-1', amount: 100.1, paidOn: '2025-01-01' }],
      deductions: [{ label: 'X', amount: 0.2 }],
    });
    expect(r.balance).toBe(99.9);
  });

  it('a séma elutasítja a negatív összeget', () => {
    expect(() =>
      settlementInputSchema.parse({
        payments: [{ reference: 'B', amount: -1, paidOn: '2025-01-01' }],
        deductions: [],
      }),
    ).toThrow();
  });
});

describe('reconcileOep', () => {
  it('minden egyezik', () => {
    const r = reconcileOep(
      [
        { productType: 'maszk', count: 5 },
        { productType: 'gegecso', count: 3 },
      ],
      [
        { productType: 'maszk', count: 5 },
        { productType: 'gegecso', count: 3 },
      ],
    );
    expect(r.allMatch).toBe(true);
    expect(r.rows).toHaveLength(2);
  });

  it('eltérés esetén diff és allMatch=false', () => {
    const r = reconcileOep(
      [{ productType: 'maszk', count: 5 }],
      [{ productType: 'maszk', count: 4 }],
    );
    expect(r.allMatch).toBe(false);
    expect(r.rows[0].diff).toBe(1);
    expect(r.rows[0].match).toBe(false);
  });

  it('csak az egyik forrásban szereplő termék is látszik', () => {
    const r = reconcileOep(
      [{ productType: 'maszk', count: 2 }],
      [{ productType: 'szuro', count: 1 }],
    );
    // rendezve: maszk, szuro
    expect(r.rows.map((x) => x.productType)).toEqual(['maszk', 'szuro']);
    expect(r.rows[0]).toMatchObject({ kvlCount: 2, mankoCount: 0, diff: 2 });
    expect(r.rows[1]).toMatchObject({ kvlCount: 0, mankoCount: 1, diff: -1 });
    expect(r.allMatch).toBe(false);
  });
});
