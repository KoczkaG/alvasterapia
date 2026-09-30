import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataType, newDb } from 'pg-mem';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PG_POOL } from '../src/database/pg-pool.provider';

/**
 * End-to-end teszt az „ADATLAP HIÁNYOS" protokollra (I/F). A KVL-mock szerint a
 * P-000123 (Kovács Lajosné) hiányos: nincs email/mobil — ezen demózható az
 * ellenőrzés, az "A" helyszíni frissítés és a "B" tokenes önkiszolgáló út.
 */
describe('I/F modul — Adatlap hiányos protokoll (HTTP + pg-mem)', () => {
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

  it('GET /completeness/:pc → jelzi a hiányzó mezőket (P-000123: nincs email/mobil)', async () => {
    const res = await request(app.getHttpServer())
      .get('/completeness/P-000123')
      .expect(200);
    expect(res.body.complete).toBe(false);
    expect(res.body.missing).toContain('email');
    expect(res.body.missing).toContain('mobile');
  });

  it('ismeretlen partner → 404', async () => {
    await request(app.getHttpServer())
      .get('/completeness/P-999999')
      .expect(404);
  });

  it('"A" opció: helyszíni frissítés után az adatlap teljessé válik', async () => {
    // P-000456 (Nagy István) teljes; töltsünk P-000123-at hiánypótlással.
    const res = await request(app.getHttpServer())
      .post('/completeness/P-000123/update')
      .set('X-Operator', 'pult.teszt')
      .send({ email: 'kovacs.uj@example.com', mobile: '+36 30 000 1111' })
      .expect(201);
    // A TAJ már megvolt a mockban → most teljes.
    expect(res.body.missing).not.toContain('email');
    expect(res.body.missing).not.toContain('mobile');
    expect(res.body.complete).toBe(true);
  });

  it('"B" opció: tokenes link generálás → feloldás → beküldés → token elhasználódik', async () => {
    // Előbb visszaállítunk egy hiányos állapotot egy másik hívással nem tudunk,
    // ezért a "B" utat a jelenlegi (immár teljes) P-000123-on is teszteljük:
    // a link generálása és a token-életciklus a lényeg.
    const link = await request(app.getHttpServer())
      .post('/completeness/P-000123/link')
      .set('X-Operator', 'pult.teszt')
      .expect(201);
    expect(link.body.token).toBeTruthy();
    expect(link.body.url).toContain(link.body.token);

    const token = link.body.token;

    // A betegoldali felület feloldja a tokent.
    const resolved = await request(app.getHttpServer())
      .get(`/self-service/${token}`)
      .expect(200);
    expect(resolved.body.partnerCode).toBe('P-000123');
    expect(Array.isArray(resolved.body.missing)).toBe(true);

    // A beteg beküldi az adatot → webshopos záró üzenet.
    const submit = await request(app.getHttpServer())
      .post(`/self-service/${token}`)
      .send({ email: 'ujabb@example.com' })
      .expect(201);
    expect(submit.body.ok).toBe(true);
    expect(submit.body.marketingMessage).toContain('Webáruház');
    expect(submit.body.webshopUrl).toBeTruthy();

    // A token egyszer használatos → második beküldés elutasítva.
    await request(app.getHttpServer())
      .post(`/self-service/${token}`)
      .send({ email: 'megegyszer@example.com' })
      .expect(400);
  });

  it('ismeretlen token feloldása → 404', async () => {
    await request(app.getHttpServer())
      .get('/self-service/nemletezo-token')
      .expect(404);
  });

  it('önkiszolgáló beküldés üres adattal → 400', async () => {
    const link = await request(app.getHttpServer())
      .post('/completeness/P-000123/link')
      .expect(201);
    await request(app.getHttpServer())
      .post(`/self-service/${link.body.token}`)
      .send({})
      .expect(400);
  });
});
