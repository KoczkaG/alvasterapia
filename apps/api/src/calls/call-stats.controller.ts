import { Controller, Get, Query } from '@nestjs/common';
import { CallStatsService } from './call-stats.service';

/**
 * Vezetői statisztikai dashboard végpont (I/E 4. pont). A hívásvégi jegyzetekből
 * összesített kimutatás: témák megoszlása, küldő laborok rangsora, panaszok.
 */
@Controller('admin/call-stats')
export class CallStatsController {
  constructor(private readonly stats: CallStatsService) {}

  /**
   * GET /admin/call-stats?from=ISO&to=ISO
   * Ha nincs megadva tartomány, az összes jegyzetre összesít.
   */
  @Get()
  summary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.stats.summary(from, to);
  }
}
