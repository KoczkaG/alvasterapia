import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { NewTask, TaskPort } from './task.port';

/**
 * Minimál, DB-alapú feladatkezelő (append-only nyitott feladatok). A VII/E majd
 * kibővíti; a TaskPort interfész stabil marad.
 */
@Injectable()
export class TasksService implements TaskPort {
  constructor(private readonly db: DatabaseService) {}

  async create(task: NewTask): Promise<{ id: string }> {
    const res = await this.db.query<{ id: string }>(
      `INSERT INTO tasks (title, detail, partner_code, source, ref_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        task.title,
        task.detail ?? null,
        task.partnerCode ?? null,
        task.source,
        task.refId ?? null,
      ],
    );
    return { id: res.rows[0].id };
  }

  /** Nyitott feladatok listája (a későbbi VII/E feladatkezelő nézet alapja). */
  async listOpen(): Promise<
    { id: string; title: string; partnerCode: string | null }[]
  > {
    const res = await this.db.query<{
      id: string;
      title: string;
      partner_code: string | null;
    }>(
      `SELECT id, title, partner_code FROM tasks
        WHERE status = 'open' ORDER BY created_at DESC`,
    );
    return res.rows.map((r) => ({
      id: r.id,
      title: r.title,
      partnerCode: r.partner_code,
    }));
  }
}
