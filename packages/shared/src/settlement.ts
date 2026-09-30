import { z } from 'zod';

/**
 * Elszámolási és statisztikai logika (II. Modul / E).
 *
 * Három, tisztán számítható mag:
 *  1. Kihordási idő követése — mikor válik a beteg jogosulttá új eszközre.
 *  2. Kaució-Elszámoló Adatlap — a próbaidőszak végi visszajáró átlátható
 *     matematikai levezetése (a "telefonos panaszok" megszüntetésére).
 *  3. OEP Napi Egyeztető — a KVL-es darabszámok összevetése a Mankó (EESZT)
 *     hivatalos darabszámaival, hogy az eltérés "frissiben" javítható legyen.
 */

// ---------------------------------------------------------------------------
// 1. Kihordási idő (konfigurálható termékenkénti hónap)
// ---------------------------------------------------------------------------

/**
 * Egy terméktípus kihordási ideje hónapban. Törzsadat — a vezetőség/admin
 * finomíthatja. Alapértelmezett példák (a maszk jogszabályi kihordása 12 hónap).
 */
export interface WearTimeRule {
  productType: string;
  months: number;
}

export const DEFAULT_WEAR_TIME_RULES: WearTimeRule[] = [
  { productType: 'maszk', months: 12 },
  { productType: 'parna', months: 6 }, // maszkpárna
  { productType: 'gegecso', months: 6 },
  { productType: 'szuro', months: 3 }, // pollenszűrő
];

/** isoDate + N hónap, YYYY-MM-DD-ként (helyi naptári számítás, dél a DST ellen). */
export function addMonthsIso(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  dt.setMonth(dt.getMonth() + months);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Kiszámítja, mikortól válik a beteg jogosulttá új, TB-támogatott eszközre:
 * a vásárlás dátuma + a termék kihordási ideje.
 * `null`, ha a terméktípushoz nincs szabály.
 */
export function eligibilityDate(
  purchaseIsoDate: string,
  productType: string,
  rules: WearTimeRule[],
): string | null {
  const rule = rules.find((r) => r.productType === productType);
  if (!rule) return null;
  return addMonthsIso(purchaseIsoDate, rule.months);
}

/**
 * Jogosult-e már új eszközre a megadott (mai) naphoz képest? Igaz, ha a
 * kihordási idő letelt (eligibilityDate <= today).
 */
export function isEligibleForReplacement(
  purchaseIsoDate: string,
  productType: string,
  rules: WearTimeRule[],
  todayIso: string,
): boolean {
  const due = eligibilityDate(purchaseIsoDate, productType, rules);
  return due !== null && due <= todayIso;
}

// ---------------------------------------------------------------------------
// 2. Kaució-Elszámoló Adatlap
// ---------------------------------------------------------------------------

/** Egy befizetés a kaució-elszámoláshoz. */
export const depositPaymentSchema = z.object({
  /** Bizonylatszám (nyomon követhetőség). */
  reference: z.string().min(1),
  amount: z.number().nonnegative(),
  /** ISO dátum. */
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type DepositPayment = z.infer<typeof depositPaymentSchema>;

/** Egy levonás (pl. TB-önrész, tisztítási díj, bérleti nap). */
export const deductionSchema = z.object({
  label: z.string().min(1),
  amount: z.number().nonnegative(),
});
export type Deduction = z.infer<typeof deductionSchema>;

export const settlementInputSchema = z.object({
  payments: z.array(depositPaymentSchema),
  deductions: z.array(deductionSchema),
});
export type SettlementInput = z.infer<typeof settlementInputSchema>;

export interface SettlementResult {
  /** A befizetések összege. */
  totalPaid: number;
  /** A levonások összege. */
  totalDeductions: number;
  /**
   * A nettó egyenleg. Pozitív = ennyi jár VISSZA a betegnek; negatív = ennyit
   * kell még a betegnek RÁFIZETNIE.
   */
  balance: number;
  /** Igaz, ha a betegnek jár vissza (balance >= 0). */
  refundDue: boolean;
}

/**
 * A kaució-elszámolás átlátható levezetése: befizetések − levonások.
 * A dokumentum szerint ez a "feketén-fehéren" bemutatott matek, ami megszünteti
 * a "miért csak ennyit kaptam vissza" telefonos reklamációkat.
 */
export function computeSettlement(input: SettlementInput): SettlementResult {
  const totalPaid = round2(
    input.payments.reduce((s, p) => s + p.amount, 0),
  );
  const totalDeductions = round2(
    input.deductions.reduce((s, d) => s + d.amount, 0),
  );
  const balance = round2(totalPaid - totalDeductions);
  return { totalPaid, totalDeductions, balance, refundDue: balance >= 0 };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// 3. OEP Napi Egyeztető
// ---------------------------------------------------------------------------

/** Egy termék KVL-es (általunk kiállított) darabszáma. */
export interface KvlProductCount {
  productType: string;
  count: number;
}

/** A Mankó (EESZT) hivatalos összesítő darabszáma (a kolléga beírja). */
export interface MankoProductCount {
  productType: string;
  count: number;
}

export interface ReconciliationRow {
  productType: string;
  kvlCount: number;
  mankoCount: number;
  /** kvlCount - mankoCount; 0 = egyezik. */
  diff: number;
  match: boolean;
}

export interface ReconciliationResult {
  rows: ReconciliationRow[];
  /** Igaz, ha minden termék egyezik (nincs eltérés). */
  allMatch: boolean;
}

/**
 * Összeveti a KVL-es és a Mankó-s darabszámokat termékenként. Az eltéréseket
 * azonnal kijelzi, hogy a hiba "frissiben", aznap javítható legyen. A két
 * forrás termékhalmazának uniójára fut (a csak az egyikben szereplő is látszik).
 */
export function reconcileOep(
  kvl: KvlProductCount[],
  manko: MankoProductCount[],
): ReconciliationResult {
  const types = new Set<string>([
    ...kvl.map((k) => k.productType),
    ...manko.map((m) => m.productType),
  ]);
  const kvlMap = new Map(kvl.map((k) => [k.productType, k.count]));
  const mankoMap = new Map(manko.map((m) => [m.productType, m.count]));

  const rows: ReconciliationRow[] = [...types]
    .sort()
    .map((productType) => {
      const kvlCount = kvlMap.get(productType) ?? 0;
      const mankoCount = mankoMap.get(productType) ?? 0;
      const diff = kvlCount - mankoCount;
      return { productType, kvlCount, mankoCount, diff, match: diff === 0 };
    });

  return { rows, allMatch: rows.every((r) => r.match) };
}
