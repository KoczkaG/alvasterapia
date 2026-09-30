import type { MarketingAnswers } from '@somnoshop/shared';

/**
 * A 4 kötelező kérdés megjelenítési szövege. A kulcsok megegyeznek a
 * @somnoshop/shared MarketingAnswers mezőivel, így típusbiztos a kötés.
 */
export const CONSENT_QUESTIONS: {
  key: keyof MarketingAnswers;
  label: string;
}[] = [
  {
    key: 'kihordasiIdoTajekoztatas',
    label:
      'Kérem, hogy tájékoztassanak, amikor a jelenlegi eszközöm (pl. maszk) kihordási ideje lejár, és jogosulttá válok új, támogatott eszközre.',
  },
  {
    key: 'hirlevel',
    label: 'Feliratkozom a SOMNO SHOP hírlevelére.',
  },
  {
    key: 'postaiKuldemeny',
    label:
      'Hozzájárulok, hogy a SOMNO SHOP postai úton küldjön nekem dokumentumokat (pl. számla).',
  },
  {
    key: 'emailKuldemeny',
    label:
      'Hozzájárulok, hogy a SOMNO SHOP e-mailben küldjön nekem dokumentumokat (pl. számla).',
  },
];
