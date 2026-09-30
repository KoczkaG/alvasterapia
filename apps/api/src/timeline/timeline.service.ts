import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { TimelineEvent, TimelinePort } from './timeline.port';

/**
 * Minimál, DB-alapú Timeline-implementáció (append-only). Az I/D majd kibővíti
 * a többi adatforrás integrálásával; a TimelinePort interfész stabil marad.
 */
@Injectable()
export class TimelineService implements TimelinePort {
  constructor(private readonly db: DatabaseService) {}

  async append(event: TimelineEvent): Promise<void> {
    await this.db.query(
      `INSERT INTO timeline_events (partner_code, type, text, occurred_at, detail)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        event.partnerCode,
        event.type,
        event.text,
        event.occurredAt,
        event.detail ? JSON.stringify(event.detail) : null,
      ],
    );
  }

  /** Egy partner idővonala időrendben (a későbbi I/D nézet alapja). */
  async list(partnerCode: string): Promise<TimelineEvent[]> {
    const res = await this.db.query<{
      partner_code: string;
      type: string;
      text: string;
      occurred_at: Date;
      detail: Record<string, unknown> | null;
    }>(
      `SELECT partner_code, type, text, occurred_at, detail
         FROM timeline_events
        WHERE partner_code = $1
        ORDER BY occurred_at DESC`,
      [partnerCode],
    );
    return res.rows.map((r) => ({
      partnerCode: r.partner_code,
      type: r.type,
      text: r.text,
      occurredAt:
        r.occurred_at instanceof Date
          ? r.occurred_at.toISOString()
          : String(r.occurred_at),
      ...(r.detail ? { detail: r.detail } : {}),
    }));
  }
}
