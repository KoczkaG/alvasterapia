import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataType, newDb } from 'pg-mem';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { PG_POOL } from '../src/database/pg-pool.provider';

/**
 * End-to-end teszt az Adónem-váltási Adatvédelemre és a duplikáció-védelemre
 * (II/A): valós HTTP-végpontok pg-mem fölött. Fókusz: céges vevő a bizonylaton,
 * EP+céges kizárás, idempotencia-kulcs (nincs számla-duplikáció).
 */
describe('II/A modul — Adónem-váltás és duplikáció-védelem (HTTP + pg-mem)', () => {
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

  const corp = {
    name: 'Példa Kft.',
    address: '1051 Budapest, Fő utca 1.',
    taxNumber: '12345678-2-42',
  };

  it('céges vevő → a számla a cégre szól (név + székhely + adószám)', async () => {
    const draft = await request(app.getHttpServer())
      .post('/invoicing/drafts')
      .send({
        partnerCode: 'P-000123',
        payment: 'cash',
        items: [{ code: 'MASK', name: 'Maszk', quantity: 1, unitGross: 12000 }],
        corporate: corp,
      })
      .expect(201);

    expect(draft.body.payee).not.toBeNull();
    expect(draft.body.payee.name).toBe('Példa Kft.');
    expect(draft.body.payee.taxNumber).toBe('12345678-2-42');
    expect(draft.body.payee.address).toContain('Fő utca 1.');
  });

  it('a beteg KVL-profilja nem módosul céges számlázáskor (adatmegőrzés)', async () => {
    await request(app.getHttpServer())
      .post('/invoicing/drafts')
      .send({
        partnerCode: 'P-000123',
        payment: 'cash',
        items: [{ code: 'X', name: 'x', quantity: 1, unitGross: 100 }],
        corporate: corp,
      })
      .expect(201);

    // A partner továbbra is a saját nevén/címén kérdezhető le a KVL-ből.
    const search = await request(app.getHttpServer())
      .get('/patients/search?partnerCode=P-000123')
      .expect(200);
    expect(search.body.partner.name).toBe('Kovács Lajosné');
    expect(search.body.partner.address).toBe('Lakatos utca 22.');
  });

  it('EP + céges egyszerre → 400 (kizárják egymást)', async () => {
    await request(app.getHttpServer())
      .post('/invoicing/drafts')
      .send({
        partnerCode: 'P-000123',
        payment: 'cash',
        items: [{ code: 'X', name: 'x', quantity: 1, unitGross: 100 }],
        corporate: corp,
        ep: { fundId: 'otp', membershipId: '123' },
      })
      .expect(400);
  });

  it('rossz formátumú adószám → 400', async () => {
    await request(app.getHttpServer())
      .post('/invoicing/drafts')
      .send({
        partnerCode: 'P-000123',
        payment: 'cash',
        items: [{ code: 'X', name: 'x', quantity: 1, unitGross: 100 }],
        corporate: { ...corp, taxNumber: '123' },
      })
      .expect(400);
  });

  it('idempotencia-kulcs: ugyanaz a kulcs → ugyanaz a tervezet (nincs duplikáció)', async () => {
    const key = 'order-2026-0001';
    const first = await request(app.getHttpServer())
      .post('/invoicing/drafts')
      .send({
        partnerCode: 'P-000456',
        payment: 'cod',
        items: [
          { code: 'X', name: 'x', quantity: 1, unitGross: 100 },
          { code: 'POST', name: 'Postaköltség', quantity: 1, unitGross: 1690, isPostage: true },
        ],
        idempotencyKey: key,
      })
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/invoicing/drafts')
      .send({
        partnerCode: 'P-000456',
        payment: 'cod',
        items: [
          { code: 'X', name: 'x', quantity: 1, unitGross: 100 },
          { code: 'POST', name: 'Postaköltség', quantity: 1, unitGross: 1690, isPostage: true },
        ],
        idempotencyKey: key,
      })
      .expect(201);

    // Ugyanazt a tervezetet kaptuk vissza.
    expect(second.body.id).toBe(first.body.id);

    // Az adatbázisban tényleg csak EGY tervezet van ehhez a kulcshoz.
    const count = await db.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM invoice_drafts WHERE idempotency_key = $1`,
      [key],
    );
    expect(count.rows[0].c).toBe(1);
  });
});
