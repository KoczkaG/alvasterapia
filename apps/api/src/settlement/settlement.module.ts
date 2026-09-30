import { Module } from '@nestjs/common';
import { MankoMockAdapter } from './manko.mock';
import { MANKO_PORT } from './manko.port';
import { SettlementController } from './settlement.controller';
import { SettlementService } from './settlement.service';

/**
 * Elszámolás és Statisztika modul (II. Modul / E): kihordási idő, kaució-
 * elszámoló, OEP napi egyeztető. A MANKO_PORT-hoz jelenleg a mock adaptert
 * kötjük (EESZT hivatalos darabszámok szimulációja); a valódi EESZT-integráció
 * ennek cseréjével illeszthető be.
 */
@Module({
  controllers: [SettlementController],
  providers: [
    SettlementService,
    { provide: MANKO_PORT, useClass: MankoMockAdapter },
  ],
  exports: [SettlementService],
})
export class SettlementModule {}
