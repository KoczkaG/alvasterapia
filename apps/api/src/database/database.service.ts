import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool, QueryResult, QueryResultRow } from 'pg';
import { PG_POOL } from './pg-pool.provider';

/**
 * PostgreSQL kapcsolatkezelő. A cég saját szerverén futó adatbázishoz csatlakozik.
 * Indításkor lefuttatja a sémát (idempotens, IF NOT EXISTS), így nincs szükség
 * külön migrációs eszközre a jelenlegi fázisban.
 *
 * A pool-t injekcióval kapja (PG_POOL), így tesztben pg-mem-mel felülírható.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleInit(): Promise<void> {
    await this.applySchema();
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params as never[]);
  }

  private async applySchema(): Promise<void> {
    const schemaPath = join(__dirname, 'schema.sql');
    const sql = readFileSync(schemaPath, 'utf8');
    await this.pool.query(sql);
    this.logger.log('Adatbázis-séma alkalmazva.');
  }
}
