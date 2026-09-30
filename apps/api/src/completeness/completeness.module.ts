import { Module } from '@nestjs/common';
import { CompletenessController } from './completeness.controller';
import { CompletenessService } from './completeness.service';
import { SelfServiceController } from './self-service.controller';

/**
 * Automata „ADATLAP HIÁNYOS" riasztási protokoll modul (I/F). A KVL-, értesítés-
 * és Timeline-portokat globális modulokból kapja.
 */
@Module({
  controllers: [CompletenessController, SelfServiceController],
  providers: [CompletenessService],
  exports: [CompletenessService],
})
export class CompletenessModule {}
