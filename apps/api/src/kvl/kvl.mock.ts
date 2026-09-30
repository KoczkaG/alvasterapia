import { Injectable, Logger } from '@nestjs/common';
import {
  type KvlPartner,
  type KvlPartnerUpsert,
  type KvlPort,
  type KvlSearchResult,
  type KvlSourcedEvent,
  type KvlTimelineEvent,
} from './kvl.port';

/**
 * MOCK KVL-adapter.
 *
 * Ideiglenes, memóriában futó implementáció, amíg a KVL valódi API-végpontjai
 * el nem készülnek. Néhány beépített "régi ügyfél" segít a régi-ügyfél-előhívás
 * (I/A 3. pont) és a hiánypótlás demózásában.
 *
 * A valódi HTTP-alapú adaptert (`KvlHttpAdapter`) ugyanezen interfész mögé kell
 * majd beilleszteni — a modul provider-cseréjével, kód-módosítás nélkül a hívók
 * oldalán.
 */
@Injectable()
export class KvlMockAdapter implements KvlPort {
  private readonly logger = new Logger(KvlMockAdapter.name);

  // Demó törzsadat. A "Kovács Lajosné" hiányos (nincs email/mobil) — így a
  // "Gyors Adatfrissítési Panel" (I/A 5. pont) valós esetet tud demózni.
  private readonly partners = new Map<string, KvlPartner>([
    [
      'P-000123',
      {
        partnerCode: 'P-000123',
        name: 'Kovács Lajosné',
        birthDate: '1956-03-22',
        email: null,
        mobile: null,
        taj: '123456789',
        zip: '1145',
        city: 'Budapest',
        address: 'Lakatos utca 22.',
      },
    ],
    [
      'P-000456',
      {
        partnerCode: 'P-000456',
        name: 'Nagy István',
        birthDate: '1970-11-02',
        email: 'nagy.istvan@example.com',
        mobile: '+36 30 123 4567',
        taj: '987654321',
        zip: '4025',
        city: 'Debrecen',
        address: 'Piac utca 5.',
      },
    ],
  ]);

  private seq = 1000;

  async searchPartner(query: {
    birthDate?: string;
    partnerCode?: string;
  }): Promise<KvlSearchResult> {
    this.logger.debug(`[MOCK] searchPartner ${JSON.stringify(query)}`);

    if (query.partnerCode) {
      const partner = this.partners.get(query.partnerCode);
      return partner ? { matchType: 'single', partner } : { matchType: 'none' };
    }

    if (query.birthDate) {
      const matches = [...this.partners.values()].filter(
        (p) => p.birthDate === query.birthDate,
      );
      if (matches.length === 0) return { matchType: 'none' };
      if (matches.length > 1) {
        return { matchType: 'multiple', count: matches.length };
      }
      return { matchType: 'single', partner: matches[0] };
    }

    return { matchType: 'none' };
  }

  async updatePartner(
    partnerCode: string,
    data: Partial<KvlPartnerUpsert>,
  ): Promise<KvlPartner> {
    const existing = this.partners.get(partnerCode);
    if (!existing) {
      throw new Error(`[MOCK] Ismeretlen partnerkód: ${partnerCode}`);
    }
    // FONTOS: mezőt SOHA nem törlünk — csak a megadott (nem undefined) mezőket
    // frissítjük, a többit érintetlenül hagyjuk (lásd II/A adatvesztés-védelem).
    const updated: KvlPartner = {
      ...existing,
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.mobile !== undefined ? { mobile: data.mobile } : {}),
      ...(data.taj !== undefined ? { taj: data.taj } : {}),
      ...(data.zip !== undefined ? { zip: data.zip } : {}),
      ...(data.city !== undefined ? { city: data.city } : {}),
      ...(data.address !== undefined ? { address: data.address } : {}),
    };
    this.partners.set(partnerCode, updated);
    this.logger.debug(`[MOCK] updatePartner ${partnerCode}`);
    return updated;
  }

  async createPartner(data: KvlPartnerUpsert): Promise<KvlPartner> {
    const partnerCode = `P-${String(++this.seq).padStart(6, '0')}`;
    const partner: KvlPartner = {
      partnerCode,
      name: data.name,
      birthDate: data.birthDate,
      email: data.email ?? null,
      mobile: data.mobile ?? null,
      taj: data.taj ?? null,
      zip: data.zip,
      city: data.city,
      address: data.address,
    };
    this.partners.set(partnerCode, partner);
    this.logger.debug(`[MOCK] createPartner -> ${partnerCode}`);
    return partner;
  }

  async appendTimeline(
    partnerCode: string,
    event: KvlTimelineEvent,
  ): Promise<void> {
    this.logger.debug(
      `[MOCK] appendTimeline ${partnerCode}: ${event.type} — ${event.text}`,
    );
  }

  async fetchTimelineEvents(
    partnerCode: string,
  ): Promise<KvlSourcedEvent[]> {
    this.logger.debug(`[MOCK] fetchTimelineEvents ${partnerCode}`);
    // Demó KVL-események a Timeline összefésülésének bemutatásához. A valódi
    // adapterben ezek a KVL pénzügyi/raktári/logisztikai API-jaiból jönnek.
    // Kritikus (I/D): a számlánál nem csak a sorszám, hanem a konkrét
    // termék- és modellnév is olvasható.
    if (partnerCode === 'P-000123') {
      return [
        {
          type: 'INVOICE_ISSUED',
          text: 'Számla — Prisma Smart Plus CPAP készülék',
          occurredAt: '2025-11-12T09:30:00.000Z',
          detail: {
            invoiceNumber: 'SZ-2025-004521',
            items: [
              { name: 'Prisma Smart Plus CPAP', model: 'Prisma Smart Plus' },
              { name: 'JOYCEeasy orrmaszk (M)', model: 'JOYCEeasy' },
            ],
            gross: 189000,
          },
        },
        {
          type: 'STOCK_MOVEMENT',
          text: 'Próbagép kihelyezés — Prisma Smart Plus (SN: PSP-77123)',
          occurredAt: '2025-11-12T09:35:00.000Z',
          detail: { serialNumber: 'PSP-77123', direction: 'out' },
        },
        {
          type: 'PACKAGE_DELIVERED',
          text: 'Csomag kézbesítve (GLS) — átvette: Kovács Lajosné',
          occurredAt: '2025-11-14T13:20:00.000Z',
          detail: {
            carrier: 'GLS',
            tracking: 'GLS-998877',
            receivedBy: 'Kovács Lajosné',
          },
        },
      ];
    }
    return [];
  }
}
