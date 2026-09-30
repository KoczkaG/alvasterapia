import { Global, Module } from '@nestjs/common';
import { KvlMockAdapter } from './kvl.mock';
import { KVL_PORT } from './kvl.port';

/**
 * A KVL-integráció modulja. Jelenleg a MOCK adaptert kötjük a KVL_PORT tokenhez.
 * Amint a valódi KVL API-végpontok elkészülnek, itt cseréljük le a providert a
 * HTTP-alapú adapterre — a hívó kódok (KvlPort interfész) változatlanok maradnak.
 */
@Global()
@Module({
  providers: [{ provide: KVL_PORT, useClass: KvlMockAdapter }],
  exports: [KVL_PORT],
})
export class KvlModule {}
