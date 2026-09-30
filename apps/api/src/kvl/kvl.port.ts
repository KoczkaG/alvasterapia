/**
 * A KVL-integráció absztrakciós rétege (Port).
 *
 * A KVL egy külső, zárt rendszer; a fejlesztői jelenleg csak API-végpontokat
 * tudnak létrehozni. Amíg ezek a végpontok nem élnek, egy MOCK implementáció
 * fut e mögött az interfész mögött, így a mi fejlesztésünk nem blokkolódik.
 *
 * A kért végpontok pontos szerződése: docs/kvl-api-szerzodes.md
 */

export interface KvlPartner {
  partnerCode: string;
  name: string;
  birthDate: string; // ISO YYYY-MM-DD
  email: string | null;
  mobile: string | null;
  taj: string | null;
  zip: string | null;
  city: string | null;
  address: string | null;
}

export type KvlSearchResult =
  | { matchType: 'single'; partner: KvlPartner }
  | { matchType: 'multiple'; count: number }
  | { matchType: 'none' };

export interface KvlPartnerUpsert {
  name: string;
  birthDate: string;
  taj?: string;
  email?: string;
  mobile?: string;
  zip: string;
  city: string;
  address: string;
  consent: {
    marketing: Record<string, boolean>;
    acceptedAt: string;
    ip: string;
    policyVersion: string;
  };
}

export interface KvlTimelineEvent {
  type: string;
  text: string;
  occurredAt: string;
}

/**
 * A KVL-ből lekérdezett, idővonalra fésülendő esemény (pénzügy, raktár,
 * logisztika). A `type` a @somnoshop/shared eseménytípusai közül való
 * (pl. 'INVOICE_ISSUED', 'STOCK_MOVEMENT', 'PACKAGE_DELIVERED').
 */
export interface KvlSourcedEvent {
  type: string;
  text: string;
  occurredAt: string;
  detail?: Record<string, unknown>;
}

/**
 * A KVL-adapter interfésze. Injekciós tokenként a KVL_PORT-ot használjuk.
 */
export interface KvlPort {
  /** Régi ügyfél előhívása születési dátum vagy partnerkód alapján (I/A 3. pont). */
  searchPartner(query: {
    birthDate?: string;
    partnerCode?: string;
  }): Promise<KvlSearchResult>;

  /** Meglévő partner adatainak frissítése (hiánypótlás). Mezőt SOHA nem töröl. */
  updatePartner(
    partnerCode: string,
    data: Partial<KvlPartnerUpsert>,
  ): Promise<KvlPartner>;

  /** Új partner létrehozása. Visszaadja a kiosztott partnerkódot. */
  createPartner(data: KvlPartnerUpsert): Promise<KvlPartner>;

  /** Esemény rögzítése a partner Idővonalán (Timeline / History, I/D). */
  appendTimeline(
    partnerCode: string,
    event: KvlTimelineEvent,
  ): Promise<void>;

  /**
   * A partnerhez tartozó KVL-eredetű események lekérdezése az idővonalhoz
   * (számlák a termék/modellnévvel, raktárközi mozgások, csomagstátuszok).
   * Az I/D nézet ezt fésüli össze a belső (append-only) eseményekkel.
   */
  fetchTimelineEvents(partnerCode: string): Promise<KvlSourcedEvent[]>;
}

export const KVL_PORT = Symbol('KVL_PORT');
