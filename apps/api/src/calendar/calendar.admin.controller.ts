import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
} from '@nestjs/common';
import {
  dateOverrideSchema,
  hungarianPublicHolidays,
  weeklyScheduleSchema,
  type DateOverride,
  type WeeklySchedule,
} from '@somnoshop/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CalendarService } from './calendar.service';

/**
 * A szaküzlet adminisztrátorainak felülete a nyitvatartási naptár
 * karbantartásához. Itt állítják be a heti alap-rendet, valamint az
 * ünnepnapokat / ledolgozós szombatokat / rövidített napokat.
 *
 * (Az admin-jogosultság ellenőrzését egy későbbi Auth modul adja majd hozzá;
 * jelenleg az actort egy fejlécből olvassuk placeholderként.)
 */
@Controller('admin/opening')
export class CalendarAdminController {
  constructor(private readonly calendar: CalendarService) {}

  /** PUT /admin/opening/weekly — heti alap-nyitvatartás beállítása. */
  @Put('weekly')
  setWeekly(
    @Body(new ZodValidationPipe(weeklyScheduleSchema)) schedule: WeeklySchedule,
  ) {
    return this.calendar.setWeekly(schedule, 'admin');
  }

  /** PUT /admin/opening/overrides — dátum-felülírás felvétele/módosítása. */
  @Put('overrides')
  upsertOverride(
    @Body(new ZodValidationPipe(dateOverrideSchema)) override: DateOverride,
  ) {
    return this.calendar.upsertOverride(override, 'admin');
  }

  /** DELETE /admin/opening/overrides/2026-06-08 — felülírás törlése. */
  @Delete('overrides/:date')
  deleteOverride(@Param('date') date: string) {
    return this.calendar.deleteOverride(date, 'admin');
  }

  /**
   * GET /admin/opening/holiday-suggestions/2026
   * Segédfunkció: a magyar hivatalos munkaszüneti napok javaslata az adott évre
   * ('closed' felülírásként). Az admin ezekből válogatva, egy kattintással
   * veheti fel őket — de a jóváhagyás/felülírás mindig az övé. (Az áthelyezett
   * munkanapok és ledolgozós szombatok NEM algoritmikusak, azokat kézzel kell
   * felvenni.)
   */
  @Get('holiday-suggestions/:year')
  holidaySuggestions(@Param('year') year: string) {
    const parsed = Number(year);
    if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_YEAR',
          message: 'Adjon meg egy érvényes évet (2000–2100).',
        },
      });
    }
    return hungarianPublicHolidays(parsed);
  }
}
