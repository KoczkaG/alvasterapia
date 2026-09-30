import { Injectable } from '@nestjs/common';
import zipCities from './data/zip-cities.json';

/**
 * Irányítószám → település feloldás (I/A checklist 4. pont).
 *
 * Az adatlapon a beírt irányítószámhoz automatikusan hozzárendeljük a település
 * nevét, minimalizálva a manuális gépelési hibákat.
 *
 * Adatforrás: GeoNames (CC BY 4.0). A tartalmat feldolgoztuk irányítószám →
 * településnév(ek) kereszttáblává; tartalmazza a budapesti kerületi kódokat is.
 * Részletek: data/ATTRIBUTION.md
 */

const LOOKUP: Record<string, string[]> = zipCities as Record<string, string[]>;

export interface ZipResolution {
  zip: string;
  /** Elsődleges (auto-kitöltésre javasolt) településnév. */
  city: string;
  /** Ha egy irányítószámhoz több település is tartozik, itt az összes. */
  alternatives: string[];
}

@Injectable()
export class PostalCodeService {
  /**
   * Feloldja az irányítószámot. `null`, ha nem szerepel az adatbázisban
   * (ekkor a felhasználó kézzel írhatja be a települést).
   */
  resolve(zip: string): ZipResolution | null {
    const normalized = zip.trim();
    if (!/^\d{4}$/.test(normalized)) return null;

    const cities = LOOKUP[normalized];
    if (!cities || cities.length === 0) return null;

    return {
      zip: normalized,
      city: cities[0],
      alternatives: cities,
    };
  }
}
