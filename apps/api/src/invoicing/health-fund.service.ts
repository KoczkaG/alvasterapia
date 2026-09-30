import { Injectable } from '@nestjs/common';
import { DEFAULT_HEALTH_FUNDS, type HealthFund } from '@somnoshop/shared';

/**
 * Egészségpénztári törzsadat-szolgáltató (II/B). Jelenleg a beépített listát
 * adja; később adminfelületről / KVL-ből tölthető, az interfész stabil marad.
 */
@Injectable()
export class HealthFundService {
  private readonly funds = new Map<string, HealthFund>(
    DEFAULT_HEALTH_FUNDS.map((f) => [f.id, f]),
  );

  list(): HealthFund[] {
    return [...this.funds.values()];
  }

  get(id: string): HealthFund | undefined {
    return this.funds.get(id);
  }
}
