import { Global, Module } from '@nestjs/common';
import { TIMELINE_PORT } from './timeline.port';
import { TimelineService } from './timeline.service';

/**
 * Timeline modul. A TIMELINE_PORT tokenhez a jelenlegi minimál TimelineService-t
 * kötjük; az I/D majd kibővíti/kiváltja a teljes körű implementációval.
 */
@Global()
@Module({
  providers: [
    TimelineService,
    { provide: TIMELINE_PORT, useExisting: TimelineService },
  ],
  exports: [TIMELINE_PORT, TimelineService],
})
export class TimelineModule {}
