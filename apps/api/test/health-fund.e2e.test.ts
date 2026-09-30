import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataType, newDb } from 'pg-mem';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PG_POOL } from '../src/database/pg-pool.provider';

/**
 * End-to-end teszt az Egészségpénztári (EP) Adatkapura (II/B): valós
 * HTTP-végpontok pg-mem fölött. Fókusz: EP-törzsadat, automata hierarchikus
 * névsorrend, könnyített vs. szigorú EP vevőadat, és hogy a beteg profilja
 * NEM módosul (a Riasztó/Zászló csak a bizonylat vevő-adatát állítja).
 */
describe('II/B modul — EP Adatkapu és Automata Számlakép (HTTP + pg-mem)', () => {
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

  it('GET /invoicing/health-funds → EP-törzsadat, strict jelzéssel', async () => {
    const res = await request(app.getHttpServer())
      .get('/invoicing/health-funds')
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    const strict = res.body.find((f: { strict: boolean }) => f.strict);
    expect(strict).toBeDefined();
    expect(strict.taxNumber).toBeTruthy();
  });

  it('könnyített EP: a számla a beteg lakcímére szól, összefűzött NÉV mezővel', async () => {
    // P-000123 = Kovács Lajosné, 1145 Budapest, Lakatos utca 22.
    const draft = await request(app.getHttpServer())
      .post('/invoicing/drafts')
      .send({
        partnerCode: 'P-000123',
        payment: 'cash',
        items: [{ code: 'MASK', name: 'Maszk', quantity: 1, unitGross: 12000 }],
        ep: { fundId: 'otp', membershipId: '123456', beneficiaryName: 'Kovács Lajos' },
      })
      .expect(201);

    expect(draft.body.payee).not.toBeNull();
    expect(draft.body.payee.name).toContain('Kovács Lajosné');
    expect(draft.body.payee.name).toContain('OTP');
    expect(draft.body.payee.name).toContain('Kedvezményezett: Kovács Lajos');
    expect(draft.body.payee.name).toContain('Tagi azonosító: 123456');
    // Könnyített EP → a beteg lakcíme, nincs adószám.
    expect(draft.body.payee.address).toContain('Lakatos utca 22.');
    expect(draft.body.payee.taxNumber).toBeUndefined();
  });

  it('szigorú EP: az EP székhelye + adószáma kerül a vevőadatba', async () => {
    const draft = await request(app.getHttpServer())
      .post('/invoicing/drafts')
      .send({
        partnerCode: 'P-000123',
        payment: 'cash',
        items: [{ code: 'MASK', name: 'Maszk', quantity: 1, unitGross: 12000 }],
        ep: { fundId: 'strict_demo', membershipId: '999' },
      })
      .expect(201);

    expect(draft.body.payee.address).toContain('Példa utca 1.');
    expect(draft.body.payee.taxNumber).toBe('12345678-2-42');
    // A NÉV mező akkor is a beteg + EP hierarchia.
    expect(draft.body.payee.name).toContain('Kovács Lajosné');
  });

  it('ismeretlen EP → 400', async () => {
    await request(app.getHttpServer())
      .post('/invoicing/drafts')
      .send({
        partnerCode: 'P-000123',
        payment: 'cash',
        items: [{ code: 'X', name: 'x', quantity: 1, unitGross: 100 }],
        ep: { fundId: 'nemletezo', membershipId: '1' },
      })
      .expect(400);
  });

  it('EP-számla véglegesítése → éles számla, a payee megmarad', async () => {
    const draft = await request(app.getHttpServer())
      .post('/invoicing/drafts')
      .send({
        partnerCode: 'P-000123',
        payment: 'cash',
        items: [{ code: 'MASK', name: 'Maszk', quantity: 1, unitGross: 12000 }],
        ep: { fundId: 'medicina', membershipId: '777' },
      })
      .expect(201);

    const fin = await request(app.getHttpServer())
      .post(`/invoicing/drafts/${draft.body.id}/finalize`)
      .expect(201);
    expect(fin.body.status).toBe('issued');
    expect(fin.body.draft.payee.name).toContain('MEDICINA');
    expect(fin.body.draft.invoiceNumber).toMatch(/^SZ-/);
  });

  it('EP nélküli számla → payee null (sima magánszemély)', async () => {
    const draft = await request(app.getHttpServer())
      .post('/invoicing/drafts')
      .send({
        partnerCode: 'P-000456',
        payment: 'cash',
        items: [{ code: 'X', name: 'x', quantity: 1, unitGross: 100 }],
      })
      .expect(201);
    expect(draft.body.payee).toBeNull();
  });
});
