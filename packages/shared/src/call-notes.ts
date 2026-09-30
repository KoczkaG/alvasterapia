import { z } from 'zod';

/**
 * Bővített hívásvégi jegyzet (I. Modul / E).
 *
 * A hívás (bejövő vagy kimenő) lezárásakor kötelezően kitöltendő, strukturált
 * jegyzet. Kiváltja a papírcetliket: a lényeg a beteg Idővonalára (Timeline)
 * kerül, a checkboxos témákból és a küldő intézményből pedig vezetői statisztika
 * épül.
 */

/**
 * A hívás fő oka(i) — a kolléga egyetlen kattintással jelölheti (akár többet is).
 * A dokumentum I/E 2. pontja szerinti témakörök.
 */
export const callTopicSchema = z.enum([
  'uj_ugyfel_info', // Új ügyfél információ
  'rendeles_leadas', // Rendelés leadás
  'venybevaltas', // Vénybeváltás
  'maszkbeallitas', // Maszkbeállítás / terápiás kérdés
  'szamlazas', // Számlázási / pénzügyi kérdés
  'szerviz_garancia', // Szerviz / garancia
  'panaszkezeles', // Panaszkezelés
]);
export type CallTopic = z.infer<typeof callTopicSchema>;

/** Emberi olvasható címkék a témákhoz (UI + statisztika). */
export const CALL_TOPIC_LABELS: Record<CallTopic, string> = {
  uj_ugyfel_info: 'Új ügyfél információ',
  rendeles_leadas: 'Rendelés leadás',
  venybevaltas: 'Vénybeváltás',
  maszkbeallitas: 'Maszkbeállítás / terápiás kérdés',
  szamlazas: 'Számlázási / pénzügyi kérdés',
  szerviz_garancia: 'Szerviz / garancia',
  panaszkezeles: 'Panaszkezelés',
};

/**
 * A hívásvégi jegyzet tartalma. A `complete` (jegyzetes lezárás) kéri be.
 */
export const callNoteSchema = z.object({
  /** A hívás fő oka(i) — legalább egy téma kötelező. */
  topics: z.array(callTopicSchema).min(1, 'Legalább egy téma megjelölése kötelező.'),
  /**
   * A küldő intézmény / alváslabor / kezelőorvos azonosítója (a belső
   * törzsadatbázisból választva). Opcionális — nem minden hívásnál releváns.
   */
  referrerId: z.string().optional(),
  /** A beszélgetés lényegének és a megbeszélt megoldásnak a kötelező összefoglalója. */
  summary: z.string().trim().min(3, 'A jegyzet összefoglalója kötelező.'),
  /** Igaz, ha visszahívás / teendő szükséges (automata feladatgenerálás). */
  followUpNeeded: z.boolean(),
});
export type CallNote = z.infer<typeof callNoteSchema>;

/**
 * Küldő intézmények / alváslaborok törzsadata (I/E 2. pont "legördülő menü").
 * A valódi listát a KVL / belső adminfelület tölti; itt egy kezdő, bővíthető
 * halmaz a demóhoz és a statisztikához.
 */
export interface Referrer {
  id: string;
  name: string;
}

export const DEFAULT_REFERRERS: Referrer[] = [
  { id: 'lab_semmelweis', name: 'Semmelweis Egyetem — Alváslabor' },
  { id: 'lab_koranyi', name: 'Országos Korányi Pulmonológiai Intézet' },
  { id: 'lab_debrecen', name: 'Debreceni Egyetem — Tüdőgyógyászat' },
  { id: 'lab_honved', name: 'Honvédkórház — Alvásdiagnosztika' },
  { id: 'orvos_egyeb', name: 'Egyéb kezelőorvos' },
  { id: 'webshop', name: 'Webshop / online' },
];
