import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataType, newDb } from 'pg-mem';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PG_POOL } from '../src/database/pg-pool.provider';

/**
 * End-to-end teszt a Nyitvatartási Naptár Modulra (I/B): valós HTTP-végpontok
 * memóriában futó PostgreSQL (pg-mem) fölött, a tényleges séma alkalmazásával.
 */
describe('I/B modul — Nyitvatartási naptár (HTTP + pg-mem)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const db = newDb();
    db.public.registerFunction({
      name: 'gen_random_uuid',
      returns: DataType.uuid,
      implementation: () => crypto.randomUUID(),
      impure: true,
    });
    db.public.registerFunction({
      name: 'to_char',
      args: [DataType.timestamp, DataType.text],
      returns: DataType.text,
      // A teszt csak 'YYYY-MM-DD'-t használ; egyszerű, elégséges implementáció.
      implementation: (d: Date) => {
        if (!(d instanceof Date)) d = new Date(d as unknown as string);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      },
    });

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

  it('GET /opening/calendar → az alapértelmezett heti rendet adja', async () => {
    const res = await request(app.getHttpServer())
      .get('/opening/calendar')
      .expect(200);
    // hétfő (1) 08:00–17:00, hétvége zárva
    expect(res.body.weekly['1']).toEqual([{ open: '08:00', close: '17:00' }]);
    expect(res.body.weekly['6']).toEqual([]);
    expect(res.body.overrides).toEqual([]);
  });

  it('GET /opening/status → konzisztens open + next mezők', async () => {
    const res = await request(app.getHttpServer())
      .get('/opening/status')
      .expect(200);
    expect(res.body).toHaveProperty('open');
    expect(res.body).toHaveProperty('today');
    expect(res.body.now).toHaveProperty('date');
    expect(res.body.now).toHaveProperty('time');
  });

  it('PUT /admin/opening/overrides → ünnepnapi zárás felvétele', async () => {
    const res = await request(app.getHttpServer())
      .put('/admin/opening/overrides')
      .send({
        date: '2026-08-20',
        kind: 'closed',
        label: 'Államalapítás ünnepe',
      })
      .expect(200);
    const holiday = res.body.overrides.find(
      (o: { date: string }) => o.date === '2026-08-20',
    );
    expect(holiday).toBeDefined();
    expect(holiday.kind).toBe('closed');
  });

  it('PUT /admin/opening/overrides → ledolgozós szombat (custom) felvétele', async () => {
    const res = await request(app.getHttpServer())
      .put('/admin/opening/overrides')
      .send({
        date: '2026-08-22', // szombat
        kind: 'custom',
        label: 'Ledolgozós szombat',
        ranges: [{ open: '08:00', close: '14:00' }],
      })
      .expect(200);
    const sat = res.body.overrides.find(
      (o: { date: string }) => o.date === '2026-08-22',
    );
    expect(sat.ranges).toEqual([{ open: '08:00', close: '14:00' }]);
  });

  it('érvénytelen felülírás (custom ranges nélkül) → 400', async () => {
    await request(app.getHttpServer())
      .put('/admin/opening/overrides')
      .send({ date: '2026-08-25', kind: 'custom', label: 'Hiányos' })
      .expect(400);
  });

  it('DELETE /admin/opening/overrides/:date → felülírás törlése', async () => {
    await request(app.getHttpServer())
      .delete('/admin/opening/overrides/2026-08-22')
      .expect(200);
    const res = await request(app.getHttpServer())
      .get('/opening/calendar')
      .expect(200);
    const stillThere = res.body.overrides.find(
      (o: { date: string }) => o.date === '2026-08-22',
    );
    expect(stillThere).toBeUndefined();
  });

  it('GET /admin/opening/holiday-suggestions/2026 → magyar munkaszüneti napok', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/opening/holiday-suggestions/2026')
      .expect(200);
    const dates = res.body.map((o: { date: string }) => o.date);
    expect(dates).toContain('2026-08-20'); // Államalapítás
    expect(dates).toContain('2026-04-06'); // Húsvéthétfő
    expect(res.body.every((o: { kind: string }) => o.kind === 'closed')).toBe(
      true,
    );
  });

  it('GET /admin/opening/holiday-suggestions/rossz → 400', async () => {
    await request(app.getHttpServer())
      .get('/admin/opening/holiday-suggestions/1000')
      .expect(400);
  });

  it('PUT /admin/opening/weekly → heti rend módosítása és visszaolvasása', async () => {
    const newWeekly = {
      0: [],
      1: [{ open: '09:00', close: '17:00' }],
      2: [{ open: '09:00', close: '17:00' }],
      3: [{ open: '09:00', close: '17:00' }],
      4: [{ open: '09:00', close: '18:00' }],
      5: [{ open: '09:00', close: '15:00' }],
      6: [],
    };
    const res = await request(app.getHttpServer())
      .put('/admin/opening/weekly')
      .send(newWeekly)
      .expect(200);
    expect(res.body.weekly['1']).toEqual([{ open: '09:00', close: '17:00' }]);
  });
});
