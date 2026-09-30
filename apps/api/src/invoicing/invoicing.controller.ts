import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import {
  createDraftSchema,
  isDuplicateCode,
  validateCode,
  type BillingCodeKind,
  type CreateDraft,
} from '@somnoshop/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { InvoicingService } from './invoicing.service';

/** Egyetlen kód ellenőrzésének kérés-törzse (élő pulti validáció). */
const validateCodeSchema = z.object({
  kind: z.enum(['prescription', 'matrica', 'doctor']),
  code: z.string(),
  /** Opcionális: már bevitt kódok a Ctrl+V duplikáció szűréshez. */
  existing: z.array(z.string()).optional(),
});
type ValidateCodeBody = z.infer<typeof validateCodeSchema>;

/**
 * Pulti Védőháló és Számlázás végpontjai (II/D). A kezelő azonosítója az
 * `X-Operator` fejlécből (placeholder; később Auth).
 */
@Controller('invoicing')
export class InvoicingController {
  constructor(private readonly svc: InvoicingService) {}

  private operator(header?: string): string {
    return header?.trim() || 'operator:unknown';
  }

  /**
   * POST /invoicing/validate-code — élő kód-ellenőrzés (Elírás-Gátló) a pulton.
   * Ellenőrzi a prefixet ÉS a Ctrl+V duplikációt egy lépésben.
   */
  @Post('validate-code')
  validate(
    @Body(new ZodValidationPipe(validateCodeSchema)) body: ValidateCodeBody,
  ) {
    const result = validateCode(body.kind as BillingCodeKind, body.code);
    if (result.valid && body.existing && isDuplicateCode(body.existing, body.code)) {
      return {
        valid: false,
        message: 'Ez a kód már szerepel (duplikáció).',
        duplicate: true,
      };
    }
    return result;
  }

  /**
   * POST /invoicing/drafts — számlatervezet létrehozása. A kétirányú zárási
   * szűrő itt fut le; hibás fizetési mód/postaköltség párosítás → 400.
   */
  @Post('drafts')
  createDraft(
    @Body(new ZodValidationPipe(createDraftSchema)) input: CreateDraft,
    @Headers('x-operator') operator?: string,
  ) {
    return this.svc.createDraft(input, this.operator(operator));
  }

  /**
   * POST /invoicing/drafts/:id/finalize — véglegesítés. Bankkártyánál a terminál
   * dönt; elutasításnál a tervezet nyitva marad (nincs NAV-számla).
   */
  @Post('drafts/:id/finalize')
  finalize(@Param('id') id: string, @Headers('x-operator') operator?: string) {
    return this.svc.finalize(id, this.operator(operator));
  }

  /** GET /invoicing/drafts/:id — a tervezet/számla aktuális állapota. */
  @Get('drafts/:id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }
}
