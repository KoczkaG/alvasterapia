import { Injectable, Logger } from '@nestjs/common';
import type { MankoProductCount } from '@somnoshop/shared';
import type { MankoPort } from './manko.port';

/**
 * MOCK Mankó (EESZT) adapter.
 *
 * Ideiglenes, memóriában futó implementáció, amíg az EESZT valódi végpontjai
 * el nem készülnek. Egy adott demó-napra visszaad néhány hivatalos darabszámot,
 * amelyek részben eltérnek a KVL-es adatoktól — így az OEP Napi Egyeztető
 * eltérés-kimutatása demózható.
 */
@Injectable()
export class MankoMockAdapter implements MankoPort {
  private readonly logger = new Logger(MankoMockAdapter.name);

  // Demó törzsadat napokra bontva. A valódi adapter ezt az EESZT API-ból hozza.
  private readonly byDate = new Map<string, MankoProductCount[]>([
    [
      '2026-09-30',
      [
        { productType: 'maszk', count: 5 },
        { productType: 'gegecso', count: 3 },
        // A pollenszűrőnél szándékos eltérés: a Mankóban 2, a KVL-ben 3 lesz.
        { productType: 'szuro', count: 2 },
      ],
    ],
  ]);

  async fetchOfficialCounts(dateIso: string): Promise<MankoProductCount[]> {
    this.logger.debug(`[MOCK] Mankó fetchOfficialCounts ${dateIso}`);
    return this.byDate.get(dateIso) ?? [];
  }
}
