import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { eanPoolUploadSchema, type EanPoolUpload } from '@somnoshop/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { EanPoolService } from './ean-pool.service';

const allocateSchema = z.object({
  partnerCode: z.string().min(1),
  ref: z.string().optional(),
});
type AllocateBody = z.infer<typeof allocateSchema>;

/**
 * Virtuális EAN-kód Pool végpontjai (II/C). A kezelő azonosítója az
 * `X-Operator` fejlécből (placeholder; később Auth).
 */
@Controller('ean-pool')
export class EanPoolController {
  constructor(private readonly svc: EanPoolService) {}

  private operator(header?: string): string {
    return header?.trim() || 'operator:unknown';
  }

  /** GET /ean-pool/status — szabad/felhasznált kódok + kritikus-szint jelzés. */
  @Get('status')
  status() {
    return this.svc.status();
  }

  /**
   * POST /ean-pool/upload — digitális matrica-tömb feltöltése (tartomány VAGY
   * explicit lista). Idempotens: a már meglévő kódokat kihagyja.
   */
  @Post('upload')
  upload(
    @Body(new ZodValidationPipe(eanPoolUploadSchema)) body: EanPoolUpload,
    @Headers('x-operator') operator?: string,
  ) {
    return this.svc.upload(body, this.operator(operator));
  }

  /**
   * POST /ean-pool/allocate — a következő szabad kód atomikus kiosztása egy
   * vényes értékesítéshez. Üres pool esetén 409 (új tömb igénylése kell).
   */
  @Post('allocate')
  allocate(
    @Body(new ZodValidationPipe(allocateSchema)) body: AllocateBody,
    @Headers('x-operator') operator?: string,
  ) {
    return this.svc.allocate({
      partnerCode: body.partnerCode,
      ref: body.ref,
      actor: this.operator(operator),
    });
  }
}
