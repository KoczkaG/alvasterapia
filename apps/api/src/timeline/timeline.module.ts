import { Global, Module } from '@nestjs/common';
import { TimelineController } from './timeline.controller';
import { TIMELINE_PORT } from './timeline.port';
import { TimelineService } from './timeline.service';

/**
 * Timeline modul (I/D). A TIMELINE_PORT tokenhez a TimelineService-t kötjük;
 * a belső modulok (pl. kimenő hívások) ezen az interfészen keresztül írnak,
 * a lekérdező végpontok pedig a teljes, KVL-lel összefésült nézetet adják.
 */
@Global()
@Module({
  controllers: [TimelineController],
  providers: [
    TimelineService,
    { provide: TIMELINE_PORT, useExisting: TimelineService },
  ],
  exports: [TIMELINE_PORT, TimelineService],
})
export class TimelineModule {}
