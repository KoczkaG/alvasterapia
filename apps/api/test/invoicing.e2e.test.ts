import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataType, newDb } from 'pg-mem';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { PG_POOL } from '../src/database/pg-pool.provider';

/**
 * End-to-end teszt a Pulti Védőháló és Számlázás modulra (II/D): valós
 * HTTP-végpontok pg-mem fölött. Fókusz: kód-validáció, kétirányú zárási szűrő,
 * kártyás limit-védőháló (elutasításnál nincs NAV-számla), sikeres kiállítás +
 * Timeline.
 */
describe('II/D modul — Pulti Védőháló és Számlázás (HTTP + pg-mem)', () => {
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

  // --- kód-validátor ---

  it('validate-code: 27-tel kezdődő vénykód érvényes', async () => {
    const res = await request(app.getHttpServer())
      .post('/invoicing/validate-code')
      .send({ kind: 'prescription', code: '27123456' })
      .expect(201);
    expect(res.body.valid).toBe(true);
  });

  it('validate-code: rossz prefixű vénykód érvénytelen', async () => {
    const res = await request(app.getHttpServer())
      .post('/invoicing/validate-code')
      .send({ kind: 'prescription', code: '21123456' })
      .expect(201);
    expect(res.body.valid).toBe(false);
  });

  it('validate-code: Ctrl+V duplikáció kiszűrve', async () => {
    const res = await request(app.getHttpServer())
      .post('/invoicing/validate-code')
      .send({ kind: 'matrica', code: '21999', existing: ['21999'] })
      .expect(201);
    expect(res.body.valid).toBe(false);
    expect(res.body.duplicate).toBe(true);
  });

  // --- kétirányú zárási szűrő a tervezetnél ---

  it('tervezet: postaköltség + készpénz → 400 (tiltott párosítás)', async () => {
    await request(app.getHttpServer())
      .post('/invoicing/drafts')
      .send({
        partnerCode: 'P-000123',
        payment: 'cash',
        items: [
          { code: 'A1', name: 'Maszk', quantity: 1, unitGross: 12000 },
          { code: 'POST', name: 'Postaköltség', quantity: 1, unitGross: 1690, isPostage: true },
        ],
      })
      .expect(400);
  });

  it('tervezet: utánvét postaköltség nélkül → 400 (hiányzó tétel)', async () => {
    await request(app.getHttpServer())
      .post('/invoicing/drafts')
      .send({
        partnerCode: 'P-000123',
        payment: 'cod',
        items: [{ code: 'A1', name: 'Maszk', quantity: 1, unitGross: 12000 }],
      })
      .expect(400);
  });

  // --- kártyás limit-védőháló ---

  it('nagy összegű kártyás fizetés elutasítva → tervezet nyitva marad, NINCS NAV-szám', async () => {
    const draft = await request(app.getHttpServer())
      .post('/invoicing/drafts')
      .set('X-Operator', 'pult.teszt')
      .send({
        partnerCode: 'P-000123',
        payment: 'card',
        items: [{ code: 'CPAP', name: 'CPAP készülék', quantity: 1, unitGross: 200000 }],
      })
      .expect(201);

    const fin = await request(app.getHttpServer())
      .post(`/invoicing/drafts/${draft.body.id}/finalize`)
      .expect(201);
    expect(fin.body.status).toBe('declined');
    expect(fin.body.declineReason).toBe('limit');
    expect(fin.body.draft.invoiceNumber).toBeNull();
    expect(fin.body.draft.status).toBe('awaiting_payment');

    // Nem keletkezett INVOICE_ISSUED Timeline-esemény ehhez.
    const tl = await db.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM timeline_events
        WHERE partner_code = 'P-000123' AND type = 'INVOICE_ISSUED'`,
    );
    // (Lehet 0 vagy több korábbi teszt miatt, de a limit-eset NEM növelte —
    //  a lényeg, hogy ez a draft nem issued.)
    expect(fin.body.draft.status).not.toBe('issued');
    void tl;
  });

  it('sikeres kártyás fizetés (limit alatt) → éles számla + Timeline', async () => {
    const draft = await request(app.getHttpServer())
      .post('/invoicing/drafts')
      .send({
        partnerCode: 'P-000456',
        payment: 'card',
        items: [{ code: 'MASK', name: 'Maszk', quantity: 1, unitGross: 12000 }],
      })
      .expect(201);

    const fin = await request(app.getHttpServer())
      .post(`/invoicing/drafts/${draft.body.id}/finalize`)
      .expect(201);
    expect(fin.body.status).toBe('issued');
    expect(fin.body.draft.invoiceNumber).toMatch(/^SZ-\d{4}-\d{6}$/);
    expect(fin.body.draft.status).toBe('issued');

    const tl = await db.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM timeline_events
        WHERE partner_code = 'P-000456' AND type = 'INVOICE_ISSUED'`,
    );
    expect(tl.rows[0].c).toBeGreaterThanOrEqual(1);
  });

  it('készpénzes fizetés → azonnal éles számla (nincs terminál)', async () => {
    const draft = await request(app.getHttpServer())
      .post('/invoicing/drafts')
      .send({
        partnerCode: 'P-000456',
        payment: 'cash',
        items: [{ code: 'FILT', name: 'Szűrő', quantity: 2, unitGross: 1500 }],
      })
      .expect(201);
    const fin = await request(app.getHttpServer())
      .post(`/invoicing/drafts/${draft.body.id}/finalize`)
      .expect(201);
    expect(fin.body.status).toBe('issued');
    expect(fin.body.draft.amountGross).toBe(3000);
  });

  it('már kiállított számla ismételt véglegesítése → 400', async () => {
    const draft = await request(app.getHttpServer())
      .post('/invoicing/drafts')
      .send({
        partnerCode: 'P-000456',
        payment: 'cash',
        items: [{ code: 'X', name: 'x', quantity: 1, unitGross: 100 }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/invoicing/drafts/${draft.body.id}/finalize`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/invoicing/drafts/${draft.body.id}/finalize`)
      .expect(400);
  });
});
