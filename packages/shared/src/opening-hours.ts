import { z } from 'zod';

/**
 * Nyitvatartási naptár — az I. Modul / B) "egyetlen központi igazságforrása".
 *
 * A modell két rétegből áll:
 *  1. Heti alap-nyitvatartás (weekly base) — a szokásos hétköznapi rend.
 *  2. Dátum-specifikus felülírások (overrides) — ünnepnapok, ledolgozós
 *     szombatok, egyedi rövidített napok. Ezek FELÜLÍRJÁK az alap-rendet.
 *
 * A "nyitva van-e most" motor (resolveOpeningForDate / isOpenAt) ebből számol.
 * Minden idő HELYI (Europe/Budapest) faliórai időként értendő "HH:MM" formában.
 */

/** Egy nyitvatartási intervallum egy napon belül, pl. 08:00–17:00. */
export const timeRangeSchema = z
  .object({
    /** Nyitás, "HH:MM" (24 órás). */
    open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formátum: ÓÓ:PP'),
    /** Zárás, "HH:MM" (24 órás). */
    close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formátum: ÓÓ:PP'),
  })
  .refine((r) => r.open < r.close, {
    message: 'A zárásnak a nyitás utánra kell esnie.',
  });

export type TimeRange = z.infer<typeof timeRangeSchema>;

/**
 * A hét napjai. 0 = vasárnap ... 6 = szombat (megegyezik a JS Date.getDay()-jel).
 */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Heti alap-nyitvatartás: naponként 0..n intervallum. Üres tömb = aznap zárva.
 */
export const weeklyScheduleSchema = z.object({
  0: z.array(timeRangeSchema), // vasárnap
  1: z.array(timeRangeSchema), // hétfő
  2: z.array(timeRangeSchema), // kedd
  3: z.array(timeRangeSchema), // szerda
  4: z.array(timeRangeSchema), // csütörtök
  5: z.array(timeRangeSchema), // péntek
  6: z.array(timeRangeSchema), // szombat
});

export type WeeklySchedule = z.infer<typeof weeklyScheduleSchema>;

/** Egy dátum-felülírás típusa. */
export const overrideKindSchema = z.enum([
  /** Zárva tartás (állami ünnep, rendkívüli zárás). */
  'closed',
  /** Rendhagyó nyitvatartás (pl. ledolgozós szombat, rövidített ünnepi nap). */
  'custom',
]);

export type OverrideKind = z.infer<typeof overrideKindSchema>;

/**
 * Egy konkrét naptári napra vonatkozó felülírás. A `date` ISO YYYY-MM-DD,
 * helyi (Europe/Budapest) naptári nap.
 */
export const dateOverrideSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formátum: ÉÉÉÉ-HH-NN'),
    kind: overrideKindSchema,
    /** Emberi olvasható indok (pl. "Nemzeti ünnep", "Ledolgozós szombat"). */
    label: z.string().min(1),
    /**
     * Rendhagyó ('custom') napnál a nyitvatartási intervallumok.
     * 'closed' típusnál üres/elhagyható.
     */
    ranges: z.array(timeRangeSchema).optional(),
  })
  .refine((o) => o.kind === 'closed' || (o.ranges?.length ?? 0) > 0, {
    message: 'Rendhagyó (custom) naphoz legalább egy nyitvatartási intervallum kell.',
  });

export type DateOverride = z.infer<typeof dateOverrideSchema>;

/** A teljes naptár állapota: heti alap + felülírások. */
export interface OpeningCalendar {
  weekly: WeeklySchedule;
  overrides: DateOverride[];
}

/**
 * SOMNO SHOP alapértelmezett heti nyitvatartás (a dokumentum szerint):
 *  H–Sze: 08:00–17:00, Cs: 08:00–18:00, P: 08:00–16:00, hétvége zárva.
 */
export const DEFAULT_WEEKLY_SCHEDULE: WeeklySchedule = {
  0: [], // vasárnap — zárva
  1: [{ open: '08:00', close: '17:00' }], // hétfő
  2: [{ open: '08:00', close: '17:00' }], // kedd
  3: [{ open: '08:00', close: '17:00' }], // szerda
  4: [{ open: '08:00', close: '18:00' }], // csütörtök
  5: [{ open: '08:00', close: '16:00' }], // péntek
  6: [], // szombat — zárva
};

/**
 * Egy adott naptári nap FELOLDOTT nyitvatartása: az érvényes intervallumok +
 * hogy honnan származnak (alap-rend vagy felülírás).
 */
export interface ResolvedDay {
  date: string; // YYYY-MM-DD
  weekday: Weekday;
  ranges: TimeRange[];
  /** 'base' = heti alap-rend, 'override' = dátum-felülírás érvényesült. */
  source: 'base' | 'override';
  /** Ha override érvényesült, a felülírás adatai. */
  override?: DateOverride;
  /** Igaz, ha aznap egyáltalán nincs nyitvatartás. */
  closed: boolean;
}

function weekdayFromIsoDate(isoDate: string): Weekday {
  // Helyi naptári nap; delet választunk, hogy időzóna-eltolódás ne módosítsa a napot.
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).getDay() as Weekday;
}

/**
 * Feloldja egy adott naptári nap nyitvatartását: ha van rá felülírás, az
 * érvényesül; egyébként a heti alap-rend.
 */
export function resolveOpeningForDate(
  calendar: OpeningCalendar,
  isoDate: string,
): ResolvedDay {
  const weekday = weekdayFromIsoDate(isoDate);
  const override = calendar.overrides.find((o) => o.date === isoDate);

  if (override) {
    const ranges = override.kind === 'closed' ? [] : override.ranges ?? [];
    return {
      date: isoDate,
      weekday,
      ranges,
      source: 'override',
      override,
      closed: ranges.length === 0,
    };
  }

  const ranges = calendar.weekly[weekday] ?? [];
  return {
    date: isoDate,
    weekday,
    ranges,
    source: 'base',
    closed: ranges.length === 0,
  };
}

/** "HH:MM" → percek éjféltől. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Igaz, ha a megadott naptári napon a megadott helyi időpont (HH:MM) valamely
 * nyitvatartási intervallumba esik. A zárás pillanata már NEM nyitva
 * (open <= t < close), hogy 17:00-kor zárt legyen a bolt.
 */
export function isOpenAt(
  calendar: OpeningCalendar,
  isoDate: string,
  hhmm: string,
): boolean {
  const day = resolveOpeningForDate(calendar, isoDate);
  const t = toMinutes(hhmm);
  return day.ranges.some((r) => toMinutes(r.open) <= t && t < toMinutes(r.close));
}

/** isoDate + N nap, YYYY-MM-DD-ként visszaadva (helyi naptári számítás). */
function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export interface NextOpening {
  /** A következő nyitás naptári napja (YYYY-MM-DD). */
  date: string;
  /** A következő nyitás időpontja (HH:MM). */
  time: string;
}

/**
 * Megadja a következő nyitási időpontot a megadott naptári naptól/időponttól
 * kezdve. Az IVR és a webshop ezzel tud tájékoztatni ("legközelebb ekkor
 * nyitunk"). `null`, ha a keresési ablakon (alap 14 nap) belül nincs nyitás.
 */
export function nextOpening(
  calendar: OpeningCalendar,
  fromIsoDate: string,
  fromHhmm: string,
  lookaheadDays = 14,
): NextOpening | null {
  const fromMinutes = toMinutes(fromHhmm);

  for (let offset = 0; offset <= lookaheadDays; offset++) {
    const date = addDays(fromIsoDate, offset);
    const day = resolveOpeningForDate(calendar, date);
    // A napon belüli intervallumok növekvő sorrendben.
    const sorted = [...day.ranges].sort(
      (a, b) => toMinutes(a.open) - toMinutes(b.open),
    );
    for (const range of sorted) {
      const openMin = toMinutes(range.open);
      // A mai napon csak a még hátralévő nyitás számít.
      if (offset === 0 && openMin <= fromMinutes) continue;
      return { date, time: range.open };
    }
  }
  return null;
}
