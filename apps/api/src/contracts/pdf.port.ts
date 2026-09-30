/**
 * Dokumentum-generáló adapter (Port) — Szerződés és Jótállási Jegy PDF
 * (III. Modul / A, 4. lépés).
 *
 * A dokumentum kritikus elvárása: Word-sablonok használata TILOS; a KVL a
 * saját adatbázisából, emberi beavatkozás nélkül generálja a hivatalos PDF
 * szerződést és a digitális jótállási jegyet (a garanciaévek ráégetve, tollal
 * való kitöltés nélkül). A valódi PDF-motort külső könyvtár adja; amíg az nem
 * él, egy mock adapter egy dokumentum-hivatkozást (URI) ad vissza.
 */

export interface GeneratedDocument {
  /** A generált dokumentum hivatkozása (a Timeline/tárhely felé). */
  uri: string;
}

export interface PdfPort {
  /** A hivatalos próbakezelési szerződés PDF generálása. */
  generateContract(params: {
    contractId: string;
    partnerCode: string;
    patientName: string;
  }): Promise<GeneratedDocument>;

  /**
   * Digitális jótállási jegy generálása. A garanciaévek (lejárati dátum) fixen
   * ráégnek a PDF-re a gyári szám (SN) alapján.
   */
  generateWarranty(params: {
    contractId: string;
    serialNumber: string;
    productType: string;
    warrantyExpiry: string;
  }): Promise<GeneratedDocument>;
}

export const PDF_PORT = Symbol('PDF_PORT');
