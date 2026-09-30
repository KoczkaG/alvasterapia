import type { OpeningCalendar } from '@somnoshop/shared';

/**
 * A nyitvatartási naptár kimenő szinkron-csatornái (I/B, "II. RÉSZ 1. pont").
 *
 * A központi KVL Naptár Modul az EGYETLEN igazságforrás; bármilyen módosítás
 * automatikusan, emberi beavatkozás nélkül átíródik:
 *   - a telefonos IVR nyitvatartási almenüjébe,
 *   - a webshop "Kapcsolat" oldalára,
 *   - a Google Business (Google Térkép) profilra.
 *
 * Mindegyik külső rendszer, ezért adapter (Port) mögé rejtjük. Amíg a valódi
 * integrációk nem élnek, mock adapterek naplózzák a szinkronhívásokat.
 */

export interface OpeningSyncTarget {
  /** A célrendszer neve (naplózáshoz, hibadiagnosztikához). */
  readonly name: string;
  /** A teljes naptár leadása a célrendszernek. */
  push(calendar: OpeningCalendar): Promise<void>;
}

export const IVR_SYNC = Symbol('IVR_SYNC');
export const WEBSHOP_SYNC = Symbol('WEBSHOP_SYNC');
export const GOOGLE_SYNC = Symbol('GOOGLE_SYNC');

/** Az összes szinkron-célt együtt injektáló token. */
export const OPENING_SYNC_TARGETS = Symbol('OPENING_SYNC_TARGETS');
