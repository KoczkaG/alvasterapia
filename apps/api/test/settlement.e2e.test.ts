import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataType, newDb } from 'pg-mem';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { PG_POOL } from '../src/database/pg-pool.provider';

/**
 * End-to-end teszt az Elszámolás és Statisztika modulra (II. Modul / E): valós
 * HTTP-végpontok pg-mem fölött. Fókusz: konfigurálható kihordási idő és
 * jogosultság, kaució-elszámolás (visszajáró/ráfizetés + értesítés), OEP napi
 * egyeztető (KVL vs. Mankó eltérés kimutatása).
 */
describe('II/E modul — Elszámolás és Statisztika (HTTP + pg-mem)', () => {
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

  // --- Kihordási idő -------------------------------------------------------

  it('a kihordási idő alapszabályok betöltődnek', async () => {
    const res = await request(app.getHttpServer())
      .get('/settlement/wear-time-rules')
      .expect(200);
    const maszk = res.body.find((r: { productType: string }) => r.productType === 'maszk');
    expect(maszk.months).toBe(12);
  });

  it('a kihordási idő admin által felülírható', async () => {
    await request(app.getHttpServer())
      .post('/settlement/wear-time-rules')
      .set('X-Operator', 'admin.demo')
      .send({ productType: 'maszk', months: 24 })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/settlement/wear-time-rules')
      .expect(200);
    const maszk = res.body.find((r: { productType: string }) => r.productType === 'maszk');
    expect(maszk.months).toBe(24);
  });

  it('jogosultság: letelt kihordási idő → eligibleNow=true', async () => {
    const res = await request(app.getHttpServer())
      .get('/settlement/eligibility?purchaseDate=2024-01-10&productType=szuro&today=2025-06-01')
      .expect(200);
    expect(res.body.eligibleFrom).toBe('2024-04-10');
    expect(res.body.eligibleNow).toBe(true);
  });

  it('jogosultság: még nem telt le → eligibleNow=false', async () => {
    const res = await request(app.getHttpServer())
      .get('/settlement/eligibility?purchaseDate=2025-05-01&productType=szuro&today=2025-06-01')
      .expect(200);
    expect(res.body.eligibleNow).toBe(false);
  });

  // --- Kaució-elszámoló ----------------------------------------------------

  it('kaució: visszajáró számítás + értesítés, ha van e-mail', async () => {
    // P-000456 (Nagy István) rendelkezik e-mail címmel a KVL-mockban.
    const res = await request(app.getHttpServer())
      .post('/settlement/deposit')
      .set('X-Operator', 'penztaros.demo')
      .send({
        partnerCode: 'P-000456',
        payments: [
          { reference: 'B-1', amount: 50000, paidOn: '2025-01-01' },
          { reference: 'B-2', amount: 10000, paidOn: '2025-02-01' },
        ],
        deductions: [{ label: 'Tisztítási díj', amount: 8000 }],
      })
      .expect(201);

    expect(res.body.result.balance).toBe(52000);
    expect(res.body.result.refundDue).toBe(true);
    expect(res.body.notified).toBe(true);
  });

  it('kaució: nincs értesítés, ha nincs e-mail (P-000123)', async () => {
    const res = await request(app.getHttpServer())
      .post('/settlement/deposit')
      .set('X-Operator', 'penztaros.demo')
      .send({
        partnerCode: 'P-000123',
        payments: [{ reference: 'B-1', amount: 10000, paidOn: '2025-01-01' }],
        deductions: [
          { label: 'TB-önrész', amount: 12000 },
          { label: 'Késedelem', amount: 3000 },
        ],
      })
      .expect(201);

    expect(res.body.result.balance).toBe(-5000);
    expect(res.body.result.refundDue).toBe(false);
    expect(res.body.notified).toBe(false);
  });

  it('kaució: a bizonylat elmentődik az adatbázisba', async () => {
    const count = await db.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM deposit_settlements WHERE partner_code = $1`,
      ['P-000456'],
    );
    expect(count.rows[0].c).toBeGreaterThanOrEqual(1);
  });

  it('kaució: negatív összeg → 400 (séma-validáció)', async () => {
    await request(app.getHttpServer())
      .post('/settlement/deposit')
      .send({
        partnerCode: 'P-000456',
        payments: [{ reference: 'B', amount: -1, paidOn: '2025-01-01' }],
        deductions: [],
      })
      .expect(400);
  });

  // --- OEP napi egyeztető --------------------------------------------------

  it('OEP: eltérés kimutatása (KVL vs. Mankó a demó-napra)', async () => {
    // A Mankó-mock 2026-09-30-ra: maszk 5, gegecso 3, szuro 2.
    const res = await request(app.getHttpServer())
      .post('/settlement/oep-reconcile')
      .set('X-Operator', 'admin.demo')
      .send({
        date: '2026-09-30',
        kvlCounts: [
          { productType: 'maszk', count: 5 },
          { productType: 'gegecso', count: 3 },
          { productType: 'szuro', count: 3 }, // eltérés: KVL 3, Mankó 2
        ],
      })
      .expect(201);

    expect(res.body.allMatch).toBe(false);
    const szuro = res.body.rows.find((r: { productType: string }) => r.productType === 'szuro');
    expect(szuro.diff).toBe(1);
    expect(szuro.match).toBe(false);
    const maszk = res.body.rows.find((r: { productType: string }) => r.productType === 'maszk');
    expect(maszk.match).toBe(true);
  });

  it('OEP: teljes egyezés → allMatch=true', async () => {
    const res = await request(app.getHttpServer())
      .post('/settlement/oep-reconcile')
      .set('X-Operator', 'admin.demo')
      .send({
        date: '2026-09-30',
        kvlCounts: [
          { productType: 'maszk', count: 5 },
          { productType: 'gegecso', count: 3 },
          { productType: 'szuro', count: 2 },
        ],
      })
      .expect(201);

    expect(res.body.allMatch).toBe(true);
  });

  it('OEP: a pillanatkép elmentődik az adatbázisba', async () => {
    const count = await db.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM oep_reconciliations WHERE for_date = $1`,
      ['2026-09-30'],
    );
    expect(count.rows[0].c).toBeGreaterThanOrEqual(2);
  });
});
