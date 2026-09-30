import { Module } from '@nestjs/common';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { VoipMockAdapter } from './voip.mock';
import { VOIP_PORT } from './voip.port';

/**
 * Kimenő hívások modul (I/C). A VOIP_PORT-hoz jelenleg a mock adaptert kötjük;
 * a valódi felhőalapú telefonközpont-integráció ennek cseréjével illeszthető be.
 */
@Module({
  controllers: [CallsController],
  providers: [
    CallsService,
    { provide: VOIP_PORT, useClass: VoipMockAdapter },
  ],
  exports: [CallsService],
})
export class CallsModule {}
