import { z } from 'zod';

/**
 * Próbakezelési Szerződés-modul — Személyes Kiszolgálás (III. Modul / A).
 *
 * A dokumentum lényege: a papír- és Word-alapú, háromszoros manuális adatbevitel
 * kiváltása egyetlen, egypontos digitális folyamaƩal. A pulti kiszolgálás lépései:
 *
 *   1. OCR: az ambuláns lapból a beteg adatai (név, TAJ, cím, orvos, pecsétszám,
 *      terápiás nyomás) automatikusan beemelődnek → TERVEZET (draft).
 *   2. GDPR-kapu: a 4 marketing/GDPR kérdés rögzítése KÖTELEZŐ; enélkül a
 *      "Tovább a kosárhoz" zárolva (→ gdpr_ok).
 *   3. Kosár: eszköz + maszk + kaució + kötelező baktériumszűrők (→ cart).
 *   4. Fizetés: a kaució és a bakt.szűrő egyben, terminálon (→ paid).
 *   5. Aláírás: alapértelmezetten eIDAS SMS-kódos digitális aláírás; idős/elakadó
 *      betegnél papíralapú fallback (→ signed).
 *   6. Lezárás: PDF szerződés + jótállási jegy, Timeline-ra rögzítve (→ closed).
 *
 * Ez a fájl a tisztán számítható magot tartalmazza: állapotgép, jótállási idő,
 * aláírás-állapot és a Zod sémák. A külső függőségek (OCR, e-aláírás, EESZT,
 * PDF, terminál) adapter-portok mögött futnak az API oldalon.
 */

// ---------------------------------------------------------------------------
// 1. Szerződés életciklus (állapotgép)
// ---------------------------------------------------------------------------

export type ContractStatus =
  | 'draft' // OCR beemelve, adatok szerkeszthetők
  | 'gdpr_ok' // a GDPR/marketing nyilatkozat rögzítve
  | 'cart' // a kosár (eszköz, maszk, kaució, szűrők) véglegesítve
  | 'paid' // sikeres fizetés (terminál/utalás)
  | 'signed' // a szerződés aláírva (SMS-kód vagy papír)
  | 'closed'; // lezárva — PDF + jótállási jegy kiállítva, Timeline-ra írva

/** Az állapotgép megengedett átmenetei (lineáris, előre haladó). */
const TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  draft: ['gdpr_ok'],
  gdpr_ok: ['cart'],
  cart: ['paid'],
  paid: ['signed'],
  signed: ['closed'],
  closed: [],
};

/** Megengedett-e az adott státusz-átmenet? */
export function canTransition(
  from: ContractStatus,
  to: ContractStatus,
): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** A következő státusz a lineáris folyamatban (vagy null, ha lezárt). */
export function nextStatus(from: ContractStatus): ContractStatus | null {
  return TRANSITIONS[from]?.[0] ?? null;
}

// ---------------------------------------------------------------------------
// 2. Aláírási mód és állapot
// ---------------------------------------------------------------------------

/**
 * Az aláírás módja. Alapértelmezetten a modern, eIDAS-konform SMS-kódos
 * digitális aláírás; a papír fallback az idős/okostelefon nélküli betegeknek.
 */
export type SignatureMethod = 'sms' | 'paper';

// ---------------------------------------------------------------------------
// 3. Jótállási idő
// ---------------------------------------------------------------------------

/** Terméktípusonkénti gyári jótállási idő évben (törzsadat). */
export interface WarrantyRule {
  productType: string;
  years: number;
}

export const DEFAULT_WARRANTY_RULES: WarrantyRule[] = [
  { productType: 'keszulek', years: 2 }, // CPAP/APAP készülék
  { productType: 'parasito', years: 2 },
  { productType: 'maszk', years: 1 },
];

/** isoDate + N év, YYYY-MM-DD-ként (dél a DST ellen). */
export function addYearsIso(isoDate: string, years: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  dt.setFullYear(dt.getFullYear() + years);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * A jótállás lejáratának dátuma egy adott terméktípusra. `null`, ha a
 * terméktípushoz nincs szabály.
 */
export function warrantyExpiry(
  purchaseIsoDate: string,
  productType: string,
  rules: WarrantyRule[],
): string | null {
  const rule = rules.find((r) => r.productType === productType);
  if (!rule) return null;
  return addYearsIso(purchaseIsoDate, rule.years);
}

// ---------------------------------------------------------------------------
// 4. Sémák — OCR-beemelt beteg, GDPR, kosár
// ---------------------------------------------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formátum: YYYY-MM-DD');

/** Az ambuláns lapból (OCR) kiolvasott és pulton pótolt beteg-adatok. */
export const contractPatientSchema = z.object({
  name: z.string().trim().min(2, 'A név megadása kötelező.'),
  /** 9 jegyű TAJ (szóköz nélkül). */
  taj: z.string().regex(/^\d{9}$/, 'A TAJ 9 számjegy.'),
  zip: z.string().regex(/^\d{4}$/, 'Az irányítószám 4 számjegy.'),
  city: z.string().trim().min(1),
  address: z.string().trim().min(1),
  /** Az orvos neve (OCR). */
  doctorName: z.string().trim().min(1),
  /** Az orvos pecsétszáma (OCR). */
  doctorStamp: z.string().trim().min(1),
  /** Terápiás nyomásérték [vízcm] — kötelező a gépbeállításhoz. */
  pressure: z.number().positive('A terápiás nyomásérték kötelező.'),
});
export type ContractPatient = z.infer<typeof contractPatientSchema>;

/**
 * A 4 kötelező GDPR/marketing hozzájárulási kérdés (I. Modul A). Igaz = hozzájárul.
 */
export const gdprConsentSchema = z.object({
  /** Kihordási időről tájékoztatás. */
  wearTimeInfo: z.boolean(),
  /** Hírlevél. */
  newsletter: z.boolean(),
  /** Postai küldemény. */
  postalContact: z.boolean(),
  /** E-mailes küldemény. */
  emailContact: z.boolean(),
});
export type GdprConsent = z.infer<typeof gdprConsentSchema>;

/** Egy kosártétel a szerződéskötéshez. */
export const contractItemSchema = z.object({
  productType: z.string().min(1),
  name: z.string().min(1),
  /** Egyedi gyári szám (SN) — készüléknél/párásítónál kötelező a jótálláshoz. */
  serialNumber: z.string().optional(),
  /** Kaució összege (Ft), ha a tétel próbaeszköz. */
  deposit: z.number().nonnegative().default(0),
  /** Vételár / TB-önrész (Ft), pl. a kötelező baktériumszűrőké. */
  price: z.number().nonnegative().default(0),
});
export type ContractItem = z.infer<typeof contractItemSchema>;

export const createContractSchema = z.object({
  partnerCode: z.string().min(1),
  patient: contractPatientSchema,
  purchaseDate: isoDate,
});
export type CreateContract = z.infer<typeof createContractSchema>;

// ---------------------------------------------------------------------------
// 5. Fizetendő összeg számítás
// ---------------------------------------------------------------------------

export interface ContractTotals {
  totalDeposit: number;
  totalPrice: number;
  /** A pulton egyben levonandó összeg (kaució + ár). */
  grandTotal: number;
}

/** A kosár összegzése: kaució + ár = a terminálra egyben küldött végösszeg. */
export function contractTotals(items: ContractItem[]): ContractTotals {
  const totalDeposit = round2(items.reduce((s, i) => s + (i.deposit ?? 0), 0));
  const totalPrice = round2(items.reduce((s, i) => s + (i.price ?? 0), 0));
  return {
    totalDeposit,
    totalPrice,
    grandTotal: round2(totalDeposit + totalPrice),
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Ellenőrzi, hogy a GDPR-kapu teljesült-e (mind a 4 kérdésre van explicit válasz).
 * A séma parse-ja garantálja a boolean-öket; ez a hívó oldali „tovább zár".
 */
export function isGdprComplete(consent: GdprConsent | null): boolean {
  if (!consent) return false;
  return (
    typeof consent.wearTimeInfo === 'boolean' &&
    typeof consent.newsletter === 'boolean' &&
    typeof consent.postalContact === 'boolean' &&
    typeof consent.emailContact === 'boolean'
  );
}
