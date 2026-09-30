import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DEFAULT_WEAR_TIME_RULES,
  computeSettlement,
  eligibilityDate,
  isEligibleForReplacement,
  reconcileOep,
  type KvlProductCount,
  type ReconciliationResult,
  type SettlementInput,
  type SettlementResult,
  type WearTimeRule,
} from '@somnoshop/shared';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../notifications/notification.port';
import { KVL_PORT, type KvlPort } from '../kvl/kvl.port';
import { MANKO_PORT, type MankoPort } from './manko.port';

export interface DepositSettlementRecord {
  id: string;
  partnerCode: string;
  result: SettlementResult;
  notified: boolean;
}

/**
 * Elszámolás és Statisztika logika (II. Modul / E).
 *
 * Három funkció:
 *  1. Kihordási idő — konfigurálható termékenkénti szabályok; jogosultság-dátum
 *     számítása (mikortól jár új, TB-támogatott eszköz).
 *  2. Kaució-Elszámoló — a próbaidőszak-végi visszajáró átlátható levezetése,
 *     e-mailben elküldve a betegnek (a "miért csak ennyit kaptam vissza"
 *     telefonos reklamációk megszüntetésére).
 *  3. OEP Napi Egyeztető — a KVL-es és a Mankó-s (EESZT) darabszámok összevetése,
 *     hogy az eltérés még aznap javítható legyen.
 */
@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);
  private seeded = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    @Inject(KVL_PORT) private readonly kvl: KvlPort,
    @Inject(MANKO_PORT) private readonly manko: MankoPort,
  ) {}

  // -------------------------------------------------------------------------
  // 1. Kihordási idő (konfigurálható törzsadat)
  // -------------------------------------------------------------------------

  /** Az alapértelmezett szabályok beszúrása, ha a tábla még üres (idempotens). */
  private async ensureSeeded(): Promise<void> {
    if (this.seeded) return;
    const existing = await this.db.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM wear_time_rules`,
    );
    if (existing.rows[0].c === 0) {
      for (const rule of DEFAULT_WEAR_TIME_RULES) {
        await this.db.query(
          `INSERT INTO wear_time_rules (product_type, months) VALUES ($1, $2)`,
          [rule.productType, rule.months],
        );
      }
      this.logger.log('Kihordási idő alapszabályok beszúrva.');
    }
    this.seeded = true;
  }

  /** A kihordási idő szabályok lekérdezése (törzsadat). */
  async listWearTimeRules(): Promise<WearTimeRule[]> {
    await this.ensureSeeded();
    const res = await this.db.query<{ product_type: string; months: number }>(
      `SELECT product_type, months FROM wear_time_rules ORDER BY product_type`,
    );
    return res.rows.map((r) => ({
      productType: r.product_type,
      months: Number(r.months),
    }));
  }

  /** Egy terméktípus kihordási idejének beállítása/felülírása (admin). */
  async setWearTimeRule(
    productType: string,
    months: number,
    operator: string,
  ): Promise<WearTimeRule> {
    await this.ensureSeeded();
    // pg-mem: az ON CONFLICT rowCount megbízhatatlan → explicit létezés-ellenőrzés.
    const existing = await this.db.query<{ product_type: string }>(
      `SELECT product_type FROM wear_time_rules WHERE product_type = $1`,
      [productType],
    );
    if (existing.rows[0]) {
      await this.db.query(
        `UPDATE wear_time_rules
            SET months = $2, updated_at = now(), updated_by = $3
          WHERE product_type = $1`,
        [productType, months, operator],
      );
    } else {
      await this.db.query(
        `INSERT INTO wear_time_rules (product_type, months, updated_by)
         VALUES ($1, $2, $3)`,
        [productType, months, operator],
      );
    }
    await this.audit.record({
      actor: operator,
      action: 'UPDATE',
      entityType: 'wear_time_rule',
      entityId: productType,
      detail: { months },
    });
    return { productType, months };
  }

  /**
   * Jogosultsági dátum egy vásárláshoz: mikortól jár új, TB-támogatott eszköz.
   * Egyben visszaadja, hogy a megadott (mai) naphoz képest jogosult-e már.
   */
  async checkEligibility(input: {
    purchaseDate: string;
    productType: string;
    today: string;
  }): Promise<{
    productType: string;
    purchaseDate: string;
    eligibleFrom: string | null;
    eligibleNow: boolean;
  }> {
    const rules = await this.listWearTimeRules();
    const eligibleFrom = eligibilityDate(
      input.purchaseDate,
      input.productType,
      rules,
    );
    const eligibleNow = isEligibleForReplacement(
      input.purchaseDate,
      input.productType,
      rules,
      input.today,
    );
    return {
      productType: input.productType,
      purchaseDate: input.purchaseDate,
      eligibleFrom,
      eligibleNow,
    };
  }

  // -------------------------------------------------------------------------
  // 2. Kaució-Elszámoló Adatlap
  // -------------------------------------------------------------------------

  /**
   * Kaució-elszámolás készítése: kiszámítja a visszajárót/ráfizetést, elmenti a
   * bizonylatot, és — ha a betegnek van e-mail címe — elküldi az átlátható
   * matek levezetését. A beteg KVL-profilját NEM módosítja.
   */
  async createDepositSettlement(
    partnerCode: string,
    input: SettlementInput,
    operator: string,
  ): Promise<DepositSettlementRecord> {
    const result = computeSettlement(input);

    const inserted = await this.db.query<{ id: string }>(
      `INSERT INTO deposit_settlements
         (partner_code, payments, deductions, total_paid, total_deductions,
          balance, refund_due, operator)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        partnerCode,
        JSON.stringify(input.payments),
        JSON.stringify(input.deductions),
        result.totalPaid,
        result.totalDeductions,
        result.balance,
        result.refundDue,
        operator,
      ],
    );
    const id = inserted.rows[0].id;

    // Átlátható értesítés a betegnek (ha van e-mail címe a KVL-ben).
    let notified = false;
    const search = await this.kvl.searchPartner({ partnerCode });
    if (search.matchType === 'single' && search.partner.email) {
      await this.notifications.sendEmail({
        to: search.partner.email,
        subject: 'SOMNO SHOP — Kaució-elszámolás',
        body: this.renderSettlementEmail(search.partner.name, input, result),
      });
      await this.db.query(
        `UPDATE deposit_settlements SET notified = true WHERE id = $1`,
        [id],
      );
      notified = true;
    }

    await this.audit.record({
      actor: operator,
      action: 'CREATE',
      entityType: 'deposit_settlement',
      entityId: id,
      detail: {
        partnerCode,
        balance: result.balance,
        refundDue: result.refundDue,
        notified,
      },
    });

    return { id, partnerCode, result, notified };
  }

  /** A "feketén-fehéren" bemutatott matek szöveges levezetése (e-mail törzs). */
  private renderSettlementEmail(
    name: string,
    input: SettlementInput,
    result: SettlementResult,
  ): string {
    const fmt = (n: number) => `${n.toLocaleString('hu-HU')} Ft`;
    const lines: string[] = [];
    lines.push(`Tisztelt ${name}!`);
    lines.push('');
    lines.push('A próbaidőszak végi kaució-elszámolása az alábbiak szerint alakult:');
    lines.push('');
    lines.push('Befizetések:');
    for (const p of input.payments) {
      lines.push(`  • ${p.paidOn} (${p.reference}): ${fmt(p.amount)}`);
    }
    lines.push(`  Összesen befizetve: ${fmt(result.totalPaid)}`);
    lines.push('');
    if (input.deductions.length > 0) {
      lines.push('Levonások:');
      for (const d of input.deductions) {
        lines.push(`  • ${d.label}: ${fmt(d.amount)}`);
      }
      lines.push(`  Levonások összesen: ${fmt(result.totalDeductions)}`);
      lines.push('');
    }
    if (result.refundDue) {
      lines.push(`Visszajáró összeg: ${fmt(result.balance)}`);
    } else {
      lines.push(`Fizetendő (ráfizetés): ${fmt(-result.balance)}`);
    }
    lines.push('');
    lines.push('Üdvözlettel: SOMNO SHOP');
    return lines.join('\n');
  }

  // -------------------------------------------------------------------------
  // 3. OEP Napi Egyeztető
  // -------------------------------------------------------------------------

  /**
   * A KVL-es (általunk kiállított) és a Mankó-s (EESZT hivatalos) darabszámok
   * összevetése egy adott napra. Elmenti a pillanatképet, és az eltéréseket
   * visszaadja, hogy még aznap javíthatók legyenek.
   *
   * A KVL-es darabszámokat a hívó adja meg (a KVL API-jából), a Mankó-s
   * darabszámokat a MankoPort-tól kérjük le.
   */
  async reconcileOepForDate(
    dateIso: string,
    kvlCounts: KvlProductCount[],
    operator: string,
  ): Promise<ReconciliationResult & { id: string; date: string }> {
    const mankoCounts = await this.manko.fetchOfficialCounts(dateIso);
    const result = reconcileOep(kvlCounts, mankoCounts);

    const inserted = await this.db.query<{ id: string }>(
      `INSERT INTO oep_reconciliations (for_date, rows, all_match, operator)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [dateIso, JSON.stringify(result.rows), result.allMatch, operator],
    );
    const id = inserted.rows[0].id;

    await this.audit.record({
      actor: operator,
      action: 'READ',
      entityType: 'oep_reconciliation',
      entityId: id,
      detail: { date: dateIso, allMatch: result.allMatch },
    });

    if (!result.allMatch) {
      this.logger.warn(
        `OEP-eltérés ${dateIso}-re: ${result.rows
          .filter((r) => !r.match)
          .map((r) => `${r.productType} (Δ${r.diff})`)
          .join(', ')}`,
      );
    }

    return { ...result, id, date: dateIso };
  }
}
