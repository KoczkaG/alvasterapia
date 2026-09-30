/**
 * VoIP-szolgáltató adapter (Port) a kimenő hívásokhoz.
 *
 * A tényleges hangkapcsolást és -rögzítést a külső felhőalapú telefonközpont
 * végzi. Amíg a valódi integráció nem él, egy mock adapter fut e mögött, így a
 * hívás-életciklus logikája (GDPR-kezelés, Audit Trail) önállóan fejleszthető.
 */

export interface VoipCallHandle {
  /** A VoIP-szolgáltató által adott hívásazonosító. */
  providerCallId: string;
}

export interface VoipPort {
  /** Kimenő hívás indítása. A rögzítés alapból elindul (hacsak nem tiltják). */
  dial(params: {
    to: string;
    /** Belső hivatkozás (a mi call rekordunk id-ja) korreláláshoz. */
    reference: string;
  }): Promise<VoipCallHandle>;

  /**
   * A folyamatban lévő felvétel azonnali leállítása ÉS az addigi sáv törlése
   * (a hívott fél tiltása esetén — dokumentum I/C 4. pont).
   */
  stopAndDeleteRecording(providerCallId: string): Promise<void>;

  /**
   * A hívás lezárásakor visszaadja a rögzített hangfájl hivatkozását
   * (ha volt engedélyezett felvétel), amit a Timeline-hoz linkelünk.
   * `null`, ha nem készült megőrzendő felvétel.
   */
  finalizeRecording(providerCallId: string): Promise<{ recordingUri: string } | null>;
}

export const VOIP_PORT = Symbol('VOIP_PORT');
