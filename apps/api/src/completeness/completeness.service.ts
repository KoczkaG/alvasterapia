import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  checkCompleteness,
  MARKETING_CLOSING_MESSAGE,
  REQUIRED_FIELD_LABELS,
  SELF_SERVICE_TOKEN_TTL_HOURS,
  type CompletenessResult,
  type RequiredContactField,
  type SelfServiceUpdate,
} from '@somnoshop/shared';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { KVL_PORT, type KvlPort } from '../kvl/kvl.port';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../notifications/notification.port';
import { TIMELINE_PORT, type TimelinePort } from '../timeline/timeline.port';

export interface CheckResponse extends CompletenessResult {
  partnerCode: string;
}

const WEBSHOP_URL = process.env.WEBSHOP_URL ?? 'https://www.apnoeterapia.hu';
const SELF_SERVICE_BASE =
  process.env.SELF_SERVICE_BASE ?? 'https://portal.somnoshop.hu/adatpotlas';

/**
 * Az „ADATLAP HIÁNYOS" protokoll üzleti logikája (I/F).
 *
 * - check: adatlap-megnyitáskor jelzi a hiányzó kötelező kontaktmezőket,
 * - updateInPlace ("A"): a pultos helyben rögzíti a hiányt → KVL-frissítés +
 *   automata GDPR-igazoló e-mail (webshopos tereléssel),
 * - issueLink ("B"): egyszer használatos, 72h-s tokenes linket generál és
 *   hibrid módon (SMS + e-mail) kiküldi a betegnek,
 * - resolveToken / submitSelfService: a beteg otthon kitölti a hiányt.
 */
@Injectable()
export class CompletenessService {
  private readonly logger = new Logger(CompletenessService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    @Inject(KVL_PORT) private readonly kvl: KvlPort,
    @Inject(NOTIFICATION_PORT) private readonly notify: NotificationPort,
    @Inject(TIMELINE_PORT) private readonly timeline: TimelinePort,
  ) {}

  /** Adatlap-megnyitáskori ellenőrzés (I/F 1. pont). */
  async check(partnerCode: string): Promise<CheckResponse> {
    const partner = await this.loadPartner(partnerCode);
    const result = checkCompleteness({
      email: partner.email,
      mobile: partner.mobile,
      taj: partner.taj,
    });
    await this.audit.record({
      actor: 'system',
      action: 'READ',
      entityType: 'completeness_check',
      entityId: partnerCode,
      detail: { missing: result.missing },
    });
    return { partnerCode, ...result };
  }

  /**
   * „A" opció: a pultos helyben rögzíti a hiányzó adatot. KVL-frissítés (mezőt
   * nem töröl), automata GDPR-igazoló e-mail a webshopos tereléssel, Timeline.
   */
  async updateInPlace(
    partnerCode: string,
    data: SelfServiceUpdate,
    operator: string,
  ): Promise<CheckResponse> {
    await this.loadPartner(partnerCode); // létezés-ellenőrzés
    const updated = await this.kvl.updatePartner(partnerCode, {
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.mobile !== undefined ? { mobile: data.mobile } : {}),
      ...(data.taj !== undefined ? { taj: data.taj } : {}),
    });

    await this.audit.record({
      actor: operator,
      action: 'UPDATE',
      entityType: 'partner',
      entityId: partnerCode,
      detail: { fields: Object.keys(data) },
    });

    // Automata GDPR adatfrissítési igazolás + webshopos terelés.
    if (updated.email) {
      await this.notify.sendEmail({
        to: updated.email,
        subject: 'Adatfrissítési igazolás — SOMNO SHOP',
        body:
          'Tájékoztatjuk, hogy elérhetőségi adatait munkatársunk kérésére, az Ön ' +
          'szóbeli jóváhagyásával frissítettük. Az adatmódosítás jogszerűen, ' +
          'naplózva történt.\n\n' +
          `${MARKETING_CLOSING_MESSAGE}\nNézzen szét nálunk: ${WEBSHOP_URL}`,
      });
    }

    await this.timeline.append({
      partnerCode,
      type: 'DATA_UPDATED',
      text: `Hiányzó kontaktadat pótolva a pultnál (${Object.keys(data).join(', ')})`,
      occurredAt: new Date().toISOString(),
      detail: { via: 'counter', fields: Object.keys(data) },
    });

    const result = checkCompleteness({
      email: updated.email,
      mobile: updated.mobile,
      taj: updated.taj,
    });
    return { partnerCode, ...result };
  }

  /**
   * „B" opció: egyszer használatos, 72h-s tokenes önkiszolgáló link generálása
   * és hibrid kiküldése (SMS + e-mail, amelyik elérhető).
   */
  async issueLink(
    partnerCode: string,
    operator: string,
  ): Promise<{ token: string; url: string; expiresAt: string }> {
    const partner = await this.loadPartner(partnerCode);
    const { missing } = checkCompleteness({
      email: partner.email,
      mobile: partner.mobile,
      taj: partner.taj,
    });

    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(
      Date.now() + SELF_SERVICE_TOKEN_TTL_HOURS * 3600 * 1000,
    ).toISOString();

    await this.db.query(
      `INSERT INTO self_service_tokens (token, partner_code, missing, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [token, partnerCode, JSON.stringify(missing), expiresAt],
    );

    const url = `${SELF_SERVICE_BASE}?token=${token}`;
    const smsBody =
      'Kérjük, pótolja hiányzó adatait 1 perc alatt a SOMNO SHOP oldalán: ' + url;

    // Hibrid kiküldés: amelyik csatorna elérhető. (Ha épp az hiányzik, a másik megy.)
    if (partner.mobile) {
      await this.notify.sendSms({ to: partner.mobile, body: smsBody });
    }
    if (partner.email) {
      await this.notify.sendEmail({
        to: partner.email,
        subject: 'Adatpótlás — SOMNO SHOP',
        body:
          'Kérjük, kattintson az alábbi linkre, és pótolja hiányzó adatait:\n' +
          url +
          `\n\nA link ${SELF_SERVICE_TOKEN_TTL_HOURS} óráig érvényes.`,
      });
    }

    await this.audit.record({
      actor: operator,
      action: 'CREATE',
      entityType: 'self_service_token',
      entityId: partnerCode,
      detail: { missing, expiresAt },
    });

    return { token, url, expiresAt };
  }

  /** A token feloldása a betegoldali felülethez (mit kérjünk be). */
  async resolveToken(token: string): Promise<{
    partnerCode: string;
    missing: RequiredContactField[];
    missingLabels: string[];
  }> {
    const row = await this.getValidToken(token);
    const missing = (row.missing as RequiredContactField[]) ?? [];
    return {
      partnerCode: row.partner_code,
      missing,
      missingLabels: missing.map((m) => REQUIRED_FIELD_LABELS[m]),
    };
  }

  /**
   * A beteg beküldi a hiányzó adatokat a tokenes felületen. A token egyszer
   * használatos: sikeres beküldés után érvénytelenné válik. Visszaadja a
   * webshopos záró üzenetet (I/F 4. pont).
   */
  async submitSelfService(
    token: string,
    data: SelfServiceUpdate,
  ): Promise<{ ok: true; marketingMessage: string; webshopUrl: string }> {
    const row = await this.getValidToken(token);
    const partnerCode = row.partner_code;

    const updated = await this.kvl.updatePartner(partnerCode, {
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.mobile !== undefined ? { mobile: data.mobile } : {}),
      ...(data.taj !== undefined ? { taj: data.taj } : {}),
    });

    // A token felhasználása (egyszer használatos).
    await this.db.query(
      `UPDATE self_service_tokens SET used_at = now() WHERE token = $1`,
      [token],
    );

    await this.audit.record({
      actor: 'patient:self-service',
      action: 'UPDATE',
      entityType: 'partner',
      entityId: partnerCode,
      detail: { via: 'self_service', fields: Object.keys(data) },
    });

    await this.timeline.append({
      partnerCode,
      type: 'DATA_UPDATED',
      text: `Hiányzó kontaktadat pótolva önkiszolgáló linken (${Object.keys(data).join(', ')})`,
      occurredAt: new Date().toISOString(),
      detail: { via: 'self_service', fields: Object.keys(data) },
    });

    // Ha maradt e-mail, elküldhető egy visszaigazolás is (opcionális, itt kihagyjuk).
    void updated;

    return {
      ok: true,
      marketingMessage: MARKETING_CLOSING_MESSAGE,
      webshopUrl: WEBSHOP_URL,
    };
  }

  // --- segédek ---

  private async loadPartner(partnerCode: string) {
    const res = await this.kvl.searchPartner({ partnerCode });
    if (res.matchType !== 'single') {
      throw new NotFoundException({
        error: { code: 'PARTNER_NOT_FOUND', message: 'Ismeretlen partnerkód.' },
      });
    }
    return res.partner;
  }

  private async getValidToken(token: string): Promise<{
    partner_code: string;
    missing: unknown;
  }> {
    const res = await this.db.query<{
      partner_code: string;
      missing: unknown;
      expires_at: Date;
      used_at: Date | null;
    }>(
      `SELECT partner_code, missing, expires_at, used_at
         FROM self_service_tokens WHERE token = $1`,
      [token],
    );
    const row = res.rows[0];
    if (!row) {
      throw new NotFoundException({
        error: { code: 'TOKEN_NOT_FOUND', message: 'Érvénytelen vagy ismeretlen link.' },
      });
    }
    if (row.used_at) {
      throw new BadRequestException({
        error: { code: 'TOKEN_USED', message: 'Ezt a linket már felhasználták.' },
      });
    }
    const expires =
      row.expires_at instanceof Date
        ? row.expires_at
        : new Date(row.expires_at);
    if (expires.getTime() < Date.now()) {
      throw new BadRequestException({
        error: { code: 'TOKEN_EXPIRED', message: 'A link lejárt. Kérjen újat a pultnál.' },
      });
    }
    return { partner_code: row.partner_code, missing: row.missing };
  }
}
