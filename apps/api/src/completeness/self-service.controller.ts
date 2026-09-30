import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  selfServiceUpdateSchema,
  type SelfServiceUpdate,
} from '@somnoshop/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CompletenessService } from './completeness.service';

/**
 * Betegoldali, PUBLIKUS önkiszolgáló végpontok (I/F "B" opció). A tokenes
 * linkről (SMS/e-mail) érkező beteg ezeken keresztül pótolja az adatait.
 */
@Controller('self-service')
export class SelfServiceController {
  constructor(private readonly svc: CompletenessService) {}

  /**
   * GET /self-service/:token — a felület betöltése: mely mezőket kell megadni.
   * (Nem ad vissza személyes adatot, csak a hiányzó mezők listáját.)
   */
  @Get(':token')
  resolve(@Param('token') token: string) {
    return this.svc.resolveToken(token);
  }

  /** POST /self-service/:token — a beteg beküldi a hiányzó adatokat. */
  @Post(':token')
  submit(
    @Param('token') token: string,
    @Body(new ZodValidationPipe(selfServiceUpdateSchema)) data: SelfServiceUpdate,
  ) {
    return this.svc.submitSelfService(token, data);
  }
}
