import { describe, it, expect } from 'vitest';
import {
  canTransition,
  nextStatus,
  addYearsIso,
  warrantyExpiry,
  DEFAULT_WARRANTY_RULES,
  contractTotals,
  isGdprComplete,
  contractPatientSchema,
  gdprConsentSchema,
  type ContractItem,
} from './contract.js';

describe('állapotgép', () => {
  it('lineáris előre haladást enged', () => {
    expect(canTransition('draft', 'gdpr_ok')).toBe(true);
    expect(canTransition('gdpr_ok', 'cart')).toBe(true);
    expect(canTransition('cart', 'paid')).toBe(true);
    expect(canTransition('paid', 'signed')).toBe(true);
    expect(canTransition('signed', 'closed')).toBe(true);
  });

  it('nem enged átugrást vagy visszalépést', () => {
    expect(canTransition('draft', 'cart')).toBe(false);
    expect(canTransition('cart', 'draft')).toBe(false);
    expect(canTransition('closed', 'signed')).toBe(false);
  });

  it('nextStatus a következő állapotot adja, closed-nál null', () => {
    expect(nextStatus('draft')).toBe('gdpr_ok');
    expect(nextStatus('paid')).toBe('signed');
    expect(nextStatus('closed')).toBeNull();
  });
});

describe('jótállási idő', () => {
  it('addYearsIso hozzáad N évet', () => {
    expect(addYearsIso('2026-01-15', 2)).toBe('2028-01-15');
    expect(addYearsIso('2024-02-29', 1)).toBe('2025-03-01'); // szökőnap túlcsordulás
  });

  it('warrantyExpiry a terméktípus szerint', () => {
    expect(warrantyExpiry('2026-06-01', 'keszulek', DEFAULT_WARRANTY_RULES)).toBe(
      '2028-06-01',
    );
    expect(warrantyExpiry('2026-06-01', 'maszk', DEFAULT_WARRANTY_RULES)).toBe(
      '2027-06-01',
    );
  });

  it('null ismeretlen terméktípusra', () => {
    expect(warrantyExpiry('2026-06-01', 'xxx', DEFAULT_WARRANTY_RULES)).toBeNull();
  });
});

describe('contractTotals', () => {
  it('kaució + ár = végösszeg', () => {
    const items: ContractItem[] = [
      { productType: 'keszulek', name: 'Prisma', deposit: 50000, price: 0 },
      { productType: 'szuro', name: 'Bakt.szűrő', deposit: 0, price: 3000 },
      { productType: 'szuro', name: 'Bakt.szűrő', deposit: 0, price: 3000 },
    ];
    const t = contractTotals(items);
    expect(t.totalDeposit).toBe(50000);
    expect(t.totalPrice).toBe(6000);
    expect(t.grandTotal).toBe(56000);
  });

  it('üres kosár nulla', () => {
    expect(contractTotals([])).toEqual({
      totalDeposit: 0,
      totalPrice: 0,
      grandTotal: 0,
    });
  });
});

describe('GDPR-kapu', () => {
  it('teljes, ha mind a 4 kérdésre van válasz', () => {
    expect(
      isGdprComplete({
        wearTimeInfo: true,
        newsletter: false,
        postalContact: true,
        emailContact: false,
      }),
    ).toBe(true);
  });

  it('hiányos, ha null', () => {
    expect(isGdprComplete(null)).toBe(false);
  });

  it('a séma elutasítja a hiányos GDPR-t', () => {
    expect(() =>
      gdprConsentSchema.parse({ wearTimeInfo: true, newsletter: false }),
    ).toThrow();
  });
});

describe('beteg-séma', () => {
  it('elfogad érvényes adatokat', () => {
    const p = contractPatientSchema.parse({
      name: 'Kovács Lajosné',
      taj: '123456789',
      zip: '1145',
      city: 'Budapest',
      address: 'Lakatos utca 22.',
      doctorName: 'Dr. Nagy',
      doctorStamp: '12345',
      pressure: 9.5,
    });
    expect(p.pressure).toBe(9.5);
  });

  it('elutasítja a rossz TAJ-t', () => {
    expect(() =>
      contractPatientSchema.parse({
        name: 'X Y',
        taj: '123',
        zip: '1145',
        city: 'Bp',
        address: 'utca 1.',
        doctorName: 'Dr',
        doctorStamp: '1',
        pressure: 9,
      }),
    ).toThrow();
  });

  it('elutasítja a hiányzó nyomásértéket', () => {
    expect(() =>
      contractPatientSchema.parse({
        name: 'X Y',
        taj: '123456789',
        zip: '1145',
        city: 'Bp',
        address: 'utca 1.',
        doctorName: 'Dr',
        doctorStamp: '1',
        pressure: 0,
      }),
    ).toThrow();
  });
});
