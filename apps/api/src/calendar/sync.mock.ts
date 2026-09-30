import { Logger } from '@nestjs/common';
import type { OpeningCalendar } from '@somnoshop/shared';
import type { OpeningSyncTarget } from './sync.port';

/**
 * Mock szinkron-cél. Ideiglenes implementáció, amíg a valódi integrációk
 * (telefonközpont-szolgáltató IVR, webshop "Kapcsolat" oldal, Google Business
 * API) el nem készülnek. Csak naplózza a push-t, hogy a láncreakció
 * ellenőrizhető legyen.
 */
export class MockSyncTarget implements OpeningSyncTarget {
  private readonly logger: Logger;

  constructor(public readonly name: string) {
    this.logger = new Logger(`Sync:${name}`);
  }

  async push(calendar: OpeningCalendar): Promise<void> {
    this.logger.log(
      `[MOCK] Nyitvatartás szinkronizálva → ${this.name} ` +
        `(${calendar.overrides.length} felülírás).`,
    );
  }
}
