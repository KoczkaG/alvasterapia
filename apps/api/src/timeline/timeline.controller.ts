import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { philipsRecallImportRowSchema } from '@somnoshop/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TimelineService } from './timeline.service';

const importBodySchema = z.object({
  rows: z.array(philipsRecallImportRowSchema).min(1),
});
type ImportBody = z.infer<typeof importBodySchema>;

/**
 * Ügyféltörténet Idővonal (Timeline) végpontjai (I/D).
 *
 * A kezelő azonosítója az `X-Operator` fejlécből (placeholder; később Auth).
 * Minden idővonal-lekérdezés audit-logba kerül (egészségügyi adat READ).
 */
@Controller('timeline')
export class TimelineController {
  constructor(private readonly timeline: TimelineService) {}

  private operator(header?: string): string {
    return header?.trim() || 'operator:unknown';
  }

  /**
   * GET /timeline/:partnerCode
   * A beteg teljes idővonala (belső + KVL események összefésülve, időrendben).
   * A válasz tartalmazza a Philips-riasztást is, ha a beteg érintett — így a
   * pulti felület egyetlen hívásból meg tudja jeleníteni a kötelező riasztást.
   */
  @Get(':partnerCode')
  async get(
    @Param('partnerCode') partnerCode: string,
    @Headers('x-operator') operator?: string,
  ) {
    const [items, philipsRecall] = await Promise.all([
      this.timeline.getForPartner(partnerCode, this.operator(operator)),
      this.timeline.getPhilipsRecall(partnerCode),
    ]);
    return { partnerCode, philipsRecall, items };
  }

  /**
   * POST /timeline/philips-recall/import
   * A Philips-csereprojekt Excel-adatainak egyszeri, teljes körű importja
   * (upsert). Body: { rows: [{ partnerCode, replacementModel, serialNumber, replacedOn? }] }
   */
  @Post('philips-recall/import')
  importPhilips(
    @Body(new ZodValidationPipe(importBodySchema)) body: ImportBody,
    @Headers('x-operator') operator?: string,
  ) {
    return this.timeline.importPhilipsRecall(body.rows, this.operator(operator));
  }
}
