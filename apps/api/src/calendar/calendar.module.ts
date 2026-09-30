import { Module } from '@nestjs/common';
import { CalendarAdminController } from './calendar.admin.controller';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { MockSyncTarget } from './sync.mock';
import {
  GOOGLE_SYNC,
  IVR_SYNC,
  OPENING_SYNC_TARGETS,
  WEBSHOP_SYNC,
} from './sync.port';

/**
 * Nyitvatartási Naptár Modul (I/B). A szinkron-célokat (IVR, webshop, Google)
 * jelenleg mock adapterek adják; amint a valódi integrációk elkészülnek, itt
 * cseréljük le a providereket — a CalendarService kódja változatlan marad.
 */
@Module({
  controllers: [CalendarController, CalendarAdminController],
  providers: [
    CalendarService,
    { provide: IVR_SYNC, useValue: new MockSyncTarget('IVR') },
    { provide: WEBSHOP_SYNC, useValue: new MockSyncTarget('Webshop') },
    { provide: GOOGLE_SYNC, useValue: new MockSyncTarget('GoogleBusiness') },
    {
      provide: OPENING_SYNC_TARGETS,
      inject: [IVR_SYNC, WEBSHOP_SYNC, GOOGLE_SYNC],
      useFactory: (ivr, webshop, google) => [ivr, webshop, google],
    },
  ],
  exports: [CalendarService],
})
export class CalendarModule {}
