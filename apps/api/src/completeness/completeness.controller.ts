import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import {
  selfServiceUpdateSchema,
  type SelfServiceUpdate,
} from '@somnoshop/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CompletenessService } from './completeness.service';

/**
 * Pulti / adminisztrátori végpontok az „ADATLAP HIÁNYOS" protokollhoz (I/F).
 * A kezelő azonosítója az `X-Operator` fejlécből (placeholder; később Auth).
 */
@Controller('completeness')
export class CompletenessController {
  constructor(private readonly svc: CompletenessService) {}

  private operator(header?: string): string {
    return header?.trim() || 'operator:unknown';
  }

  /** GET /completeness/:partnerCode — hiányzó kötelező mezők ellenőrzése. */
  @Get(':partnerCode')
  check(@Param('partnerCode') partnerCode: string) {
    return this.svc.check(partnerCode);
  }

  /**
   * POST /completeness/:partnerCode/update — „A" opció: helyszíni frissítés.
   * A GDPR-igazoló e-mailt és a webshopos terelést a szerver kezeli.
   */
  @Post(':partnerCode/update')
  update(
    @Param('partnerCode') partnerCode: string,
    @Body(new ZodValidationPipe(selfServiceUpdateSchema)) data: SelfServiceUpdate,
    @Headers('x-operator') operator?: string,
  ) {
    return this.svc.updateInPlace(partnerCode, data, this.operator(operator));
  }

  /**
   * POST /completeness/:partnerCode/link — „B" opció: önkiszolgáló tokenes link
   * generálása és hibrid kiküldése (SMS + e-mail).
   */
  @Post(':partnerCode/link')
  link(
    @Param('partnerCode') partnerCode: string,
    @Headers('x-operator') operator?: string,
  ) {
    return this.svc.issueLink(partnerCode, this.operator(operator));
  }
}
