import { Injectable } from '@nestjs/common';
import { type CallTopic } from '@somnoshop/shared';
import { DatabaseService } from '../database/database.service';

/**
 * Vezetői statisztikai összesítés a hívásvégi jegyzetekből (I/E 4. pont).
 * Megmutatja, milyen okokból keresik a betegek a szaküzletet, mely alváslaborok
 * küldik a legtöbb pácienst, és a panaszok mennyiségét — a célzott
 * intézkedésekhez és a pult tehermentesítéséhez.
 */
@Injectable()
export class CallStatsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Összesítés egy időszakra (alap: az adott naptári hónap).
   * @param fromIso opcionális kezdő időpont (ISO), zárólag inkluzív.
   * @param toIso opcionális záró időpont (ISO), kizárólag.
   */
  async summary(
    fromIso?: string,
    toIso?: string,
  ): Promise<{
    range: { from: string | null; to: string | null };
    totalNotes: number;
    topicBreakdown: { topic: CallTopic; count: number; percent: number }[];
    referrerRanking: { referrerId: string; count: number }[];
    followUpCount: number;
  }> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (fromIso) {
      params.push(fromIso);
      where.push(`created_at >= $${params.length}`);
    }
    if (toIso) {
      params.push(toIso);
      where.push(`created_at < $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // Összes jegyzet a tartományban.
    const totalRes = await this.db.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM call_notes ${whereSql}`,
      params,
    );
    const totalNotes = totalRes.rows[0]?.c ?? 0;

    // Téma-bontás: a topics JSONB tömböket beolvassuk és alkalmazásoldalon
    // számoljuk. (Hordozható; nem függ adatbázis-specifikus tömb-kibontástól.)
    const topicsRes = await this.db.query<{ topics: string[] }>(
      `SELECT topics FROM call_notes ${whereSql}`,
      params,
    );
    const topicCounts = new Map<string, number>();
    for (const row of topicsRes.rows) {
      const topics = Array.isArray(row.topics) ? row.topics : [];
      for (const t of topics) {
        topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
      }
    }
    const topicBreakdown = [...topicCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([topic, count]) => ({
        topic: topic as CallTopic,
        count,
        // A százalék a jegyzetek számához viszonyul (egy jegyzeten több téma is lehet).
        percent:
          totalNotes > 0 ? Math.round((count / totalNotes) * 1000) / 10 : 0,
      }));

    // Küldő intézmények / alváslaborok rangsora.
    const refRes = await this.db.query<{ referrer_id: string; c: number }>(
      `SELECT referrer_id, count(*)::int AS c
         FROM call_notes
        ${whereSql ? whereSql + ' AND' : 'WHERE'} referrer_id IS NOT NULL
        GROUP BY referrer_id
        ORDER BY c DESC`,
      params,
    );
    const referrerRanking = refRes.rows.map((r) => ({
      referrerId: r.referrer_id,
      count: r.c,
    }));

    // Visszahívási igények száma.
    const followRes = await this.db.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM call_notes
        ${whereSql ? whereSql + ' AND' : 'WHERE'} follow_up = true`,
      params,
    );
    const followUpCount = followRes.rows[0]?.c ?? 0;

    return {
      range: { from: fromIso ?? null, to: toIso ?? null },
      totalNotes,
      topicBreakdown,
      referrerRanking,
      followUpCount,
    };
  }
}
