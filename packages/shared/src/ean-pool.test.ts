import { describe, it, expect } from 'vitest';
import {
  decideInvoiceDelivery,
  eanPoolUploadSchema,
  expandPoolUpload,
  MAX_POOL_EXPANSION,
} from './ean-pool.js';

describe('expandPoolUpload — kódtömb kibontása', () => {
  it('tartományt bont ki inkluzívan', () => {
    const codes = expandPoolUpload({
      label: 'teszt',
      range: { from: '27000001', to: '27000005' },
    });
    expect(codes).toEqual([
      '27000001',
      '27000002',
      '27000003',
      '27000004',
      '27000005',
    ]);
  });

  it('megőrzi a vezető nullákat a from szélessége szerint', () => {
    const codes = expandPoolUpload({
      label: 'teszt',
      range: { from: '0008', to: '0010' },
    });
    expect(codes).toEqual(['0008', '0009', '0010']);
  });

  it('explicit listát is elfogad, duplikátum nélkül', () => {
    const codes = expandPoolUpload({
      label: 'teszt',
      codes: ['21001', '21002', '21001'],
    });
    expect(codes).toEqual(['21001', '21002']);
  });

  it('tartomány + lista egyesítve, duplikátumok kiszűrve', () => {
    const codes = expandPoolUpload({
      label: 'teszt',
      range: { from: '100', to: '102' },
      codes: ['102', '200'],
    });
    expect(codes.sort()).toEqual(['100', '101', '102', '200']);
  });

  it('hibát dob, ha a záró kisebb a kezdőnél', () => {
    expect(() =>
      expandPoolUpload({ label: 'x', range: { from: '10', to: '5' } }),
    ).toThrow();
  });

  it('védi a túl nagy tartomány ellen', () => {
    expect(() =>
      expandPoolUpload({
        label: 'x',
        range: { from: '1', to: String(MAX_POOL_EXPANSION + 10) },
      }),
    ).toThrow();
  });
});

describe('eanPoolUploadSchema — feltöltés validáció', () => {
  it('elfogad tartományt', () => {
    expect(
      eanPoolUploadSchema.safeParse({
        label: 'A',
        range: { from: '1', to: '10' },
      }).success,
    ).toBe(true);
  });
  it('elfogad listát', () => {
    expect(
      eanPoolUploadSchema.safeParse({ label: 'A', codes: ['27001'] }).success,
    ).toBe(true);
  });
  it('elutasítja, ha sem tartomány, sem lista', () => {
    expect(eanPoolUploadSchema.safeParse({ label: 'A' }).success).toBe(false);
  });
  it('elutasítja a nem-szám kódot', () => {
    expect(
      eanPoolUploadSchema.safeParse({ label: 'A', codes: ['27ABC'] }).success,
    ).toBe(false);
  });
});

describe('decideInvoiceDelivery — hibrid kiadás', () => {
  it('e-mail címmel → digitális', () => {
    expect(decideInvoiceDelivery('a@b.hu')).toBe('email');
  });
  it('e-mail nélkül → nyomtatás', () => {
    expect(decideInvoiceDelivery(null)).toBe('print');
    expect(decideInvoiceDelivery('')).toBe('print');
    expect(decideInvoiceDelivery('   ')).toBe('print');
  });
});
