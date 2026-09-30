import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { readdirSync, readFileSync } from 'node:fs';
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
    // Az alap-séma (database/schema.sql) mindig elsőként fut le.
    const baseSchema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
    await this.pool.query(baseSchema);

    // Ezt követően minden modul saját *.schema.sql fájlja (idempotens,
    // IF NOT EXISTS). A dist-ben az src mappastruktúra megmarad, ezért az
    // __dirname-ből (database/) egy szinttel feljebb keressük a modulokat.
    const modulesRoot = join(__dirname, '..');
    for (const file of this.findModuleSchemas(modulesRoot)) {
      const sql = readFileSync(file, 'utf8');
      await this.pool.query(sql);
    }

    this.logger.log('Adatbázis-séma alkalmazva (alap + modulok).');
  }

  /** Összegyűjti a modulok *.schema.sql fájljait (a base schema.sql kivételével). */
  private findModuleSchemas(root: string): string[] {
    const result: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith('.schema.sql')) {
          result.push(full);
        }
      }
    };
    walk(root);
    // Determinisztikus sorrend a reprodukálhatóságért.
    return result.sort();
  }
}
