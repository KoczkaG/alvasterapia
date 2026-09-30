import { describe, it, expect } from 'vitest';
import { createDraftSchema, invoiceTotal, lineTotal } from './invoicing.js';

describe('invoicing — összeg-számítás', () => {
  it('lineTotal a mennyiség × egységár', () => {
    expect(
      lineTotal({ code: 'A', name: 'x', quantity: 3, unitGross: 1500 }),
    ).toBe(4500);
  });
  it('invoiceTotal összegzi a tételeket', () => {
    expect(
      invoiceTotal([
        { code: 'A', name: 'x', quantity: 2, unitGross: 1000 },
        { code: 'B', name: 'y', quantity: 1, unitGross: 500 },
      ]),
    ).toBe(2500);
  });
});

describe('createDraftSchema — tervezet validáció', () => {
  it('elfogad egy érvényes tervezetet', () => {
    expect(
      createDraftSchema.safeParse({
        partnerCode: 'P-000123',
        items: [{ code: 'A', name: 'Maszk', quantity: 1, unitGross: 12000 }],
        payment: 'card',
      }).success,
    ).toBe(true);
  });
  it('elutasítja az üres tétellistát', () => {
    expect(
      createDraftSchema.safeParse({
        partnerCode: 'P-000123',
        items: [],
        payment: 'cash',
      }).success,
    ).toBe(false);
  });
  it('elutasítja az ismeretlen fizetési módot', () => {
    expect(
      createDraftSchema.safeParse({
        partnerCode: 'P-000123',
        items: [{ code: 'A', name: 'x', quantity: 1, unitGross: 100 }],
        payment: 'bitcoin',
      }).success,
    ).toBe(false);
  });
});
