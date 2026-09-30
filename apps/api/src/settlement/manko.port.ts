/**
 * Mankó (EESZT) adapter (Port) — a hivatalos, országos gyógyászatisegédeszköz-
 * nyilvántartás (II. Modul / E, OEP Napi Egyeztető).
 *
 * A Mankó egy külső, hatósági rendszer. Amíg a valódi EESZT-integráció nem él,
 * egy MOCK implementáció fut e mögött az interfész mögött: visszaadja egy adott
 * napra a hivatalos, termékenkénti darabszámokat, amelyeket a KVL-es (általunk
 * kiállított) darabszámokkal vetünk össze. Így az eltérés még aznap javítható.
 *
 * A valódi adaptert ugyanezen interfész mögé kell majd illeszteni — a modul
 * provider-cseréjével, a hívók módosítása nélkül.
 */

import type { MankoProductCount } from '@somnoshop/shared';

export interface MankoPort {
  /**
   * A Mankóban (EESZT) egy adott napra rögzített hivatalos, termékenkénti
   * darabszámok lekérdezése.
   * @param dateIso ISO nap (YYYY-MM-DD)
   */
  fetchOfficialCounts(dateIso: string): Promise<MankoProductCount[]>;
}

export const MANKO_PORT = Symbol('MANKO_PORT');
