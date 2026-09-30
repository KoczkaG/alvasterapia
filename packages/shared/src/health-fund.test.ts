import { describe, it, expect } from 'vitest';
import {
  composeEpPayeeName,
  epFieldsSchema,
  resolveEpPayee,
  type HealthFund,
} from './health-fund.js';

describe('composeEpPayeeName — hierarchikus névsorrend (II/B 3.)', () => {
  it('kedvezményezettel a teljes hierarchiát összefűzi', () => {
    const name = composeEpPayeeName({
      patientName: 'Kovács Lajosné',
      fundName: 'OTP Egészségpénztár',
      membershipId: '123456',
      beneficiaryName: 'Kovács Lajos',
    });
    expect(name).toBe(
      'Kovács Lajosné / OTP Egészségpénztár (Kedvezményezett: Kovács Lajos / Tagi azonosító: 123456)',
    );
  });

  it('kedvezményezett nélkül elhagyja azt a részt', () => {
    const name = composeEpPayeeName({
      patientName: 'Nagy István',
      fundName: 'MEDICINA Egészségpénztár',
      membershipId: '999',
    });
    expect(name).toBe(
      'Nagy István / MEDICINA Egészségpénztár (Tagi azonosító: 999)',
    );
  });
});

describe('resolveEpPayee — vevőadat feloldás', () => {
  const softFund: HealthFund = {
    id: 'otp',
    name: 'OTP Egészségpénztár',
    strict: false,
  };
  const strictFund: HealthFund = {
    id: 'strict',
    name: 'Szigorú EP',
    strict: true,
    officialAddress: '1101 Budapest, Példa utca 1.',
    taxNumber: '12345678-2-42',
  };

  it('könnyített EP: a beteg lakcímére szól, nincs adószám', () => {
    const payee = resolveEpPayee({
      fund: softFund,
      patientName: 'Kovács Lajosné',
      patientAddress: '1145 Budapest, Lakatos utca 22.',
      fields: { fundId: 'otp', membershipId: '123456' },
    });
    expect(payee.address).toBe('1145 Budapest, Lakatos utca 22.');
    expect(payee.taxNumber).toBeUndefined();
    expect(payee.name).toContain('OTP Egészségpénztár');
  });

  it('szigorú EP: az EP székhelye + adószáma kerül a vevőadatba', () => {
    const payee = resolveEpPayee({
      fund: strictFund,
      patientName: 'Kovács Lajosné',
      patientAddress: '1145 Budapest, Lakatos utca 22.',
      fields: { fundId: 'strict', membershipId: '123456' },
    });
    expect(payee.address).toBe('1101 Budapest, Példa utca 1.');
    expect(payee.taxNumber).toBe('12345678-2-42');
    // A NÉV mező akkor is a beteg + EP hierarchia:
    expect(payee.name).toContain('Kovács Lajosné');
    expect(payee.name).toContain('Szigorú EP');
  });
});

describe('epFieldsSchema — EP-mezők validáció', () => {
  it('elfogad egy érvényes kitöltést', () => {
    expect(
      epFieldsSchema.safeParse({ fundId: 'otp', membershipId: '123456' }).success,
    ).toBe(true);
  });
  it('elutasítja a hiányzó tagi azonosítót', () => {
    expect(
      epFieldsSchema.safeParse({ fundId: 'otp', membershipId: '' }).success,
    ).toBe(false);
  });
  it('elutasítja a hiányzó EP-t', () => {
    expect(
      epFieldsSchema.safeParse({ fundId: '', membershipId: '123' }).success,
    ).toBe(false);
  });
});
