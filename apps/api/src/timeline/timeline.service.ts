import { Inject, Injectable } from '@nestjs/common';
import {
  categoryForType,
  type PhilipsRecallImportRow,
  type PhilipsRecallInfo,
  type TimelineItem,
} from '@somnoshop/shared';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { KVL_PORT, type KvlPort } from '../kvl/kvl.port';
import type { TimelineEvent, TimelinePort } from './timeline.port';

/**
 * Központi Ügyféltörténet Idővonal (Timeline) — I/D.
 *
 * Append-only belső eseménynapló (a modulok ezen keresztül írnak), valamint a
 * lekérdezéskor a KVL-eredetű események (pénzügy, raktár, logisztika) valós idejű
 * összefésülése egyetlen, időrendi nézetbe.
 *
 * A TimelinePort.append() interfész változatlan maradt az I/C óta — a hívók
 * (pl. kimenő hívások) nem módosultak.
 */
@Injectable()
export class TimelineService implements TimelinePort {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    @Inject(KVL_PORT) private readonly kvl: KvlPort,
  ) {}

  /** Belső esemény rögzítése (append-only), a kategóriát a típusból származtatva. */
  async append(event: TimelineEvent): Promise<void> {
    await this.db.query(
      `INSERT INTO timeline_events (partner_code, category, type, text, occurred_at, detail)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        event.partnerCode,
        categoryForType(event.type),
        event.type,
        event.text,
        event.occurredAt,
        event.detail ? JSON.stringify(event.detail) : null,
      ],
    );
  }

  /**
   * Egy beteg TELJES idővonala időrendben (legfrissebb elöl): a belső események
   * + a KVL-ből lekérdezett pénzügyi/raktári/logisztikai események összefésülve.
   *
   * Minden lekérdezés AUDIT-LOGBA kerül (egészségügyi adat READ művelete), az
   * actort a hívó adja meg (jelenleg X-Operator placeholder).
   */
  async getForPartner(
    partnerCode: string,
    actor: string,
  ): Promise<TimelineItem[]> {
    // 1. Belső, perzisztált események.
    const internalRes = await this.db.query<{
      id: string;
      partner_code: string;
      category: string;
      type: string;
      text: string;
      occurred_at: Date;
      detail: Record<string, unknown> | null;
    }>(
      `SELECT id, partner_code, category, type, text, occurred_at, detail
         FROM timeline_events
        WHERE partner_code = $1`,
      [partnerCode],
    );

    const internal: TimelineItem[] = internalRes.rows.map((r) => ({
      id: r.id,
      partnerCode: r.partner_code,
      category: categoryForType(r.type),
      type: r.type,
      text: r.text,
      occurredAt: toIso(r.occurred_at),
      source: 'internal',
      ...(r.detail ? { detail: r.detail } : {}),
    }));

    // 2. KVL-eredetű események (adapteren át; hibatűrően).
    let kvlItems: TimelineItem[] = [];
    try {
      const kvlEvents = await this.kvl.fetchTimelineEvents(partnerCode);
      kvlItems = kvlEvents.map((e, idx) => ({
        id: `kvl:${partnerCode}:${idx}`,
        partnerCode,
        category: categoryForType(e.type),
        type: e.type,
        text: e.text,
        occurredAt: e.occurredAt,
        source: 'kvl',
        ...(e.detail ? { detail: e.detail } : {}),
      }));
    } catch {
      // A KVL átmeneti hibája ne akadályozza a belső előzmények megjelenítését.
      kvlItems = [];
    }

    // 3. Összefésülés, időrendben csökkenő (legfrissebb elöl).
    const merged = [...internal, ...kvlItems].sort((a, b) =>
      b.occurredAt.localeCompare(a.occurredAt),
    );

    // 4. Audit: ki, mikor, melyik beteg idővonalát nézte meg.
    await this.audit.record({
      actor,
      action: 'READ',
      entityType: 'timeline',
      entityId: partnerCode,
      detail: { itemCount: merged.length },
    });

    return merged;
  }

  // ---------------------------------------------------------------------------
  // Philips-csereprojekt (I/D checklist 3. pont)
  // ---------------------------------------------------------------------------

  /**
   * A korábbi külső Excel egyszeri, teljes körű importja. Idempotens: ugyanaz a
   * partnerkód frissül (upsert). Visszaadja a feldolgozott sorok számát.
   */
  async importPhilipsRecall(
    rows: PhilipsRecallImportRow[],
    actor: string,
  ): Promise<{ imported: number }> {
    for (const row of rows) {
      await this.db.query(
        `INSERT INTO philips_recall (partner_code, replacement_model, serial_number, replaced_on)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (partner_code) DO UPDATE
           SET replacement_model = EXCLUDED.replacement_model,
               serial_number = EXCLUDED.serial_number,
               replaced_on = EXCLUDED.replaced_on,
               imported_at = now()`,
        [
          row.partnerCode,
          row.replacementModel,
          row.serialNumber,
          row.replacedOn ?? null,
        ],
      );
    }
    await this.audit.record({
      actor,
      action: 'CREATE',
      entityType: 'philips_recall_import',
      detail: { rowCount: rows.length },
    });
    return { imported: rows.length };
  }

  /**
   * Ha a beteg érintett a Philips-csereprojektben, visszaadja a gépcsere-adatait
   * (a pulton KÖTELEZŐ piros riasztáshoz). Egyébként null.
   */
  async getPhilipsRecall(
    partnerCode: string,
  ): Promise<PhilipsRecallInfo | null> {
    const res = await this.db.query<{
      partner_code: string;
      replacement_model: string;
      serial_number: string;
      replaced_on: Date | null;
    }>(
      `SELECT partner_code, replacement_model, serial_number, replaced_on
         FROM philips_recall WHERE partner_code = $1`,
      [partnerCode],
    );
    const r = res.rows[0];
    if (!r) return null;
    return {
      partnerCode: r.partner_code,
      replacementModel: r.replacement_model,
      serialNumber: r.serial_number,
      ...(r.replaced_on ? { replacedOn: toIso(r.replaced_on).slice(0, 10) } : {}),
    };
  }
}

/** DB-időbélyeg → ISO string (pg Date vagy szöveg is jöhet a driver szerint). */
function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}
