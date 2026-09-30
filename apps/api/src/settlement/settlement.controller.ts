import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { settlementInputSchema, type SettlementInput } from '@somnoshop/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SettlementService } from './settlement.service';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formátum: YYYY-MM-DD');

/** Kihordási idő szabály beállítása (admin). */
const setRuleSchema = z.object({
  productType: z.string().min(1),
  months: z.number().int().positive(),
});
type SetRuleBody = z.infer<typeof setRuleSchema>;

/** Kaució-elszámolás kérés: a partnerkód + a befizetések/levonások. */
const depositSettlementSchema = z.object({
  partnerCode: z.string().min(1),
  payments: settlementInputSchema.shape.payments,
  deductions: settlementInputSchema.shape.deductions,
});
type DepositSettlementBody = z.infer<typeof depositSettlementSchema>;

/** OEP-egyeztetés kérés: nap + a KVL-es darabszámok. */
const reconcileSchema = z.object({
  date: isoDate,
  kvlCounts: z.array(
    z.object({ productType: z.string().min(1), count: z.number().int().nonnegative() }),
  ),
});
type ReconcileBody = z.infer<typeof reconcileSchema>;

/**
 * Elszámolás és Statisztika végpontjai (II. Modul / E). A kezelő azonosítója az
 * `X-Operator` fejlécből (placeholder; később Auth).
 */
@Controller('settlement')
export class SettlementController {
  constructor(private readonly svc: SettlementService) {}

  private operator(header?: string): string {
    return header?.trim() || 'operator:unknown';
  }

  /** GET /settlement/wear-time-rules — a kihordási idő törzsadat (hónapban). */
  @Get('wear-time-rules')
  listRules() {
    return this.svc.listWearTimeRules();
  }

  /** POST /settlement/wear-time-rules — kihordási idő beállítása (admin). */
  @Post('wear-time-rules')
  setRule(
    @Body(new ZodValidationPipe(setRuleSchema)) body: SetRuleBody,
    @Headers('x-operator') operator?: string,
  ) {
    return this.svc.setWearTimeRule(
      body.productType,
      body.months,
      this.operator(operator),
    );
  }

  /**
   * GET /settlement/eligibility — jogosultsági dátum egy vásárláshoz.
   * ?purchaseDate=YYYY-MM-DD&productType=maszk[&today=YYYY-MM-DD]
   */
  @Get('eligibility')
  eligibility(
    @Query('purchaseDate') purchaseDate: string,
    @Query('productType') productType: string,
    @Query('today') today?: string,
  ) {
    const parsed = z
      .object({ purchaseDate: isoDate, productType: z.string().min(1), today: isoDate.optional() })
      .parse({ purchaseDate, productType, today });
    return this.svc.checkEligibility({
      purchaseDate: parsed.purchaseDate,
      productType: parsed.productType,
      today: parsed.today ?? new Date().toISOString().slice(0, 10),
    });
  }

  /**
   * POST /settlement/deposit — kaució-elszámolás készítése. Kiszámítja a
   * visszajárót/ráfizetést, elmenti, és e-mailben elküldi az átlátható matekot.
   */
  @Post('deposit')
  deposit(
    @Body(new ZodValidationPipe(depositSettlementSchema)) body: DepositSettlementBody,
    @Headers('x-operator') operator?: string,
  ) {
    const input: SettlementInput = {
      payments: body.payments,
      deductions: body.deductions,
    };
    return this.svc.createDepositSettlement(
      body.partnerCode,
      input,
      this.operator(operator),
    );
  }

  /**
   * POST /settlement/oep-reconcile — OEP Napi Egyeztető. Összeveti a KVL-es
   * darabszámokat a Mankó (EESZT) hivatalos darabszámaival az adott napra.
   */
  @Post('oep-reconcile')
  reconcile(
    @Body(new ZodValidationPipe(reconcileSchema)) body: ReconcileBody,
    @Headers('x-operator') operator?: string,
  ) {
    return this.svc.reconcileOepForDate(
      body.date,
      body.kvlCounts,
      this.operator(operator),
    );
  }
}
