import { Injectable, Logger } from '@nestjs/common';
import type {
  InvoicePort,
  IssuedInvoice,
  TerminalResult,
} from './invoice.port';

/**
 * Mock számlázási adapter. A kártyás terminál viselkedését determinisztikusan
 * szimulálja: a dokumentum szerinti limit-hiba demózásához a 150 000 Ft feletti
 * összeget elutasítja (leggyakoribb limit-összeg). A NAV-számlát fiktív
 * sorszámmal állítja ki.
 */
@Injectable()
export class InvoiceMockAdapter implements InvoicePort {
  private readonly logger = new Logger(InvoiceMockAdapter.name);
  private seq = 0;

  /** A mock terminál e fölött "limit túllépést" jelez (demó). */
  static readonly MOCK_CARD_LIMIT = 150_000;

  async chargeCard(params: {
    amountGross: number;
    reference: string;
  }): Promise<TerminalResult> {
    if (params.amountGross > InvoiceMockAdapter.MOCK_CARD_LIMIT) {
      this.logger.debug(
        `[MOCK terminál] ELUTASÍTVA (limit): ${params.amountGross} Ft`,
      );
      return { approved: false, declineReason: 'limit' };
    }
    this.logger.debug(`[MOCK terminál] JÓVÁHAGYVA: ${params.amountGross} Ft`);
    return {
      approved: true,
      transactionId: `txn-${Date.now()}-${++this.seq}`,
    };
  }

  async issueInvoice(params: {
    partnerCode: string;
    amountGross: number;
    reference: string;
    payee?: { name: string; address: string; taxNumber?: string } | null;
  }): Promise<IssuedInvoice> {
    const invoiceNumber = `SZ-${new Date().getFullYear()}-${String(
      ++this.seq,
    ).padStart(6, '0')}`;
    this.logger.debug(
      `[MOCK NAV] számla kiállítva: ${invoiceNumber} (${params.amountGross} Ft)` +
        (params.payee ? ` — vevő: ${params.payee.name}` : ''),
    );
    return {
      invoiceNumber,
      pdfUri: `mock://invoices/${invoiceNumber}.pdf`,
    };
  }
}
