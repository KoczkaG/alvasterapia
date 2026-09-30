import { z } from 'zod';

/**
 * Integrált Egészségpénztári (EP) Adatkapu (II. Modul / B).
 *
 * Az egészségpénztári számlázás automatizálása: strukturált EP-adatmezők,
 * a számlán kötelező, szigorú hierarchikus névsorrend automatikus összefűzése
 * (megszüntetve a pulti manuális gépelést), valamint a kivételnek számító,
 * szigorúbb EP-k „Riasztó/Zászló" kezelése.
 */

/**
 * Egy egészségpénztár törzsadata. A `strict` jelöli azt a néhány kritikus EP-t,
 * amelyik a könnyített (beteg-lakcímes) verziót NEM fogadja el, hanem kizárólag
 * a saját székhelyére és adószámára kéri a számlát.
 */
export interface HealthFund {
  id: string;
  name: string;
  /** Szigorú EP: kizárólag saját székhelyre + adószámra fogadja be a számlát. */
  strict: boolean;
  /** Szigorú EP esetén a hivatalos székhely és adószám (a vevőadatokhoz). */
  officialAddress?: string;
  taxNumber?: string;
}

/**
 * Kezdő EP-törzsadatbázis (bővíthető). A legtöbb EP a könnyített (lakcímes)
 * verziót elfogadja; néhány szigorú EP kivétel — ezek `strict: true`.
 * (A konkrét adatok demó-jellegűek, a valós törzsadat adminfelületről tölthető.)
 */
export const DEFAULT_HEALTH_FUNDS: HealthFund[] = [
  { id: 'otp', name: 'OTP Egészség- és Önsegélyező Pénztár', strict: false },
  { id: 'medicina', name: 'MEDICINA Egészségpénztár', strict: false },
  { id: 'patika', name: 'Patika Egészségpénztár', strict: false },
  { id: 'allianz', name: 'Allianz Egészségpénztár', strict: false },
  {
    id: 'strict_demo',
    name: 'Szigorú Egészségpénztár (példa)',
    strict: true,
    officialAddress: '1101 Budapest, Példa utca 1.',
    taxNumber: '12345678-2-42',
  },
];

/** A pulti EP-mezők (dokumentum II/B 2. pont). */
export const epFieldsSchema = z.object({
  /** Az egészségpénztár azonosítója (törzsadatból). */
  fundId: z.string().min(1, 'Válasszon egészségpénztárat.'),
  /** Tagi azonosító — kötelező számsor. */
  membershipId: z.string().trim().min(1, 'A tagi azonosító kötelező.'),
  /** Kedvezményezett neve — opcionális. */
  beneficiaryName: z.string().trim().optional(),
});
export type EpFields = z.infer<typeof epFieldsSchema>;

/**
 * A számla vevő-adatai, ahogy a bizonylatra kerülnek. A számlakép ebből épül.
 */
export interface InvoicePayee {
  /** A számlán megjelenő NÉV mező (EP-nél az összefűzött hierarchia). */
  name: string;
  /** A számlázási cím (könnyített EP-nél a beteg lakcíme; szigorúnál az EP székhelye). */
  address: string;
  /** Adószám — csak szigorú EP esetén töltve. */
  taxNumber?: string;
}

/**
 * A számla NÉV mezőjének kötelező, szigorú hierarchikus összefűzése (II/B 3.):
 *   [Beteg neve] / [EP neve] (Kedvezményezett: [név] / Tagi azonosító: [szám])
 * A kedvezményezett rész csak akkor jelenik meg, ha meg van adva.
 */
export function composeEpPayeeName(params: {
  patientName: string;
  fundName: string;
  membershipId: string;
  beneficiaryName?: string;
}): string {
  const beneficiary = params.beneficiaryName?.trim()
    ? `Kedvezményezett: ${params.beneficiaryName.trim()} / `
    : '';
  return `${params.patientName} / ${params.fundName} (${beneficiary}Tagi azonosító: ${params.membershipId})`;
}

/**
 * Előállítja a számla vevő-adatait EP-s számlához.
 *
 *  - Könnyített (nem szigorú) EP: a számla a BETEG lakcímére szól, a NÉV mezőben
 *    az összefűzött hierarchiával.
 *  - Szigorú EP: a vevő az EP hivatalos székhelye + adószáma. FONTOS: a beteg
 *    saját profiladatai NEM módosulnak — ez csak a bizonylat vevő-adata.
 */
export function resolveEpPayee(params: {
  fund: HealthFund;
  patientName: string;
  patientAddress: string;
  fields: EpFields;
}): InvoicePayee {
  const composedName = composeEpPayeeName({
    patientName: params.patientName,
    fundName: params.fund.name,
    membershipId: params.fields.membershipId,
    beneficiaryName: params.fields.beneficiaryName,
  });

  if (params.fund.strict) {
    return {
      name: composedName,
      address: params.fund.officialAddress ?? params.patientAddress,
      ...(params.fund.taxNumber ? { taxNumber: params.fund.taxNumber } : {}),
    };
  }

  // Könnyített verzió: a beteg saját lakcíme.
  return { name: composedName, address: params.patientAddress };
}
