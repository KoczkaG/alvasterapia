import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataType, newDb } from 'pg-mem';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { PG_POOL } from '../src/database/pg-pool.provider';

/**
 * End-to-end teszt a Próbakezelési Szerződés-modulra (III. Modul / A): valós
 * HTTP-végpontok pg-mem fölött. Fókusz: OCR-beemelés, GDPR-kapu kényszerítés,
 * kosár, fizetés, SMS-kódos és papíralapú aláírás, lezárás (PDF + jótállás +
 * Timeline), és a beteg KVL-profil érintetlensége.
 */
describe('III/A modul — Szerződés-modul (HTTP + pg-mem)', () => {
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

  const patient = {
    name: 'Nagy István',
    taj: '987654321',
    zip: '4025',
    city: 'Debrecen',
    address: 'Piac utca 5.',
    doctorName: 'Dr. Kiss Péter',
    doctorStamp: '11223',
    pressure: 11,
  };

  const items = [
    { productType: 'keszulek', name: 'Prisma Smart Plus', serialNumber: 'PSP-1001', deposit: 50000, price: 0 },
    { productType: 'szuro', name: 'Baktériumszűrő', deposit: 0, price: 3000 },
    { productType: 'szuro', name: 'Baktériumszűrő', deposit: 0, price: 3000 },
  ];

  async function newContract(partnerCode = 'P-000456') {
    const res = await request(app.getHttpServer())
      .post('/contracts')
      .set('X-Operator', 'pultos.demo')
      .send({ partnerCode, patient, purchaseDate: '2026-09-30' })
      .expect(201);
    return res.body.id as string;
  }

  it('OCR: az ambuláns lap kiolvasása strukturált adattá', async () => {
    const res = await request(app.getHttpServer())
      .post('/contracts/scan')
      .send({ documentRef: 'ambulans-demo-1' })
      .expect(201);
    expect(res.body.name).toBe('Kovács Lajosné');
    expect(res.body.pressure).toBe(9.5);
  });

  it('OCR: ismeretlen lap → 400', async () => {
    await request(app.getHttpServer())
      .post('/contracts/scan')
      .send({ documentRef: 'nincs-ilyen' })
      .expect(400);
  });

  it('GDPR-kapu: kosár nem nyitható a hozzájárulás előtt', async () => {
    const id = await newContract();
    // draft → cart tiltott (a GDPR lépés kimaradt)
    await request(app.getHttpServer())
      .post(`/contracts/${id}/cart`)
      .send({ items })
      .expect(400);
  });

  it('teljes folyamat: draft → gdpr → kosár → fizetés → SMS-aláírás → lezárás', async () => {
    const id = await newContract();

    await request(app.getHttpServer())
      .post(`/contracts/${id}/consent`)
      .send({ wearTimeInfo: true, newsletter: true, postalContact: true, emailContact: true })
      .expect(201);

    const cart = await request(app.getHttpServer())
      .post(`/contracts/${id}/cart`)
      .send({ items })
      .expect(201);
    expect(cart.body.grandTotal).toBe(56000);
    expect(cart.body.status).toBe('cart');

    const pay = await request(app.getHttpServer())
      .post(`/contracts/${id}/pay`)
      .expect(201);
    expect(pay.body.status).toBe('paid');

    // SMS-aláírás: P-000456 rendelkezik mobillal a KVL-mockban.
    const chg = await request(app.getHttpServer())
      .post(`/contracts/${id}/sign/sms`)
      .expect(201);
    expect(chg.body.challengeId).toBeTruthy();

    // Hibás kód → 400
    await request(app.getHttpServer())
      .post(`/contracts/${id}/sign/sms/confirm`)
      .send({ challengeId: chg.body.challengeId, code: '0000' })
      .expect(400);

    // Helyes demó-kód (mock: 4321)
    const signed = await request(app.getHttpServer())
      .post(`/contracts/${id}/sign/sms/confirm`)
      .send({ challengeId: chg.body.challengeId, code: '4321' })
      .expect(201);
    expect(signed.body.status).toBe('signed');
    expect(signed.body.signatureMethod).toBe('sms');

    const closed = await request(app.getHttpServer())
      .post(`/contracts/${id}/close`)
      .expect(201);
    expect(closed.body.status).toBe('closed');
    expect(closed.body.contractPdfUri).toContain('szerzodes.pdf');
    // A készülékre (SN van) 2 év jótállás készül; a szűrőkre nincs SN → nincs jegy.
    expect(closed.body.warrantyDocs).toHaveLength(1);
    expect(closed.body.warrantyDocs[0].warrantyExpiry).toBe('2028-09-30');
  });

  it('a lezárás a beteg Idővonalára ír (CONTRACT_SIGNED)', async () => {
    const ev = await db.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM timeline_events
        WHERE partner_code = $1 AND type = 'CONTRACT_SIGNED'`,
      ['P-000456'],
    );
    expect(ev.rows[0].c).toBeGreaterThanOrEqual(1);
  });

  it('a beteg KVL-profilja nem módosul a szerződéskötéstől', async () => {
    const search = await request(app.getHttpServer())
      .get('/patients/search?partnerCode=P-000456')
      .expect(200);
    expect(search.body.partner.name).toBe('Nagy István');
    expect(search.body.partner.city).toBe('Debrecen');
  });

  it('papíralapú aláírás ága (nincs mobil): P-000123', async () => {
    // P-000123 (Kovács Lajosné) mobilja null → SMS-aláírás nem indítható.
    const id = await newContract('P-000123');
    await request(app.getHttpServer())
      .post(`/contracts/${id}/consent`)
      .send({ wearTimeInfo: true, newsletter: false, postalContact: false, emailContact: false })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/contracts/${id}/cart`)
      .send({ items: [{ productType: 'maszk', name: 'JOYCEeasy', deposit: 10000, price: 0 }] })
      .expect(201);
    await request(app.getHttpServer()).post(`/contracts/${id}/pay`).expect(201);

    // Nincs mobil → SMS-kihívás 400
    await request(app.getHttpServer())
      .post(`/contracts/${id}/sign/sms`)
      .expect(400);

    // Papíralapú aláírás megy
    const signed = await request(app.getHttpServer())
      .post(`/contracts/${id}/sign/paper`)
      .expect(201);
    expect(signed.body.signatureMethod).toBe('paper');

    const closed = await request(app.getHttpServer())
      .post(`/contracts/${id}/close`)
      .expect(201);
    // A maszkon nincs SN → nincs jótállási jegy.
    expect(closed.body.warrantyDocs).toHaveLength(0);
  });

  it('kártyás elutasítás (>150000 Ft limit) → nem lép tovább, újrapróbálható', async () => {
    const id = await newContract();
    await request(app.getHttpServer())
      .post(`/contracts/${id}/consent`)
      .send({ wearTimeInfo: true, newsletter: false, postalContact: true, emailContact: true })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/contracts/${id}/cart`)
      .send({ items: [{ productType: 'keszulek', name: 'BiPAP', serialNumber: 'BP-1', deposit: 200000, price: 0 }] })
      .expect(201);

    const pay = await request(app.getHttpServer())
      .post(`/contracts/${id}/pay`)
      .expect(201);
    expect(pay.body.status).toBe('declined');

    // A szerződés cart állapotban maradt (nincs adatvesztés).
    const check = await request(app.getHttpServer())
      .get(`/contracts/${id}`)
      .expect(200);
    expect(check.body.status).toBe('cart');
  });
});
