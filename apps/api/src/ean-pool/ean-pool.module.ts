import { Global, Module } from '@nestjs/common';
import { EanPoolController } from './ean-pool.controller';
import { EanPoolService } from './ean-pool.service';

/**
 * EAN-kód Pool modul (II/C). Globális, mert a vényes értékesítés (számlázás)
 * a kiosztást (allocate) a szolgáltatáson keresztül fogja hívni.
 */
@Global()
@Module({
  controllers: [EanPoolController],
  providers: [EanPoolService],
  exports: [EanPoolService],
})
export class EanPoolModule {}
