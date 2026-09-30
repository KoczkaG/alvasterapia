import { describe, it, expect } from 'vitest';
import {
  corporatePayeeSchema,
  resolveCorporatePayee,
} from './corporate-billing.js';
import { createDraftSchema } from './invoicing.js';

describe('corporatePayeeSchema — céges vevő validáció (II/A)', () => {
  const valid = {
    name: 'Példa Kft.',
    address: '1051 Budapest, Fő utca 1.',
    taxNumber: '12345678-2-42',
  };

  it('elfogad egy érvényes céges vevőt', () => {
    expect(corporatePayeeSchema.safeParse(valid).success).toBe(true);
  });
  it('elutasítja a rossz formátumú adószámot', () => {
    expect(
      corporatePayeeSchema.safeParse({ ...valid, taxNumber: '123456789' }).success,
    ).toBe(false);
  });
  it('elutasítja a hiányzó cégnevet', () => {
    expect(corporatePayeeSchema.safeParse({ ...valid, name: '' }).success).toBe(
      false,
    );
  });
});

describe('resolveCorporatePayee', () => {
  it('a céges adatból számla-vevőadatot állít elő', () => {
    const payee = resolveCorporatePayee({
      name: 'Példa Kft.',
      address: '1051 Budapest, Fő utca 1.',
      taxNumber: '12345678-2-42',
    });
    expect(payee).toEqual({
      name: 'Példa Kft.',
      address: '1051 Budapest, Fő utca 1.',
      taxNumber: '12345678-2-42',
    });
  });
});

describe('createDraftSchema — EP és céges kizárja egymást (II/A)', () => {
  const base = {
    partnerCode: 'P-000123',
    items: [{ code: 'A', name: 'x', quantity: 1, unitGross: 100 }],
    payment: 'cash' as const,
  };

  it('elfogadja a céges vevőt önmagában', () => {
    expect(
      createDraftSchema.safeParse({
        ...base,
        corporate: {
          name: 'Példa Kft.',
          address: '1051 Budapest, Fő utca 1.',
          taxNumber: '12345678-2-42',
        },
      }).success,
    ).toBe(true);
  });

  it('elfogadja az EP-t önmagában', () => {
    expect(
      createDraftSchema.safeParse({
        ...base,
        ep: { fundId: 'otp', membershipId: '123' },
      }).success,
    ).toBe(true);
  });

  it('elutasítja, ha EP és céges is meg van adva', () => {
    expect(
      createDraftSchema.safeParse({
        ...base,
        ep: { fundId: 'otp', membershipId: '123' },
        corporate: {
          name: 'Példa Kft.',
          address: '1051 Budapest, Fő utca 1.',
          taxNumber: '12345678-2-42',
        },
      }).success,
    ).toBe(false);
  });
});
