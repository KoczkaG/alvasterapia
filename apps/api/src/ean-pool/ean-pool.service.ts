import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  EAN_POOL_LOW_THRESHOLD,
  expandPoolUpload,
  type EanPoolStatus,
  type EanPoolUpload,
} from '@somnoshop/shared';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';

/**
 * Virtuális EAN-kód Pool (II/C).
 *
 * - upload: kódtömb feltöltése (tartomány VAGY lista) — idempotens (a már
 *   meglévő kódokat kihagyja).
 * - allocate: a KÖVETKEZŐ szabad kód ATOMIKUS kiosztása (versenymentes),
 *   egyetlen SQL-lel a legkisebb szabad kódra.
 * - status: szabad/felhasznált darabszám + kritikus-szint riasztás.
 */
@Injectable()
export class EanPoolService {
  private readonly logger = new Logger(EanPoolService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  /** Kódtömb feltöltése. Visszaadja a ténylegesen HOZZÁADOTT kódok számát. */
  async upload(
    upload: EanPoolUpload,
    actor: string,
  ): Promise<{ added: number; skipped: number }> {
    let codes: string[];
    try {
      codes = expandPoolUpload(upload);
    } catch (e) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_POOL_UPLOAD',
          message: e instanceof Error ? e.message : 'Érvénytelen feltöltés.',
        },
      });
    }

    let added = 0;
    for (const code of codes) {
      // Idempotens: csak akkor szúrjuk be, ha még nem létezik. (Explicit
      // létezés-ellenőrzés — hordozható, nem függ az ON CONFLICT rowCount
      // viselkedésétől.)
      const exists = await this.db.query(
        `SELECT 1 FROM ean_codes WHERE code = $1`,
        [code],
      );
      if ((exists.rowCount ?? 0) > 0) continue;
      await this.db.query(
        `INSERT INTO ean_codes (code, label) VALUES ($1, $2)`,
        [code, upload.label],
      );
      added++;
    }

    await this.audit.record({
      actor,
      action: 'CREATE',
      entityType: 'ean_pool_upload',
      detail: { label: upload.label, total: codes.length, added },
    });

    return { added, skipped: codes.length - added };
  }

  /**
   * A következő szabad kód atomikus kiosztása. Versenymentes: egyetlen UPDATE
   * jelöli felhasználtnak a legkisebb szabad kódot, és RETURNING adja vissza.
   */
  async allocate(params: {
    partnerCode: string;
    ref?: string;
    actor: string;
  }): Promise<{ code: string; status: EanPoolStatus }> {
    // Versenymentes kiosztás: kiválasztjuk a legkisebb szabad kódot, majd egy
    // FELTÉTELES UPDATE-tel (WHERE code = $exact AND used = false) foglaljuk le.
    // A guard + rowCount kezeli a párhuzamos igénylést: ha közben más lefoglalta,
    // az UPDATE 0 sort érint, és a következő szabad kódra lépünk (retry).
    // Ez konkrét kódértékre céloz (nem korrelált subquery), így hordozható.
    let code: string | null = null;
    for (let attempt = 0; attempt < 50 && code === null; attempt++) {
      const candidate = await this.db.query<{ code: string }>(
        `SELECT code FROM ean_codes WHERE used = false ORDER BY code LIMIT 1`,
      );
      const next = candidate.rows[0]?.code;
      if (!next) break; // nincs több szabad kód

      const claimed = await this.db.query(
        `UPDATE ean_codes
            SET used = true, assigned_to = $1, assigned_ref = $2, assigned_at = now()
          WHERE code = $3 AND used = false`,
        [params.partnerCode, params.ref ?? null, next],
      );
      if ((claimed.rowCount ?? 0) === 1) {
        code = next;
      }
      // különben: közben elvitték → új kör a következő szabad kódra
    }

    if (!code) {
      throw new ConflictException({
        error: {
          code: 'EAN_POOL_EMPTY',
          message: 'Nincs szabad EAN-kód a poolban — új digitális tömb igénylése szükséges!',
        },
      });
    }

    await this.audit.record({
      actor: params.actor,
      action: 'UPDATE',
      entityType: 'ean_code',
      entityId: code,
      detail: { assignedTo: params.partnerCode, ref: params.ref },
    });

    const status = await this.status();
    if (status.low) {
      this.logger.warn(
        `FIGYELEM: A NEAK-matricák száma ${status.available} — új digitális tömb igénylése szükséges!`,
      );
    }

    return { code, status };
  }

  /** A pool aktuális állapota + kritikus-szint jelzés. */
  async status(): Promise<EanPoolStatus> {
    // Két külön count (hordozható; nem függ a FILTER kiegészítéstől).
    const availRes = await this.db.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM ean_codes WHERE used = false`,
    );
    const usedRes = await this.db.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM ean_codes WHERE used = true`,
    );
    const available = availRes.rows[0]?.c ?? 0;
    const used = usedRes.rows[0]?.c ?? 0;
    return {
      available,
      used,
      low: available < EAN_POOL_LOW_THRESHOLD,
      threshold: EAN_POOL_LOW_THRESHOLD,
    };
  }
}
