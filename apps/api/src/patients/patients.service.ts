import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CURRENT_POLICY_VERSION,
  isZeroConsent,
  type PatientForm,
} from '@somnoshop/shared';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { KVL_PORT, type KvlPort, type KvlSearchResult } from '../kvl/kvl.port';
import { TIMELINE_PORT, type TimelinePort } from '../timeline/timeline.port';

export interface SubmissionContext {
  channel: 'online' | 'kiosk';
  ip: string;
  userAgent: string;
}

export interface SubmissionResult {
  submissionId: string;
  partnerCode: string;
  /** Igaz, ha a "Zéró Hozzájárulás" radar miatt parkoltatás indult. */
  parked: boolean;
  parkedUntil?: string;
}

/**
 * A páciens-adatlap feldolgozásának üzleti logikája (I. Modul / A).
 *
 * Egyetlen tranzakcióban:
 *  1. eltárolja a beküldést (form_submissions),
 *  2. módosíthatatlan hozzájárulási bejegyzést készít (consents),
 *  3. átvezeti az adatot a KVL-be (adapter),
 *  4. "Zéró Hozzájárulás" esetén parkoltatást és pulti feladatot indít,
 *  5. mindent naplóz az audit-logban.
 */
@Injectable()
export class PatientsService {
  private readonly logger = new Logger(PatientsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    @Inject(KVL_PORT) private readonly kvl: KvlPort,
    @Inject(TIMELINE_PORT) private readonly timeline: TimelinePort,
  ) {}

  /** Régi ügyfél előhívása születési dátum vagy partnerkód alapján (I/A 3.). */
  async searchPartner(query: {
    birthDate?: string;
    partnerCode?: string;
  }): Promise<KvlSearchResult> {
    const result = await this.kvl.searchPartner(query);
    await this.audit.record({
      actor: 'portal',
      action: 'READ',
      entityType: 'partner',
      entityId: query.partnerCode ?? query.birthDate,
      detail: { matchType: result.matchType },
    });
    return result;
  }

  async submitForm(
    form: PatientForm,
    ctx: SubmissionContext,
  ): Promise<SubmissionResult> {
    const acceptedAt = new Date().toISOString();

    // 1. Beküldés eltárolása.
    const submissionRes = await this.db.query<{ id: string }>(
      `INSERT INTO form_submissions
         (partner_code, name, birth_date, taj, email, mobile, zip, city, address, marketing, channel)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
      [
        form.partnerCode ?? null,
        form.name,
        form.birthDate,
        form.taj ?? null,
        form.email ?? null,
        form.mobile ?? null,
        form.zip,
        form.city,
        form.address,
        JSON.stringify(form.marketing),
        ctx.channel,
      ],
    );
    const submissionId = submissionRes.rows[0].id;

    // 2. Módosíthatatlan hozzájárulási bejegyzés (a digitális "aláírás").
    await this.db.query(
      `INSERT INTO consents
         (submission_id, partner_code, marketing, accepted_at, ip, user_agent, policy_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        submissionId,
        form.partnerCode ?? null,
        JSON.stringify(form.marketing),
        acceptedAt,
        ctx.ip,
        ctx.userAgent,
        CURRENT_POLICY_VERSION,
      ],
    );

    // 3. Átvezetés a KVL-be (frissítés vagy létrehozás).
    const consentPayload = {
      marketing: form.marketing as unknown as Record<string, boolean>,
      acceptedAt,
      ip: ctx.ip,
      policyVersion: CURRENT_POLICY_VERSION,
    };

    let partnerCode: string;
    if (form.partnerCode) {
      const updated = await this.kvl.updatePartner(form.partnerCode, {
        name: form.name,
        birthDate: form.birthDate,
        taj: form.taj,
        email: form.email,
        mobile: form.mobile,
        zip: form.zip,
        city: form.city,
        address: form.address,
        consent: consentPayload,
      });
      partnerCode = updated.partnerCode;
      await this.audit.record({
        actor: 'kvl-adapter',
        action: 'UPDATE',
        entityType: 'partner',
        entityId: partnerCode,
      });
    } else {
      const created = await this.kvl.createPartner({
        name: form.name,
        birthDate: form.birthDate,
        taj: form.taj,
        email: form.email,
        mobile: form.mobile,
        zip: form.zip,
        city: form.city,
        address: form.address,
        consent: consentPayload,
      });
      partnerCode = created.partnerCode;
      await this.audit.record({
        actor: 'kvl-adapter',
        action: 'CREATE',
        entityType: 'partner',
        entityId: partnerCode,
      });
    }

    // A submission most már ismeri a partnerkódot — visszaírjuk.
    await this.db.query(
      `UPDATE form_submissions SET partner_code = $1 WHERE id = $2`,
      [partnerCode, submissionId],
    );

    // 4. "Zéró Hozzájárulás" radar (I/A checklist 8. pont).
    let parked = false;
    let parkedUntil: string | undefined;
    if (isZeroConsent(form.marketing)) {
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1); // 1 hónapos időzítő
      parkedUntil = expiresAt.toISOString();

      await this.db.query(
        `INSERT INTO parked_documents (submission_id, partner_code, reason, expires_at)
         VALUES ($1, $2, 'zero_consent', $3)`,
        [submissionId, partnerCode, parkedUntil],
      );
      parked = true;

      await this.audit.record({
        actor: 'system',
        action: 'CREATE',
        entityType: 'parked_document',
        entityId: submissionId,
        detail: { reason: 'zero_consent', expiresAt: parkedUntil },
      });

      this.logger.log(
        `Számla-parkoltatás indult (${partnerCode}) — pulti tisztázó hívás szükséges.`,
      );
    }

    // 5. Idővonal-események (I/D): a rögzített hozzájárulás mindig, a
    //    parkoltatás pedig, ha bekapcsolt.
    await this.timeline.append({
      partnerCode,
      type: 'GDPR_CONSENT_RECORDED',
      text: `Adatlap és GDPR-nyilatkozat rögzítve (${ctx.channel === 'kiosk' ? 'pulti tablet' : 'online'})`,
      occurredAt: acceptedAt,
      detail: { channel: ctx.channel, policyVersion: CURRENT_POLICY_VERSION },
    });
    if (parked && parkedUntil) {
      await this.timeline.append({
        partnerCode,
        type: 'GDPR_PARKOLTATAS_LEZARVA',
        text: 'Számla-parkoltatás indult (nincs postai/e-mailes hozzájárulás) — pulti egyeztetés szükséges',
        occurredAt: acceptedAt,
        detail: { reason: 'zero_consent', expiresAt: parkedUntil },
      });
    }

    // 6. Beküldés naplózása.
    await this.audit.record({
      actor: `portal:${ctx.channel}`,
      action: 'CREATE',
      entityType: 'form_submission',
      entityId: submissionId,
      detail: { partnerCode, channel: ctx.channel, parked },
    });

    return { submissionId, partnerCode, parked, parkedUntil };
  }
}
