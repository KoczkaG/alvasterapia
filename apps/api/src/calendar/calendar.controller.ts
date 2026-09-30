import { Controller, Get } from '@nestjs/common';
import { CalendarService } from './calendar.service';

/**
 * Publikus nyitvatartási végpontok. Ezeket hívja a telefonos IVR belépési
 * zsilipje és a megújuló webshop "Kapcsolat" oldala.
 */
@Controller('opening')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  /**
   * GET /opening/status
   * "Nyitva van-e most?" — a válasz tartalmazza az aznapi nyitvatartást és a
   * következő nyitás időpontját is (a tájékoztatáshoz).
   */
  @Get('status')
  status() {
    return this.calendar.getStatus();
  }

  /**
   * GET /opening/calendar
   * A teljes naptár (heti alap + felülírások) — a webshop és az IVR ebből
   * tudja kiírni a nyitvatartási rendet.
   */
  @Get('calendar')
  getFullCalendar() {
    return this.calendar.getCalendar();
  }
}
