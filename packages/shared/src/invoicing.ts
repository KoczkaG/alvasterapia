import { z } from 'zod';
import { paymentMethodSchema } from './billing-validation.js';
import { epFieldsSchema } from './health-fund.js';

/**
 * Számlázási folyamat modell (II. Modul / D — Pulti Védőháló és Terminál-Kassza).
 *
 * A dokumentum szerinti biztonságos folyamat:
 *  1. "Számla lezárása" → a rendszer feldob egy TERVEZET/FÜGGŐ nyomtatási képet
 *     (még NINCS NAV-sorszám), a kolléga tételesen ellenőrzi.
 *  2. Bankkártyás fizetésnél a végösszeg a terminálra megy; ha a terminál
 *     elutasít (limit/fedezet), a lezárás és a NAV-szinkron le van tiltva.
 *  3. Éles (NAV-sorszámos) számla csak sikeres fizetés után generálódhat.
 */

/** Egy számlatétel (a tervezethez és a véglegesítéshez). */
export const invoiceItemSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  /** Bruttó egységár (Ft). */
  unitGross: z.number().nonnegative(),
  /** Igaz, ha ez a postaköltség tétel. */
  isPostage: z.boolean().optional(),
});
export type InvoiceItem = z.infer<typeof invoiceItemSchema>;

/** Számlatervezet létrehozási kérése. */
export const createDraftSchema = z.object({
  partnerCode: z.string().min(1),
  items: z.array(invoiceItemSchema).min(1, 'Legalább egy tétel szükséges.'),
  payment: paymentMethodSchema,
  /**
   * Opcionális egészségpénztári adatok (II/B). Ha jelen van, a számla vevő-adata
   * az EP-logika szerint áll össze (hierarchikus névsorrend; szigorú EP-nél
   * székhely + adószám). A beteg profiladatai ettől nem módosulnak.
   */
  ep: epFieldsSchema.optional(),
});
export type CreateDraft = z.infer<typeof createDraftSchema>;

/** A számla életciklus-státusza. */
export const invoiceStatusSchema = z.enum([
  'draft', // tervezet/függő — még nincs NAV-sorszám
  'awaiting_payment', // kártyás fizetésre vár a terminálon
  'issued', // éles, NAV-sorszámos számla kiállítva
  'cancelled', // elvetett tervezet
]);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

/** Egy tétel összesített bruttója. */
export function lineTotal(item: InvoiceItem): number {
  return item.quantity * item.unitGross;
}

/** A számla végösszege (bruttó). */
export function invoiceTotal(items: InvoiceItem[]): number {
  return items.reduce((sum, i) => sum + lineTotal(i), 0);
}
