import { describe, it, expect } from 'vitest';
import {
  categoryForType,
  philipsRecallImportRowSchema,
} from './timeline.js';

describe('categoryForType — eseménytípus → kategória', () => {
  it('a hívást kommunikációba sorolja', () => {
    expect(categoryForType('OUTBOUND_CALL')).toBe('communication');
  });
  it('a számlát pénzügybe', () => {
    expect(categoryForType('INVOICE_ISSUED')).toBe('finance');
  });
  it('a csomagstátuszt logisztikába', () => {
    expect(categoryForType('PACKAGE_DELIVERED')).toBe('logistics');
  });
  it('a parkoltatást hozzájárulásba', () => {
    expect(categoryForType('GDPR_PARKOLTATAS_LEZARVA')).toBe('consent');
  });
  it('a Philips-riasztást alert kategóriába', () => {
    expect(categoryForType('PHILIPS_RECALL')).toBe('alert');
  });
  it('ismeretlen típus → communication (biztonságos alap)', () => {
    expect(categoryForType('VALAMI_UJ_TIPUS')).toBe('communication');
  });
});

describe('philipsRecallImportRowSchema — import sor validáció', () => {
  it('elfogad egy érvényes sort', () => {
    expect(
      philipsRecallImportRowSchema.safeParse({
        partnerCode: 'P-000123',
        replacementModel: 'DreamStation 2',
        serialNumber: 'SN-ABC-999',
        replacedOn: '2024-05-10',
      }).success,
    ).toBe(true);
  });
  it('a replacedOn opcionális', () => {
    expect(
      philipsRecallImportRowSchema.safeParse({
        partnerCode: 'P-000123',
        replacementModel: 'DreamStation 2',
        serialNumber: 'SN-ABC-999',
      }).success,
    ).toBe(true);
  });
  it('elutasítja a hiányos sort', () => {
    expect(
      philipsRecallImportRowSchema.safeParse({ partnerCode: 'P-1' }).success,
    ).toBe(false);
  });
});
