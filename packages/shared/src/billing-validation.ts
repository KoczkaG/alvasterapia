import { z } from 'zod';

/**
 * Pulti Védőháló — kód-validátor és logikai zárási szűrő (II. Modul / D).
 *
 * Célja a hibás pulti kódbevitel 100%-os kiszűrése és a hibás fizetési
 * mód/postaköltség párosítások megakadályozása MÉG a számla élesedése előtt —
 * ez állítja meg a dokumentum szerinti "stornó-hullámot".
 *
 * Minden itt lévő logika tiszta (adatbázis és külső rendszer nélkül), így
 * kimerítően tesztelhető, és a backend/ frontend is ugyanazt használja.
 */

// ---------------------------------------------------------------------------
// 1. Kód-szintű validátor (Elírás-Gátló)
// ---------------------------------------------------------------------------

/** A hatósági kódok típusai és a kötelező prefixük (dokumentum II/D 1. pont). */
export const CODE_PREFIX = {
  /** Vény száma / vénykód — szigorúan 27-essel kezdődik. */
  prescription: '27',
  /** Egyedi azonosító / matrica alsó (egyedi) számsora — 21-essel kezdődik. */
  matrica: '21',
  /** Hatósági orvoskód — 99-essel kezdődik. */
  doctor: '99',
} as const;

export type BillingCodeKind = keyof typeof CODE_PREFIX;

export const CODE_KIND_LABELS: Record<BillingCodeKind, string> = {
  prescription: 'Vénykód',
  matrica: 'Matrica (egyedi azonosító)',
  doctor: 'Orvoskód',
};

export interface CodeValidationResult {
  valid: boolean;
  /** Hibaüzenet, ha érvénytelen. */
  message?: string;
}

/**
 * Egyetlen kód ellenőrzése: csak számjegy, és a típushoz tartozó prefixszel
 * kezdődik. A bevitt kódról levágjuk a whitespace-t.
 */
export function validateCode(
  kind: BillingCodeKind,
  raw: string,
): CodeValidationResult {
  const code = raw.trim();
  if (code === '') {
    return { valid: false, message: 'A kód megadása kötelező.' };
  }
  if (!/^\d+$/.test(code)) {
    return { valid: false, message: 'A kód csak számjegyeket tartalmazhat.' };
  }
  const prefix = CODE_PREFIX[kind];
  if (!code.startsWith(prefix)) {
    return {
      valid: false,
      message: `A(z) ${CODE_KIND_LABELS[kind]} kizárólag ${prefix}-tal/-tel kezdődhet.`,
    };
  }
  return { valid: true };
}

/**
 * Ctrl+V duplikáció szűrő: megakadályozza, hogy ugyanaz a kód kétszer kerüljön
 * be (vágólapon maradt előző adat). Igaz, ha az új kód már szerepel a listában.
 */
export function isDuplicateCode(
  existingCodes: string[],
  newCode: string,
): boolean {
  const normalized = newCode.trim();
  return existingCodes.map((c) => c.trim()).includes(normalized);
}

// ---------------------------------------------------------------------------
// 2. Kétirányú logikai zárási szűrő (fizetési mód ⇄ postaköltség)
// ---------------------------------------------------------------------------

export const paymentMethodSchema = z.enum([
  'cash', // Készpénz
  'card', // Bankkártya
  'transfer', // Átutalás
  'cod', // Postai utánvét (cash on delivery)
]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Készpénz',
  card: 'Bankkártya',
  transfer: 'Átutalás',
  cod: 'Postai utánvét',
};

/** Egy számlatétel a zárási ellenőrzéshez. */
export interface InvoiceLine {
  /** Cikkszám / azonosító. */
  code: string;
  name: string;
  /** Igaz, ha ez a tétel a postaköltség / csomagküldési díj. */
  isPostage?: boolean;
}

export interface ClosingCheckResult {
  ok: boolean;
  /** Hibakód a UI/naplózáshoz. */
  code?: 'POSTAGE_REQUIRES_REMOTE_PAYMENT' | 'MISSING_POSTAGE';
  message?: string;
}

/** A postaköltségnél kizárólag "távoli" fizetés megengedett. */
const REMOTE_PAYMENTS: PaymentMethod[] = ['transfer', 'cod'];

/**
 * Kétirányú összeférhetetlenségi szűrő (dokumentum II/D 4. pont):
 *
 *  a) Ha a tételek közt VAN postaköltség → a Készpénz és a Bankkártya tiltott
 *     (csak Átutalás / Utánvét engedélyezett).
 *  b) Ha a fizetési mód Postai utánvét → KÖTELEZŐ a postaköltség tétel.
 */
export function checkClosingRules(
  lines: InvoiceLine[],
  payment: PaymentMethod,
): ClosingCheckResult {
  const hasPostage = lines.some((l) => l.isPostage);

  // a) postaköltség jelenléte → csak távoli fizetés
  if (hasPostage && !REMOTE_PAYMENTS.includes(payment)) {
    return {
      ok: false,
      code: 'POSTAGE_REQUIRES_REMOTE_PAYMENT',
      message:
        'Postaköltség szerepel a számlán — ilyenkor csak Átutalás vagy Postai utánvét választható.',
    };
  }

  // b) postai utánvét → kötelező postaköltség
  if (payment === 'cod' && !hasPostage) {
    return {
      ok: false,
      code: 'MISSING_POSTAGE',
      message:
        'HIÁNYZÓ TÉTEL: Postai utánvétes fizetésnél a postaköltséget kötelező hozzáadni a számlához!',
    };
  }

  return { ok: true };
}
