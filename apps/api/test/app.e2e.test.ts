import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataType, newDb } from 'pg-mem';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PG_POOL } from '../src/database/pg-pool.provider';

/**
 * Valódi end-to-end teszt: a teljes NestJS alkalmazást elindítja egy memóriában
 * futó PostgreSQL (pg-mem) fölött, és a HTTP-végpontokon keresztül ellenőrzi az
 * I/A folyamatot (irányítószám-feloldás, régi ügyfél előhívás, adatlap-beküldés,
 * "Zéró Hozzájárulás" parkoltatás). A séma a valódi schema.sql-ből fut le.
 */
describe('I/A modul — end-to-end (HTTP + pg-mem)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const db = newDb();
    // A schema.sql által használt PG-függvények regisztrálása pg-mem-ben.
    db.public.registerFunction({
      name: 'gen_random_uuid',
      returns: DataType.uuid,
      implementation: () => crypto.randomUUID(),
      impure: true,
    });
    db.registerExtension('pgcrypto', () => {});

    const pgMemPg = db.adapters.createPg();
    const pool = new pgMemPg.Pool();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PG_POOL)
      .useValue(pool)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /health → ok', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /postal-codes/1145 → Budapest', async () => {
    const res = await request(app.getHttpServer())
      .get('/postal-codes/1145')
      .expect(200);
    expect(res.body.city).toBe('Budapest');
  });

  it('GET /postal-codes/0000 → 404', async () => {
    await request(app.getHttpServer()).get('/postal-codes/0000').expect(404);
  });

  it('GET /patients/search születési dátummal → megtalálja a régi ügyfelet', async () => {
    const res = await request(app.getHttpServer())
      .get('/patients/search?birthDate=1956-03-22')
      .expect(200);
    expect(res.body.matchType).toBe('single');
    expect(res.body.partner.name).toBe('Kovács Lajosné');
  });

  it('POST /patients/form (teljes hozzájárulás) → partner létrejön, nincs parkoltatás', async () => {
    const res = await request(app.getHttpServer())
      .post('/patients/form?channel=online')
      .send({
        name: 'Teszt Elek',
        birthDate: '1980-01-15',
        zip: '1145',
        city: 'Budapest',
        address: 'Teszt utca 1.',
        marketing: {
          kihordasiIdoTajekoztatas: true,
          hirlevel: true,
          postaiKuldemeny: true,
          emailKuldemeny: true,
        },
      })
      .expect(201);
    expect(res.body.partnerCode).toMatch(/^P-\d{6}$/);
    expect(res.body.parked).toBe(false);
  });

  it('POST /patients/form (Zéró Hozzájárulás) → parkoltatás indul', async () => {
    const res = await request(app.getHttpServer())
      .post('/patients/form?channel=kiosk')
      .send({
        name: 'Zéró Zoltán',
        birthDate: '1975-05-05',
        zip: '4025',
        city: 'Debrecen',
        address: 'Piac utca 1.',
        marketing: {
          kihordasiIdoTajekoztatas: true,
          hirlevel: false,
          postaiKuldemeny: false,
          emailKuldemeny: false,
        },
      })
      .expect(201);
    expect(res.body.parked).toBe(true);
    expect(res.body.parkedUntil).toBeDefined();
  });

  it('POST /patients/form érvénytelen adattal → 400', async () => {
    await request(app.getHttpServer())
      .post('/patients/form')
      .send({ name: 'X', zip: '12' }) // hiányos/hibás
      .expect(400);
  });

  it('a beküldés után létrejött az audit-bejegyzés és a hozzájárulás', async () => {
    // Egy friss beküldés, majd DB-ellenőrzés a séma tábláin keresztül.
    await request(app.getHttpServer())
      .post('/patients/form?channel=online')
      .send({
        name: 'Napló Nóra',
        birthDate: '1990-09-09',
        zip: '1052',
        city: 'Budapest',
        address: 'Váci utca 1.',
        marketing: {
          kihordasiIdoTajekoztatas: false,
          hirlevel: false,
          postaiKuldemeny: true,
          emailKuldemeny: false,
        },
      })
      .expect(201);

    // A DatabaseService-en keresztül lekérdezzük a consents és audit_log tábla méretét.
    const dbSvc = app.get(
      // lazy import elkerülése végett a class tokent használjuk
      (await import('../src/database/database.service')).DatabaseService,
    );
    const consents = await dbSvc.query('SELECT count(*)::int AS c FROM consents');
    const audit = await dbSvc.query('SELECT count(*)::int AS c FROM audit_log');
    expect(consents.rows[0].c).toBeGreaterThan(0);
    expect(audit.rows[0].c).toBeGreaterThan(0);
  });
});
