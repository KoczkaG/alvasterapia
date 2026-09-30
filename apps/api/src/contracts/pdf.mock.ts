import { Injectable, Logger } from '@nestjs/common';
import type { GeneratedDocument, PdfPort } from './pdf.port';

/**
 * MOCK PDF-generáló adapter. Dokumentum-hivatkozásokat ad vissza, amíg a valódi
 * PDF-motor (sablon → hiteles PDF) el nem készül.
 */
@Injectable()
export class PdfMockAdapter implements PdfPort {
  private readonly logger = new Logger(PdfMockAdapter.name);

  async generateContract(params: {
    contractId: string;
    partnerCode: string;
    patientName: string;
  }): Promise<GeneratedDocument> {
    this.logger.debug(`[MOCK] Szerződés-PDF generálva: ${params.contractId}`);
    return { uri: `mock://contracts/${params.contractId}/szerzodes.pdf` };
  }

  async generateWarranty(params: {
    contractId: string;
    serialNumber: string;
    productType: string;
    warrantyExpiry: string;
  }): Promise<GeneratedDocument> {
    this.logger.debug(
      `[MOCK] Jótállási jegy generálva: ${params.serialNumber} (lejárat ${params.warrantyExpiry})`,
    );
    return {
      uri: `mock://contracts/${params.contractId}/jotallas-${params.serialNumber}.pdf`,
    };
  }
}
