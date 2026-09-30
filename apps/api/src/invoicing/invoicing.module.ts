import { Module } from '@nestjs/common';
import { HealthFundService } from './health-fund.service';
import { InvoiceMockAdapter } from './invoice.mock';
import { INVOICE_PORT } from './invoice.port';
import { InvoicingController } from './invoicing.controller';
import { InvoicingService } from './invoicing.service';

/**
 * Számlázási védőháló modul (II/D + II/B EP-adatkapu). Az INVOICE_PORT-hoz
 * jelenleg a mock adaptert kötjük (terminál + NAV-számla szimuláció); a valódi
 * terminál- és e-számla integráció ennek cseréjével illeszthető be.
 */
@Module({
  controllers: [InvoicingController],
  providers: [
    InvoicingService,
    HealthFundService,
    { provide: INVOICE_PORT, useClass: InvoiceMockAdapter },
  ],
  exports: [InvoicingService, INVOICE_PORT],
})
export class InvoicingModule {}
