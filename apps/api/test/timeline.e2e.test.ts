import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataType, newDb } from 'pg-mem';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { PG_POOL } from '../src/database/pg-pool.provider';

/**
 * End-to-end teszt a Központi Ügyféltörténet Idővonalra (I/D): valós
 * HTTP-végpontok pg-mem fölött. Ellenőrzi a belső + KVL események
 * összefésülését, a lekérdezés audit-naplózását, valamint a Philips-csereprojekt
 * importját és a kötelező riasztás visszaadását.
 */
describe('I/D modul — Központi Timeline (HTTP + pg-mem)', () => {
  let app: INestApplication;
  let db: DatabaseService;

  beforeAll(async () => {
    const mem = newDb();
    mem.public.registerFunction({
      name: 'gen_random_uuid',
      returns: DataType.uuid,
      implementation: () => crypto.randomUUID(),
      impure: true,
    });

    const pgMemPg = mem.adapters.createPg();
    const pool = new pgMemPg.Pool();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue(pool)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    db = app.get(DatabaseService);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('összefésüli a KVL-eseményeket az idővonalon (P-000123 mock-adata)', async () => {
    const res = await request(app.getHttpServer())
      .get('/timeline/P-000123')
      .set('X-Operator', 'pult.teszt')
      .expect(200);

    const types = res.body.items.map((i: { type: string }) => i.type);
    // A KVL-mock ad számlát, raktármozgást és csomagkézbesítést.
    expect(types).toContain('INVOICE_ISSUED');
    expect(types).toContain('STOCK_MOVEMENT');
    expect(types).toContain('PACKAGE_DELIVERED');

    // A számlánál a konkrét termék-/modellnév is olvasható (I/D kritikus elvárás).
    const invoice = res.body.items.find(
      (i: { type: string }) => i.type === 'INVOICE_ISSUED',
    );
    expect(invoice.text).toContain('Prisma Smart Plus');
    expect(invoice.category).toBe('finance');
    expect(invoice.source).toBe('kvl');
  });

  it('időrendben csökkenő sorrendet ad (legfrissebb elöl)', async () => {
    const res = await request(app.getHttpServer())
      .get('/timeline/P-000123')
      .expect(200);
    const times = res.body.items.map((i: { occurredAt: string }) => i.occurredAt);
    const sorted = [...times].sort((a, b) => b.localeCompare(a));
    expect(times).toEqual(sorted);
  });

  it('minden idővonal-lekérdezést naplóz (READ, egészségügyi adat)', async () => {
    await request(app.getHttpServer())
      .get('/timeline/P-000123')
      .set('X-Operator', 'audit.teszt')
      .expect(200);
    const audit = await db.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM audit_log
        WHERE entity_type = 'timeline' AND entity_id = 'P-000123'
          AND actor = 'audit.teszt' AND action = 'READ'`,
    );
    expect(audit.rows[0].c).toBeGreaterThanOrEqual(1);
  });

  it('ismeretlen partnernél üres idővonal, nincs Philips-riasztás', async () => {
    const res = await request(app.getHttpServer())
      .get('/timeline/P-999999')
      .expect(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.philipsRecall).toBeNull();
  });

  it('Philips-import után a beteg adatlapján megjelenik a riasztás', async () => {
    await request(app.getHttpServer())
      .post('/timeline/philips-recall/import')
      .set('X-Operator', 'admin.teszt')
      .send({
        rows: [
          {
            partnerCode: 'P-000123',
            replacementModel: 'DreamStation 2',
            serialNumber: 'SN-DS2-4471',
            replacedOn: '2024-05-10',
          },
        ],
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/timeline/P-000123')
      .expect(200);
    expect(res.body.philipsRecall).not.toBeNull();
    expect(res.body.philipsRecall.replacementModel).toBe('DreamStation 2');
    expect(res.body.philipsRecall.serialNumber).toBe('SN-DS2-4471');
  });

  it('Philips-import upsert: ugyanaz a partnerkód frissül, nem duplikál', async () => {
    await request(app.getHttpServer())
      .post('/timeline/philips-recall/import')
      .send({
        rows: [
          {
            partnerCode: 'P-000123',
            replacementModel: 'DreamStation 2 Advanced',
            serialNumber: 'SN-DS2-9999',
          },
        ],
      })
      .expect(201);
    const count = await db.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM philips_recall WHERE partner_code = 'P-000123'`,
    );
    expect(count.rows[0].c).toBe(1);
    const res = await request(app.getHttpServer())
      .get('/timeline/P-000123')
      .expect(200);
    expect(res.body.philipsRecall.serialNumber).toBe('SN-DS2-9999');
  });

  it('érvénytelen import (üres rows) → 400', async () => {
    await request(app.getHttpServer())
      .post('/timeline/philips-recall/import')
      .send({ rows: [] })
      .expect(400);
  });

  it('a kimenő hívás (I/C) megjelenik a Timeline-on belső eseményként', async () => {
    // Indítunk és lezárunk egy hívást P-000456-hoz, majd lekérdezzük az idővonalát.
    const started = await request(app.getHttpServer())
      .post('/calls')
      .send({
        partnerCode: 'P-000456',
        phoneKind: 'patient_mobile',
        phoneNumber: '+36 30 111 2222',
        origin: 'counter',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/calls/${started.body.id}/complete`)
      .send({ outcome: 'completed' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/timeline/P-000456')
      .expect(200);
    const call = res.body.items.find(
      (i: { type: string }) => i.type === 'OUTBOUND_CALL',
    );
    expect(call).toBeDefined();
    expect(call.category).toBe('communication');
    expect(call.source).toBe('internal');
  });
});
