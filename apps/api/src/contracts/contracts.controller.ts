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
  contractItemSchema,
  createContractSchema,
  gdprConsentSchema,
  type ContractItem,
  type CreateContract,
  type GdprConsent,
} from '@somnoshop/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ContractsService } from './contracts.service';

const scanSchema = z.object({ documentRef: z.string().min(1) });
type ScanBody = z.infer<typeof scanSchema>;

const cartSchema = z.object({ items: z.array(contractItemSchema).min(1) });
type CartBody = z.infer<typeof cartSchema>;

const confirmSchema = z.object({
  challengeId: z.string().min(1),
  code: z.string().min(1),
});
type ConfirmBody = z.infer<typeof confirmSchema>;

/**
 * Próbakezelési Szerződés-modul végpontjai (III. Modul / A). A kezelő azonosítója
 * az `X-Operator` fejlécből (placeholder; később Auth).
 */
@Controller('contracts')
export class ContractsController {
  constructor(private readonly svc: ContractsService) {}

  private operator(header?: string): string {
    return header?.trim() || 'operator:unknown';
  }

  /** POST /contracts/scan — ambuláns lap OCR-kiolvasása (szerkeszthető előnézet). */
  @Post('scan')
  scan(@Body(new ZodValidationPipe(scanSchema)) body: ScanBody) {
    return this.svc.scanAmbulatorySheet(body.documentRef);
  }

  /** POST /contracts — új szerződéstervezet (draft) a beteg-adatokból. */
  @Post()
  create(
    @Body(new ZodValidationPipe(createContractSchema)) input: CreateContract,
    @Headers('x-operator') operator?: string,
  ) {
    return this.svc.create(input, this.operator(operator));
  }

  /** POST /contracts/:id/consent — GDPR-kapu (draft → gdpr_ok). */
  @Post(':id/consent')
  consent(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(gdprConsentSchema)) consent: GdprConsent,
    @Headers('x-operator') operator?: string,
  ) {
    return this.svc.recordConsent(id, consent, this.operator(operator));
  }

  /** POST /contracts/:id/cart — a kosár véglegesítése (gdpr_ok → cart). */
  @Post(':id/cart')
  cart(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cartSchema)) body: CartBody,
    @Headers('x-operator') operator?: string,
  ) {
    return this.svc.setCart(id, body.items as ContractItem[], this.operator(operator));
  }

  /** POST /contracts/:id/pay — fizetés a terminálon (cart → paid). */
  @Post(':id/pay')
  pay(@Param('id') id: string, @Headers('x-operator') operator?: string) {
    return this.svc.pay(id, this.operator(operator));
  }

  /** POST /contracts/:id/sign/sms — SMS-kódos aláírási kihívás indítása. */
  @Post(':id/sign/sms')
  requestSms(@Param('id') id: string) {
    return this.svc.requestSmsSignature(id);
  }

  /** POST /contracts/:id/sign/sms/confirm — az SMS-kód ellenőrzése (paid → signed). */
  @Post(':id/sign/sms/confirm')
  confirmSms(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(confirmSchema)) body: ConfirmBody,
    @Headers('x-operator') operator?: string,
  ) {
    return this.svc.confirmSmsSignature(
      id,
      body.challengeId,
      body.code,
      this.operator(operator),
    );
  }

  /** POST /contracts/:id/sign/paper — papíralapú aláírás rögzítése (paid → signed). */
  @Post(':id/sign/paper')
  signPaper(@Param('id') id: string, @Headers('x-operator') operator?: string) {
    return this.svc.signOnPaper(id, this.operator(operator));
  }

  /** POST /contracts/:id/close — lezárás: PDF + jótállás + Timeline (signed → closed). */
  @Post(':id/close')
  close(@Param('id') id: string, @Headers('x-operator') operator?: string) {
    return this.svc.close(id, this.operator(operator));
  }

  /** GET /contracts/:id — a szerződés aktuális állapota. */
  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }
}
