import { describe, it, expect } from 'vitest';
import {
  OUTBOUND_RECORDING_NOTICE,
  RECORDING_STOPPED_REASON,
  startCallSchema,
} from './calls.js';

describe('startCallSchema — hívásindítási validáció', () => {
  const valid = {
    partnerCode: 'P-000123',
    phoneKind: 'patient_mobile',
    phoneNumber: '+36 30 123 4567',
    origin: 'counter',
  };

  it('elfogad egy érvényes kérést', () => {
    expect(startCallSchema.safeParse(valid).success).toBe(true);
  });

  it('elfogadja a jogosult kapcsolattartó számát is', () => {
    expect(
      startCallSchema.safeParse({ ...valid, phoneKind: 'authorized_contact' })
        .success,
    ).toBe(true);
  });

  it('elutasítja az ismeretlen phoneKind-ot', () => {
    expect(
      startCallSchema.safeParse({ ...valid, phoneKind: 'fax' }).success,
    ).toBe(false);
  });

  it('elutasítja, ha hiányzik a partnerCode', () => {
    const { partnerCode, ...rest } = valid;
    void partnerCode;
    expect(startCallSchema.safeParse(rest).success).toBe(false);
  });

  it('elfogadja az opcionális szerviz-munkalapszámot', () => {
    expect(
      startCallSchema.safeParse({
        ...valid,
        origin: 'service',
        serviceWorksheetId: 'WS-42',
      }).success,
    ).toBe(true);
  });
});

describe('kötelező jogi szövegek', () => {
  it('a GDPR-sablon tartalmazza a leállítási felajánlást', () => {
    expect(OUTBOUND_RECORDING_NOTICE).toContain('leállítom a felvételt');
  });
  it('a törlési ok megnevezi a törlést', () => {
    expect(RECORDING_STOPPED_REASON).toContain('törölve');
  });
});
