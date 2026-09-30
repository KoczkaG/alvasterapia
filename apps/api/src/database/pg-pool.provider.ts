import { Pool } from 'pg';

/**
 * A PostgreSQL connection pool provider tokene. A production kód a valódi
 * `pg.Pool`-t kapja; a tesztek (pg-mem) felülírhatják ezt a tokent egy
 * memóriában futó pool-lal — a DatabaseService kódja változatlan marad.
 */
export const PG_POOL = Symbol('PG_POOL');

export const pgPoolProvider = {
  provide: PG_POOL,
  useFactory: (): Pool =>
    new Pool({
      connectionString:
        process.env.DATABASE_URL ??
        'postgres://somnoshop:somnoshop_dev@localhost:5432/somnoshop',
    }),
};
