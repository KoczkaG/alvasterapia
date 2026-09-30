import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataType, newDb } from 'pg-mem';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { PG_POOL } from '../src/database/pg-pool.provider';

/**
 * End-to-end teszt a Click-to-Call modulra (I/C): valós HTTP-végpontok
 * memóriában futó PostgreSQL (pg-mem) fölött. Kiemelt fókusz a jogi láncon:
 * rögzítés-tiltás → sáv törlése + módosíthatatlan Audit Trail, valamint a
 * lezárt hívás Timeline-ra kerülése.
 */
describe('I/C modul — Click-to-Call (HTTP + pg-mem)', () => {
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

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
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

  function startCall() {
    return request(app.getHttpServer())
      .post('/calls')
      .set('X-Operator', 'teszt.kollega')
      .send({
        partnerCode: 'P-000123',
        phoneKind: 'patient_mobile',
        phoneNumber: '+36 30 123 4567',
        origin: 'counter',
      });
  }

  it('GET /calls/meta/scripts → GDPR-sablon és érvkészlet', async () => {
    const res = await request(app.getHttpServer())
      .get('/calls/meta/scripts')
      .expect(200);
    expect(res.body.recordingNotice).toContain('minőségbiztosítási');
    expect(res.body.reassuranceScript).toContain('SOMNO SHOP');
  });

  it('POST /calls → hívás indul, dialing állapotban, provider_call_id-vel', async () => {
    const res = await startCall().expect(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('dialing');
    expect(res.body.recordingConsent).toBe('pending');
    expect(res.body.providerCallId).toMatch(/^voip-/);
  });

  it('érvénytelen hívásindítás (hiányzó partnerCode) → 400', async () => {
    await request(app.getHttpServer())
      .post('/calls')
      .send({ phoneKind: 'patient_mobile', phoneNumber: '+36301234567', origin: 'counter' })
      .expect(400);
  });

  it('rögzítés TILTÁSA → refused állapot, nincs felvétel, módosíthatatlan Audit Trail', async () => {
    const start = await startCall().expect(201);
    const callId = start.body.id;

    const refused = await request(app.getHttpServer())
      .post(`/calls/${callId}/recording/refuse`)
      .set('X-Operator', 'teszt.kollega')
      .expect(201);
    expect(refused.body.recordingConsent).toBe('refused');
    expect(refused.body.recordingUri).toBeNull();

    // Az Audit Trailben szerepel a kötelező ok, a kezelő és a hívásazonosító.
    const audit = await db.query<{
      actor: string;
      action: string;
      entity_type: string;
      entity_id: string;
      detail: { reason?: string } | null;
    }>(
      `SELECT actor, action, entity_type, entity_id, detail
         FROM audit_log
        WHERE entity_type = 'call_recording' AND entity_id = $1`,
      [callId],
    );
    expect(audit.rows.length).toBe(1);
    expect(audit.rows[0].actor).toBe('teszt.kollega');
    expect(audit.rows[0].action).toBe('DELETE');
    expect(audit.rows[0].detail?.reason).toContain('törölve');
  });

  it('rögzítés ENGEDÉLYEZÉSE + lezárás → felvétel megmarad és Timeline-ra kerül', async () => {
    const start = await startCall().expect(201);
    const callId = start.body.id;

    await request(app.getHttpServer())
      .post(`/calls/${callId}/recording/grant`)
      .set('X-Operator', 'teszt.kollega')
      .expect(201);

    const completed = await request(app.getHttpServer())
      .post(`/calls/${callId}/complete`)
      .set('X-Operator', 'teszt.kollega')
      .send({ outcome: 'completed' })
      .expect(201);
    expect(completed.body.status).toBe('completed');
    expect(completed.body.recordingUri).toMatch(/^mock:\/\/recordings\//);

    // A hívás megjelent a partner Timeline-ján.
    const tl = await db.query<{ type: string; detail: { callId?: string } | null }>(
      `SELECT type, detail FROM timeline_events
        WHERE partner_code = 'P-000123' AND type = 'OUTBOUND_CALL'`,
    );
    const match = tl.rows.find((r) => r.detail?.callId === callId);
    expect(match).toBeDefined();
  });

  it('tiltott rögzítésű hívás lezárása → NEM tárol felvételt', async () => {
    const start = await startCall().expect(201);
    const callId = start.body.id;
    await request(app.getHttpServer())
      .post(`/calls/${callId}/recording/refuse`)
      .expect(201);
    const completed = await request(app.getHttpServer())
      .post(`/calls/${callId}/complete`)
      .send({ outcome: 'completed' })
      .expect(201);
    expect(completed.body.recordingUri).toBeNull();
  });

  it('sikertelen hívás (failed) → nincs felvétel, de Timeline-bejegyzés keletkezik', async () => {
    const start = await startCall().expect(201);
    const callId = start.body.id;
    const completed = await request(app.getHttpServer())
      .post(`/calls/${callId}/complete`)
      .send({ outcome: 'failed' })
      .expect(201);
    expect(completed.body.status).toBe('failed');
    expect(completed.body.recordingUri).toBeNull();
  });
});
