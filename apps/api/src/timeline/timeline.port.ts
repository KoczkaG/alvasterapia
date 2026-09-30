/**
 * Központi Ügyféltörténet Idővonal (Timeline) — Port.
 *
 * Az I. Modul / D) fogja a teljes Timeline-t megvalósítani (pénzügyi, raktári,
 * kommunikációs események egységes idővonala). Amíg az elkészül, ez az interfész
 * a csatlakozási pont: a modulok (pl. I/C kimenő hívások) ezen keresztül
 * rögzítenek eseményeket. Jelenleg egy egyszerű DB-alapú implementáció áll
 * mögötte; az I/D majd kibővíti/kiváltja azt anélkül, hogy a hívók változnának.
 */

export interface TimelineEvent {
  partnerCode: string;
  /** Géppel olvasható típus, pl. 'OUTBOUND_CALL', 'GDPR_PARKOLTATAS_LEZARVA'. */
  type: string;
  /** Emberi olvasható összefoglaló. */
  text: string;
  /** Az esemény időpontja (ISO 8601). */
  occurredAt: string;
  /** Tetszőleges strukturált részletek (pl. hívásazonosító, felvétel-hivatkozás). */
  detail?: Record<string, unknown>;
}

export interface TimelinePort {
  append(event: TimelineEvent): Promise<void>;
}

export const TIMELINE_PORT = Symbol('TIMELINE_PORT');
