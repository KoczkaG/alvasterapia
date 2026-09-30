import { Module } from '@nestjs/common';
import { CallStatsController } from './call-stats.controller';
import { CallStatsService } from './call-stats.service';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { VoipMockAdapter } from './voip.mock';
import { VOIP_PORT } from './voip.port';

/**
 * Kimenő hívások modul (I/C + I/E). A VOIP_PORT-hoz jelenleg a mock adaptert
 * kötjük; a valódi telefonközpont-integráció ennek cseréjével illeszthető be.
 * A hívásvégi jegyzetek statisztikáját a CallStatsService adja (I/E).
 */
@Module({
  controllers: [CallsController, CallStatsController],
  providers: [
    CallsService,
    CallStatsService,
    { provide: VOIP_PORT, useClass: VoipMockAdapter },
  ],
  exports: [CallsService],
})
export class CallsModule {}
