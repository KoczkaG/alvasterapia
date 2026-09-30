/**
 * OCR (karakterfelismerő) adapter (Port) — III. Modul / A.
 *
 * A pulton az ambuláns lapot asztali szkennerbe helyezik (vagy EESZT-ből
 * érkezik PDF-ként), és a KVL beépített OCR-motorja automatikusan kiolvassa a
 * beteg-adatokat, megszüntetve a háromszoros manuális gépelést.
 *
 * A tényleges OCR-motort külső szolgáltató/könyvtár adja. Amíg a valódi
 * integráció nem él, egy mock adapter szolgáltat strukturált demó-adatokat egy
 * feltöltés-azonosító alapján — így a szerződéskötési folyamat önállóan
 * fejleszthető és tesztelhető.
 */

export interface OcrPatientData {
  name: string;
  taj: string;
  zip: string;
  city: string;
  address: string;
  doctorName: string;
  doctorStamp: string;
  /** Terápiás nyomásérték [vízcm]. */
  pressure: number;
}

export interface OcrPort {
  /**
   * Egy beszkennelt/feltöltött ambuláns lap kiolvasása strukturált adattá.
   * @param documentRef a feltöltött dokumentum azonosítója (mockban demó-kulcs)
   */
  extractPatient(documentRef: string): Promise<OcrPatientData | null>;
}

export const OCR_PORT = Symbol('OCR_PORT');
