import { Module } from '@nestjs/common';
import { InvoicingModule } from '../invoicing/invoicing.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { ESignMockAdapter } from './esign.mock';
import { ESIGN_PORT } from './esign.port';
import { OcrMockAdapter } from './ocr.mock';
import { OCR_PORT } from './ocr.port';
import { PdfMockAdapter } from './pdf.mock';
import { PDF_PORT } from './pdf.port';

/**
 * Próbakezelési Szerződés-modul (III. Modul / A). Az OCR, e-aláírás és PDF
 * adaptereket jelenleg mockokhoz kötjük; a valódi integráció (OCR-motor,
 * eIDAS-szolgáltató, PDF-generátor) a provider cseréjével illeszthető be.
 * A terminál-fizetés az InvoicingModule INVOICE_PORT-ját használja újra.
 */
@Module({
  imports: [InvoicingModule],
  controllers: [ContractsController],
  providers: [
    ContractsService,
    { provide: OCR_PORT, useClass: OcrMockAdapter },
    { provide: ESIGN_PORT, useClass: ESignMockAdapter },
    { provide: PDF_PORT, useClass: PdfMockAdapter },
  ],
  exports: [ContractsService],
})
export class ContractsModule {}
