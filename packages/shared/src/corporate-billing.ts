import { z } from 'zod';
import type { InvoicePayee } from './health-fund.js';

/**
 * Céges (belföldi adóalany) számlázás — Adónem-váltási Adatvédelem (II. Modul / A).
 *
 * A dokumentum kritikus elvárása: amikor „Magánszemélyről" „Belföldi jogi
 * személyre/Adóalanyra" váltunk a számlázásban, a beteg adatlapjára beírt
 * törzsadatok SOHA nem törlődhetnek. A mi megvalósításunkban ezt úgy érjük el,
 * hogy a céges adat egy KÜLÖN vevő-adat (payee) a bizonylaton — a partner
 * KVL-profilja érintetlen marad (ugyanaz a minta, mint a szigorú EP-nél, II/B).
 */

/** Belföldi adószám: 8-1-2 tagolású (pl. 12345678-2-42). */
export const hunTaxNumberSchema = z
  .string()
  .regex(/^\d{8}-\d-\d{2}$/, 'Az adószám formátuma: 12345678-2-42.');

/** A céges vevő adatai (a számla vevő-adatához). */
export const corporatePayeeSchema = z.object({
  /** A cég neve. */
  name: z.string().trim().min(2, 'A cégnév megadása kötelező.'),
  /** A cég székhelye. */
  address: z.string().trim().min(1, 'A cég székhelyének megadása kötelező.'),
  /** Belföldi adószám. */
  taxNumber: hunTaxNumberSchema,
});
export type CorporatePayee = z.infer<typeof corporatePayeeSchema>;

/**
 * A céges vevő-adatból számla-vevőadatot állít elő. Ez KIZÁRÓLAG a bizonylatra
 * vonatkozik — a beteg (partner) profiladatait nem érinti.
 */
export function resolveCorporatePayee(corp: CorporatePayee): InvoicePayee {
  return {
    name: corp.name,
    address: corp.address,
    taxNumber: corp.taxNumber,
  };
}
