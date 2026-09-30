import { describe, it, expect } from 'vitest';
import { isZeroConsent, marketingAnswersSchema } from './consent.js';

describe('isZeroConsent — Számla-Parkoltatási Radar kiváltó feltétel', () => {
  it('igaz, ha sem postai, sem e-mailes küldeményhez nem járul hozzá', () => {
    expect(
      isZeroConsent({
        kihordasiIdoTajekoztatas: true,
        hirlevel: true,
        postaiKuldemeny: false,
        emailKuldemeny: false,
      }),
    ).toBe(true);
  });

  it('hamis, ha legalább az egyik küldési csatornát engedélyezi', () => {
    expect(
      isZeroConsent({
        kihordasiIdoTajekoztatas: false,
        hirlevel: false,
        postaiKuldemeny: true,
        emailKuldemeny: false,
      }),
    ).toBe(false);

    expect(
      isZeroConsent({
        kihordasiIdoTajekoztatas: false,
        hirlevel: false,
        postaiKuldemeny: false,
        emailKuldemeny: true,
      }),
    ).toBe(false);
  });
});

describe('marketingAnswersSchema', () => {
  it('elutasítja, ha hiányzik egy kötelező válasz', () => {
    const result = marketingAnswersSchema.safeParse({
      kihordasiIdoTajekoztatas: true,
      hirlevel: false,
      postaiKuldemeny: true,
      // emailKuldemeny hiányzik
    });
    expect(result.success).toBe(false);
  });
});
