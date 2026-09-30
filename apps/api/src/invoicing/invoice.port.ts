/**
 * Számlázási adapter (Port) — kártyás terminál + NAV/e-számla kiállítás.
 *
 * A tényleges banki terminál-kommunikációt és a NAV-hoz jelentő e-számla
 * kiállítást (pl. Számlázz.hu API) külső rendszerek végzik. Amíg a valódi
 * integrációk nem élnek, egy mock adapter fut e mögött, így a számlázási
 * védőháló-logika (validáció, terminál-zár, éles-számla-gátló) önállóan
 * fejleszthető és tesztelhető.
 */

export interface TerminalResult {
  approved: boolean;
  /** Elutasítás oka (pl. 'limit', 'insufficient_funds'), ha nem sikerült. */
  declineReason?: string;
  /** A terminál tranzakció-azonosítója siker esetén. */
  transactionId?: string;
}

export interface IssuedInvoice {
  /** A NAV felé jelentett, hiteles számla sorszáma. */
  invoiceNumber: string;
  /** A hiteles PDF hivatkozása (digitális aláírással, időbélyeggel). */
  pdfUri: string;
}

export interface InvoicePort {
  /**
   * Bankkártyás fizetés indítása a terminálon a megadott összegre.
   * A védőháló ennek eredményétől teszi függővé a NAV-számla kiállítását.
   */
  chargeCard(params: {
    amountGross: number;
    reference: string;
  }): Promise<TerminalResult>;

  /**
   * Éles, NAV-sorszámos e-számla kiállítása (csak sikeres fizetés után hívjuk).
   */
  issueInvoice(params: {
    partnerCode: string;
    amountGross: number;
    reference: string;
  }): Promise<IssuedInvoice>;
}

export const INVOICE_PORT = Symbol('INVOICE_PORT');
