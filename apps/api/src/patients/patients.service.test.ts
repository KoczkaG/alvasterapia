import { beforeEach, describe, expect, it } from 'vitest';
import type { PatientForm } from '@somnoshop/shared';
import { AuditService } from '../audit/audit.service';
import type { DatabaseService } from '../database/database.service';
import { KvlMockAdapter } from '../kvl/kvl.mock';
import { PatientsService, type SubmissionContext } from './patients.service';

/**
 * Memóriában futó, minimál DatabaseService-utánzat. Rögzíti a lefuttatott
 * INSERT-eket, hogy a teszt ellenőrizhesse a flow-t (hozzájárulás, parkoltatás,
 * audit-bejegyzések). A RETURNING id-t determinisztikus UUID-vel adja vissza.
 */
class FakeDb {
  public queries: { text: string; params?: unknown[] }[] = [];
  private idSeq = 0;

  async query(text: string, params?: unknown[]) {
    this.queries.push({ text, params });
    if (/INSERT INTO form_submissions/.test(text) && /RETURNING id/.test(text)) {
      return { rows: [{ id: `sub-${++this.idSeq}` }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  countInserts(table: string): number {
    return this.queries.filter((q) =>
      new RegExp(`INSERT INTO ${table}`).test(q.text),
    ).length;
  }

  countAudit(action: string, entityType: string): number {
    return this.queries.filter(
      (q) =>
        /INSERT INTO audit_log/.test(q.text) &&
        (q.params?.[1] === action) &&
        (q.params?.[2] === entityType),
    ).length;
  }
}

const ctx: SubmissionContext = {
  channel: 'online',
  ip: '10.0.0.5',
  userAgent: 'vitest',
};

function baseForm(overrides: Partial<PatientForm> = {}): PatientForm {
  return {
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
    ...overrides,
  };
}

describe('PatientsService — adatlap-beküldés (I/A)', () => {
  let db: FakeDb;
  let service: PatientsService;

  beforeEach(() => {
    db = new FakeDb();
    const audit = new AuditService(db as unknown as DatabaseService);
    const kvl = new KvlMockAdapter();
    service = new PatientsService(
      db as unknown as DatabaseService,
      audit,
      kvl,
    );
  });

  it('új páciensnél KVL-partnert hoz létre és rögzíti a hozzájárulást', async () => {
    const result = await service.submitForm(baseForm(), ctx);

    expect(result.partnerCode).toMatch(/^P-\d{6}$/);
    expect(result.parked).toBe(false);
    // pontosan egy hozzájárulási bejegyzés keletkezett
    expect(db.countInserts('consents')).toBe(1);
    // nem indult parkoltatás
    expect(db.countInserts('parked_documents')).toBe(0);
  });

  it('a hozzájárulás jogi metaadatait (IP, policy verzió) a szerver rögzíti', async () => {
    await service.submitForm(baseForm(), ctx);
    const consentInsert = db.queries.find((q) =>
      /INSERT INTO consents/.test(q.text),
    );
    expect(consentInsert).toBeDefined();
    // params: submission_id, partner_code, marketing, accepted_at, ip, user_agent, policy_version
    expect(consentInsert!.params?.[4]).toBe('10.0.0.5');
    expect(consentInsert!.params?.[6]).toBe('gdpr-2026-06-01');
  });

  it('"Zéró Hozzájárulás" esetén parkoltatást indít 1 hónapos lejárattal', async () => {
    const form = baseForm({
      marketing: {
        kihordasiIdoTajekoztatas: true,
        hirlevel: false,
        postaiKuldemeny: false,
        emailKuldemeny: false,
      },
    });
    const result = await service.submitForm(form, ctx);

    expect(result.parked).toBe(true);
    expect(result.parkedUntil).toBeDefined();
    expect(db.countInserts('parked_documents')).toBe(1);

    // a lejárat ~1 hónappal későbbi
    const expires = new Date(result.parkedUntil!);
    const now = new Date();
    expect(expires.getTime()).toBeGreaterThan(now.getTime());
  });

  it('meglévő partner (partnerCode) esetén frissít, nem hoz létre újat', async () => {
    // P-000123 = Kovács Lajosné (hiányos: nincs email/mobil) — hiánypótlás
    const form = baseForm({
      partnerCode: 'P-000123',
      name: 'Kovács Lajosné',
      birthDate: '1956-03-22',
      email: 'kovacs.uj@example.com',
      mobile: '+36 30 000 1111',
      taj: '123456789',
      zip: '1145',
      city: 'Budapest',
      address: 'Lakatos utca 22.',
    });
    const result = await service.submitForm(form, ctx);

    expect(result.partnerCode).toBe('P-000123');
    expect(db.countAudit('UPDATE', 'partner')).toBe(1);
    expect(db.countAudit('CREATE', 'partner')).toBe(0);
  });

  it('minden beküldés audit-bejegyzést készít', async () => {
    await service.submitForm(baseForm(), ctx);
    expect(db.countAudit('CREATE', 'form_submission')).toBe(1);
  });
});

describe('KvlMockAdapter — régi ügyfél előhívása (I/A 3. pont)', () => {
  const kvl = new KvlMockAdapter();

  it('születési dátum alapján megtalálja a régi ügyfelet', async () => {
    const res = await kvl.searchPartner({ birthDate: '1956-03-22' });
    expect(res.matchType).toBe('single');
    if (res.matchType === 'single') {
      expect(res.partner.name).toBe('Kovács Lajosné');
    }
  });

  it('nincs találat ismeretlen dátumra', async () => {
    const res = await kvl.searchPartner({ birthDate: '1900-01-01' });
    expect(res.matchType).toBe('none');
  });

  it('frissítéskor a meglévő mezőket nem törli (adatvesztés-védelem)', async () => {
    // csak az email-t frissítjük; a TAJ/cím maradjon meg
    const updated = await kvl.updatePartner('P-000456', {
      email: 'uj.email@example.com',
    });
    expect(updated.email).toBe('uj.email@example.com');
    expect(updated.taj).toBe('987654321'); // érintetlen
    expect(updated.address).toBe('Piac utca 5.'); // érintetlen
  });
});
