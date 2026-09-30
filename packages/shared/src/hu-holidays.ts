import type { DateOverride } from './opening-hours.js';

/**
 * Magyar hivatalos munkaszüneti napok számítása egy adott évre.
 *
 * Ez egy ADMIN SEGÉDFUNKCIÓ: legenerálja a fix és a húsvéthoz kötött mozgó
 * ünnepeket 'closed' felülírás-javaslatként. A javaslatokat az admin egy
 * kattintással jóváhagyhatja vagy felülírhatja — a naptár "egyetlen
 * igazságforrása" továbbra is a KVL-ben rögzített állapot marad.
 *
 * FONTOS: az évente változó, kormányrendeletben kihirdetett ÁTHELYEZETT
 * munkanapokat és LEDOLGOZÓS SZOMBATOKAT ez NEM tartalmazza (azok nem
 * algoritmikusak) — azokat az adminnak kézzel kell felvennie.
 */

/** Húsvétvasárnap dátuma (anonymous Gregorian / Meeus–Jones–Butcher algoritmus). */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = március, 4 = április
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** N nappal eltolt ISO dátum (naptári számítás, dél a DST-biztonságért). */
function shiftIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  dt.setDate(dt.getDate() + days);
  return iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

/**
 * A megadott évre visszaadja a magyar hivatalos munkaszüneti napokat
 * 'closed' típusú felülírás-javaslatként.
 */
export function hungarianPublicHolidays(year: number): DateOverride[] {
  const easter = easterSunday(year);
  const easterIso = iso(year, easter.month, easter.day);

  const days: { date: string; label: string }[] = [
    { date: iso(year, 1, 1), label: 'Újév' },
    { date: iso(year, 3, 15), label: 'Nemzeti ünnep (1848–49)' },
    { date: shiftIso(easterIso, -2), label: 'Nagypéntek' },
    { date: easterIso, label: 'Húsvétvasárnap' },
    { date: shiftIso(easterIso, 1), label: 'Húsvéthétfő' },
    { date: iso(year, 5, 1), label: 'A munka ünnepe' },
    { date: shiftIso(easterIso, 49), label: 'Pünkösdvasárnap' },
    { date: shiftIso(easterIso, 50), label: 'Pünkösdhétfő' },
    { date: iso(year, 8, 20), label: 'Az államalapítás ünnepe' },
    { date: iso(year, 10, 23), label: 'Nemzeti ünnep (1956)' },
    { date: iso(year, 11, 1), label: 'Mindenszentek' },
    { date: iso(year, 12, 25), label: 'Karácsony' },
    { date: iso(year, 12, 26), label: 'Karácsony másnapja' },
  ];

  return days
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ date: d.date, kind: 'closed' as const, label: d.label }));
}
