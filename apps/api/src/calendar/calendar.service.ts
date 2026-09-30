import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DEFAULT_WEEKLY_SCHEDULE,
  isOpenAt,
  nextOpening,
  resolveOpeningForDate,
  type DateOverride,
  type NextOpening,
  type OpeningCalendar,
  type ResolvedDay,
  type WeeklySchedule,
} from '@somnoshop/shared';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { OPENING_SYNC_TARGETS, type OpeningSyncTarget } from './sync.port';

export interface OpeningStatus {
  /** A lekérdezés helyi ideje (Europe/Budapest). */
  now: { date: string; time: string };
  open: boolean;
  /** Az aznapi feloldott nyitvatartás. */
  today: ResolvedDay;
  /** A következő nyitás (ha épp zárva vagyunk / hasznos tájékoztatáshoz). */
  next: NextOpening | null;
}

const BUDAPEST_TZ = 'Europe/Budapest';

/**
 * A nyitvatartási naptár központi szolgáltatása (I/B). Ez a cég "egyetlen
 * igazságforrása": innen olvas a telefonos IVR-zsilip, a webshop és a Google
 * szinkron. Bármilyen módosítás után automatikusan push-olja a naptárt az
 * összes szinkron-célnak.
 */
@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    @Inject(OPENING_SYNC_TARGETS)
    private readonly syncTargets: OpeningSyncTarget[],
  ) {}

  /** A teljes naptár beolvasása (heti alap + felülírások). */
  async getCalendar(): Promise<OpeningCalendar> {
    const weeklyRes = await this.db.query<{ schedule: WeeklySchedule }>(
      'SELECT schedule FROM opening_weekly WHERE id = 1',
    );
    const weekly =
      weeklyRes.rows[0]?.schedule ?? DEFAULT_WEEKLY_SCHEDULE;

    const overridesRes = await this.db.query<{
      date: string;
      kind: 'closed' | 'custom';
      label: string;
      ranges: DateOverride['ranges'] | null;
    }>(
      `SELECT to_char(date, 'YYYY-MM-DD') AS date, kind, label, ranges
         FROM opening_overrides
        ORDER BY date`,
    );

    const overrides: DateOverride[] = overridesRes.rows.map((r) => ({
      date: r.date,
      kind: r.kind,
      label: r.label,
      ...(r.ranges ? { ranges: r.ranges } : {}),
    }));

    return { weekly, overrides };
  }

  /** A heti alap-nyitvatartás beállítása (singleton upsert) + szinkron. */
  async setWeekly(
    schedule: WeeklySchedule,
    actor: string,
  ): Promise<OpeningCalendar> {
    await this.db.query(
      `INSERT INTO opening_weekly (id, schedule, updated_by)
       VALUES (1, $1, $2)
       ON CONFLICT (id) DO UPDATE
         SET schedule = EXCLUDED.schedule,
             updated_at = now(),
             updated_by = EXCLUDED.updated_by`,
      [JSON.stringify(schedule), actor],
    );
    await this.audit.record({
      actor,
      action: 'UPDATE',
      entityType: 'opening_weekly',
      entityId: '1',
    });
    return this.publishAndReturn(actor, 'weekly_updated');
  }

  /** Egy dátum-felülírás felvétele vagy módosítása (upsert) + szinkron. */
  async upsertOverride(
    override: DateOverride,
    actor: string,
  ): Promise<OpeningCalendar> {
    await this.db.query(
      `INSERT INTO opening_overrides (date, kind, label, ranges, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (date) DO UPDATE
         SET kind = EXCLUDED.kind,
             label = EXCLUDED.label,
             ranges = EXCLUDED.ranges,
             created_by = EXCLUDED.created_by`,
      [
        override.date,
        override.kind,
        override.label,
        override.ranges ? JSON.stringify(override.ranges) : null,
        actor,
      ],
    );
    await this.audit.record({
      actor,
      action: 'UPDATE',
      entityType: 'opening_override',
      entityId: override.date,
      detail: { kind: override.kind, label: override.label },
    });
    return this.publishAndReturn(actor, 'override_upserted');
  }

  /** Egy dátum-felülírás törlése (visszaáll az alap-rendre) + szinkron. */
  async deleteOverride(date: string, actor: string): Promise<OpeningCalendar> {
    await this.db.query('DELETE FROM opening_overrides WHERE date = $1', [
      date,
    ]);
    await this.audit.record({
      actor,
      action: 'DELETE',
      entityType: 'opening_override',
      entityId: date,
    });
    return this.publishAndReturn(actor, 'override_deleted');
  }

  /**
   * "Nyitva van-e most?" — az IVR belépési zsilipje és a webshop hívja.
   * Ha nincs megadva időpont, az aktuális Europe/Budapest időt használja.
   */
  async getStatus(at?: Date): Promise<OpeningStatus> {
    const calendar = await this.getCalendar();
    const { date, time } = localDateTime(at ?? new Date());
    return {
      now: { date, time },
      open: isOpenAt(calendar, date, time),
      today: resolveOpeningForDate(calendar, date),
      next: nextOpening(calendar, date, time),
    };
  }

  /** Naptár leadása minden szinkron-célnak (hibatűrően), majd visszaadás. */
  private async publishAndReturn(
    actor: string,
    reason: string,
  ): Promise<OpeningCalendar> {
    const calendar = await this.getCalendar();
    await Promise.all(
      this.syncTargets.map(async (target) => {
        try {
          await target.push(calendar);
        } catch (err) {
          // Egy szinkron-cél hibája nem blokkolhatja a mentést; naplózzuk.
          this.logger.error(
            `Szinkron sikertelen (${target.name}): ${String(err)}`,
          );
          await this.audit.record({
            actor: 'system',
            action: 'EXPORT',
            entityType: 'opening_sync_failure',
            entityId: target.name,
            detail: { reason },
          });
        }
      }),
    );
    return calendar;
  }
}

/**
 * Egy Date-et Europe/Budapest helyi naptári napra (YYYY-MM-DD) és időre (HH:MM)
 * bont, DST-helyesen (Intl.DateTimeFormat a zóna-konverzióhoz).
 */
function localDateTime(instant: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUDAPEST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  // hour12:false esetenként "24"-et ad éjfélre — normalizáljuk.
  const hour = get('hour') === '24' ? '00' : get('hour');
  const time = `${hour}:${get('minute')}`;
  return { date, time };
}
