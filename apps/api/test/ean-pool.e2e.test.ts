import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataType, newDb } from 'pg-mem';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PG_POOL } from '../src/database/pg-pool.provider';

/**
 * End-to-end teszt a Virtuális EAN-kód Poolra (II/C): valós HTTP-végpontok
 * pg-mem fölött. Fókusz: feltöltés (tartomány + lista), atomikus/legkisebb-elöl
 * kiosztás, egyediség, üres pool → 409, kritikus-szint jelzés.
 */
describe('II/C modul — Virtuális EAN-kód Pool (HTTP + pg-mem)', () => {
  let app: INestApplication;

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
  });

  afterAll(async () => {
    await app?.close();
  });

  it('üres pool → status 0 szabad, low=true', async () => {
    const res = await request(app.getHttpServer())
      .get('/ean-pool/status')
      .expect(200);
    expect(res.body.available).toBe(0);
    expect(res.body.low).toBe(true);
  });

  it('feltöltés tartományból → a kódok hozzáadódnak', async () => {
    const res = await request(app.getHttpServer())
      .post('/ean-pool/upload')
      .set('X-Operator', 'admin')
      .send({ label: 'CPAP-matrica', range: { from: '21000001', to: '21000060' } })
      .expect(201);
    expect(res.body.added).toBe(60);
    expect(res.body.skipped).toBe(0);
  });

  it('ismételt feltöltés ugyanazokkal → idempotens (skipped)', async () => {
    const res = await request(app.getHttpServer())
      .post('/ean-pool/upload')
      .send({ label: 'CPAP-matrica', range: { from: '21000001', to: '21000010' } })
      .expect(201);
    expect(res.body.added).toBe(0);
    expect(res.body.skipped).toBe(10);
  });

  it('feltöltés explicit listából', async () => {
    const res = await request(app.getHttpServer())
      .post('/ean-pool/upload')
      .send({ label: 'extra', codes: ['21999001', '21999002'] })
      .expect(201);
    expect(res.body.added).toBe(2);
  });

  it('érvénytelen feltöltés (sem tartomány, sem lista) → 400', async () => {
    await request(app.getHttpServer())
      .post('/ean-pool/upload')
      .send({ label: 'x' })
      .expect(400);
  });

  it('kiosztás a legkisebb szabad kódot adja, majd egyedi következőt', async () => {
    const a = await request(app.getHttpServer())
      .post('/ean-pool/allocate')
      .send({ partnerCode: 'P-000123', ref: 'draft-1' })
      .expect(201);
    const b = await request(app.getHttpServer())
      .post('/ean-pool/allocate')
      .send({ partnerCode: 'P-000123', ref: 'draft-2' })
      .expect(201);

    expect(a.body.code).toBe('21000001');
    expect(b.body.code).toBe('21000002');
    expect(a.body.code).not.toBe(b.body.code);
    // A status követi a felhasználást.
    expect(b.body.status.used).toBeGreaterThanOrEqual(2);
  });

  it('sok kiosztás után mind egyedi (nincs duplikátum)', async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const res = await request(app.getHttpServer())
        .post('/ean-pool/allocate')
        .send({ partnerCode: 'P-000456' })
        .expect(201);
      expect(seen.has(res.body.code)).toBe(false);
      seen.add(res.body.code);
    }
    expect(seen.size).toBe(20);
  });

  it('kritikus szint jelzése: ha a szabad készlet a küszöb alá esik', async () => {
    // A pool 62 kódot kapott; a fenti tesztek 22-t kiosztottak → 40 szabad < 50.
    const res = await request(app.getHttpServer())
      .get('/ean-pool/status')
      .expect(200);
    expect(res.body.available).toBeLessThan(res.body.threshold);
    expect(res.body.low).toBe(true);
  });

  it('vényes számla véglegesítése → automatikus EAN-kód a bizonylaton', async () => {
    // Külön tömb ehhez a teszthez, hogy legyen biztosan szabad kód.
    await request(app.getHttpServer())
      .post('/ean-pool/upload')
      .send({ label: 'venyes-teszt', codes: ['21500001', '21500002'] })
      .expect(201);

    const draft = await request(app.getHttpServer())
      .post('/invoicing/drafts')
      .send({
        partnerCode: 'P-000123',
        payment: 'cash',
        items: [{ code: 'CPAP', name: 'CPAP készülék', quantity: 1, unitGross: 90000 }],
        prescription: true,
      })
      .expect(201);
    expect(draft.body.prescription).toBe(true);
    expect(draft.body.eanCode).toBeNull(); // még nincs kiosztva

    const fin = await request(app.getHttpServer())
      .post(`/invoicing/drafts/${draft.body.id}/finalize`)
      .expect(201);
    expect(fin.body.status).toBe('issued');
    // Kapott egy EAN-kódot a poolból (a globálisan legkisebb szabad, 21-kezdetű).
    expect(fin.body.draft.eanCode).toMatch(/^21\d+$/);
    expect(fin.body.draft.eanCode).not.toBeNull();
  });

  it('a pool teljes kimerülése → 409 (új tömb kell)', async () => {
    // Kiürítjük a maradékot, majd egy plusz kérés 409-et ad.
    let ok = true;
    let guard = 0;
    while (ok && guard < 200) {
      const res = await request(app.getHttpServer())
        .post('/ean-pool/allocate')
        .send({ partnerCode: 'P-drain' });
      ok = res.status === 201;
      guard++;
    }
    // Az utolsó kérés 409 volt (üres pool).
    await request(app.getHttpServer())
      .post('/ean-pool/allocate')
      .send({ partnerCode: 'P-drain' })
      .expect(409);
  });
});
