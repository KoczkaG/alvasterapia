import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataType, newDb } from 'pg-mem';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { PG_POOL } from '../src/database/pg-pool.provider';

/**
 * End-to-end teszt a hívásvégi jegyzet + statisztika modulra (I/E).
 * Ellenőrzi a jegyzetes lezárást, a Timeline CALL_NOTE eseményt, a visszahívási
 * igényből generált feladatot és a vezetői statisztikai összesítést.
 */
describe('I/E modul — Hívásvégi jegyzet és statisztika (HTTP + pg-mem)', () => {
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

  function startCall(partnerCode = 'P-000123') {
    return request(app.getHttpServer())
      .post('/calls')
      .send({
        partnerCode,
        phoneKind: 'patient_mobile',
        phoneNumber: '+36 30 123 4567',
        origin: 'counter',
      });
  }

  it('GET /calls/meta/referrers → alváslabor törzsadat', async () => {
    const res = await request(app.getHttpServer())
      .get('/calls/meta/referrers')
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('id');
    expect(res.body[0]).toHaveProperty('name');
  });

  it('jegyzetes lezárás → Timeline CALL_NOTE esemény keletkezik', async () => {
    const started = await startCall().expect(201);
    const callId = started.body.id;

    await request(app.getHttpServer())
      .post(`/calls/${callId}/complete-with-note`)
      .set('X-Operator', 'pult.teszt')
      .send({
        outcome: 'completed',
        note: {
          topics: ['maszkbeallitas', 'szerviz_garancia'],
          referrerId: 'lab_koranyi',
          summary: 'Maszkméret egyeztetve, szerviz időpont kérve.',
          followUpNeeded: false,
        },
      })
      .expect(201);

    const tl = await request(app.getHttpServer())
      .get('/timeline/P-000123')
      .expect(200);
    const note = tl.body.items.find(
      (i: { type: string }) => i.type === 'CALL_NOTE',
    );
    expect(note).toBeDefined();
    expect(note.text).toContain('Maszkbeállítás');
    expect(note.category).toBe('communication');
  });

  it('visszahívási igény → automata feladat generálódik', async () => {
    const started = await startCall('P-000456').expect(201);
    const callId = started.body.id;

    await request(app.getHttpServer())
      .post(`/calls/${callId}/complete-with-note`)
      .send({
        outcome: 'completed',
        note: {
          topics: ['panaszkezeles'],
          summary: 'Panasz rögzítve, vezető visszahívja.',
          followUpNeeded: true,
        },
      })
      .expect(201);

    const tasks = await db.query<{ c: number; partner_code: string }>(
      `SELECT count(*)::int AS c, max(partner_code) AS partner_code
         FROM tasks WHERE source = 'call_note' AND partner_code = 'P-000456'`,
    );
    expect(tasks.rows[0].c).toBe(1);
    expect(tasks.rows[0].partner_code).toBe('P-000456');
  });

  it('nincs visszahívási igény → nem generál feladatot', async () => {
    const before = await db.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM tasks WHERE source = 'call_note'`,
    );
    const started = await startCall('P-000456').expect(201);
    await request(app.getHttpServer())
      .post(`/calls/${started.body.id}/complete-with-note`)
      .send({
        outcome: 'completed',
        note: {
          topics: ['rendeles_leadas'],
          summary: 'Rendelés rögzítve.',
          followUpNeeded: false,
        },
      })
      .expect(201);
    const after = await db.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM tasks WHERE source = 'call_note'`,
    );
    expect(after.rows[0].c).toBe(before.rows[0].c); // nem nőtt
  });

  it('érvénytelen jegyzet (üres témák) → 400', async () => {
    const started = await startCall().expect(201);
    await request(app.getHttpServer())
      .post(`/calls/${started.body.id}/complete-with-note`)
      .send({
        outcome: 'completed',
        note: { topics: [], summary: 'x', followUpNeeded: false },
      })
      .expect(400);
  });

  it('érvénytelen jegyzet (hiányzó összefoglaló) → 400', async () => {
    const started = await startCall().expect(201);
    await request(app.getHttpServer())
      .post(`/calls/${started.body.id}/complete-with-note`)
      .send({
        outcome: 'completed',
        note: { topics: ['szamlazas'], summary: '', followUpNeeded: false },
      })
      .expect(400);
  });

  it('GET /admin/call-stats → összesítés téma-bontással és labor-rangsorral', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/call-stats')
      .expect(200);
    expect(res.body.totalNotes).toBeGreaterThanOrEqual(3);
    // A korábbi tesztek rögzítettek maszkbeallitas, panaszkezeles, rendeles_leadas témát.
    const topics = res.body.topicBreakdown.map(
      (t: { topic: string }) => t.topic,
    );
    expect(topics).toContain('panaszkezeles');
    // A lab_koranyi legalább egyszer szerepel a rangsorban.
    const refs = res.body.referrerRanking.map(
      (r: { referrerId: string }) => r.referrerId,
    );
    expect(refs).toContain('lab_koranyi');
    // Van legalább egy visszahívási igény.
    expect(res.body.followUpCount).toBeGreaterThanOrEqual(1);
  });
});
