import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WEEKLY_SCHEDULE,
  isOpenAt,
  nextOpening,
  resolveOpeningForDate,
  type OpeningCalendar,
} from './opening-hours.js';

// 2026-06-01 hétfő, 2026-06-05 péntek, 2026-06-06 szombat, 2026-06-07 vasárnap.
function baseCalendar(): OpeningCalendar {
  return { weekly: DEFAULT_WEEKLY_SCHEDULE, overrides: [] };
}

describe('resolveOpeningForDate — heti alap-rend', () => {
  it('hétfőn 08:00–17:00', () => {
    const day = resolveOpeningForDate(baseCalendar(), '2026-06-01');
    expect(day.source).toBe('base');
    expect(day.closed).toBe(false);
    expect(day.ranges).toEqual([{ open: '08:00', close: '17:00' }]);
  });

  it('csütörtökön 08:00–18:00', () => {
    const day = resolveOpeningForDate(baseCalendar(), '2026-06-04');
    expect(day.ranges).toEqual([{ open: '08:00', close: '18:00' }]);
  });

  it('pénteken 08:00–16:00', () => {
    const day = resolveOpeningForDate(baseCalendar(), '2026-06-05');
    expect(day.ranges).toEqual([{ open: '08:00', close: '16:00' }]);
  });

  it('szombaton és vasárnap zárva', () => {
    expect(resolveOpeningForDate(baseCalendar(), '2026-06-06').closed).toBe(true);
    expect(resolveOpeningForDate(baseCalendar(), '2026-06-07').closed).toBe(true);
  });
});

describe('isOpenAt — időhatárok', () => {
  const cal = baseCalendar();

  it('nyitás pillanatában (08:00) nyitva', () => {
    expect(isOpenAt(cal, '2026-06-01', '08:00')).toBe(true);
  });

  it('munkaidőben (12:30) nyitva', () => {
    expect(isOpenAt(cal, '2026-06-01', '12:30')).toBe(true);
  });

  it('zárás pillanatában (17:00) MÁR zárva', () => {
    expect(isOpenAt(cal, '2026-06-01', '17:00')).toBe(false);
  });

  it('nyitás előtt (07:59) zárva', () => {
    expect(isOpenAt(cal, '2026-06-01', '07:59')).toBe(false);
  });

  it('hétvégén bármikor zárva', () => {
    expect(isOpenAt(cal, '2026-06-06', '10:00')).toBe(false);
  });
});

describe('dátum-felülírások (ünnep / ledolgozós szombat / rövidített nap)', () => {
  it('ünnepnapi zárás felülírja a hétköznapi nyitvatartást', () => {
    const cal: OpeningCalendar = {
      weekly: DEFAULT_WEEKLY_SCHEDULE,
      overrides: [
        { date: '2026-06-01', kind: 'closed', label: 'Rendkívüli zárás' },
      ],
    };
    const day = resolveOpeningForDate(cal, '2026-06-01');
    expect(day.source).toBe('override');
    expect(day.closed).toBe(true);
    expect(isOpenAt(cal, '2026-06-01', '10:00')).toBe(false);
  });

  it('ledolgozós szombat nyitottá tesz egy egyébként zárt napot', () => {
    const cal: OpeningCalendar = {
      weekly: DEFAULT_WEEKLY_SCHEDULE,
      overrides: [
        {
          date: '2026-06-06',
          kind: 'custom',
          label: 'Ledolgozós szombat',
          ranges: [{ open: '08:00', close: '14:00' }],
        },
      ],
    };
    expect(isOpenAt(cal, '2026-06-06', '10:00')).toBe(true);
    expect(isOpenAt(cal, '2026-06-06', '14:00')).toBe(false); // zárás
  });

  it('rövidített ünnepi nap felülírja a szokásos nyitvatartást', () => {
    const cal: OpeningCalendar = {
      weekly: DEFAULT_WEEKLY_SCHEDULE,
      overrides: [
        {
          date: '2026-06-04', // csütörtök, egyébként 18-ig
          kind: 'custom',
          label: 'Rövidített ünnepi nyitvatartás',
          ranges: [{ open: '08:00', close: '12:00' }],
        },
      ],
    };
    expect(isOpenAt(cal, '2026-06-04', '15:00')).toBe(false);
    expect(isOpenAt(cal, '2026-06-04', '11:00')).toBe(true);
  });
});

describe('nextOpening — a következő nyitás', () => {
  const cal = baseCalendar();

  it('munkaidő után aznap → másnap reggel 08:00', () => {
    const next = nextOpening(cal, '2026-06-01', '18:00');
    expect(next).toEqual({ date: '2026-06-02', time: '08:00' });
  });

  it('nyitás előtt aznap → aznap 08:00', () => {
    const next = nextOpening(cal, '2026-06-01', '07:00');
    expect(next).toEqual({ date: '2026-06-01', time: '08:00' });
  });

  it('péntek zárás után → átugorja a hétvégét, hétfő 08:00', () => {
    const next = nextOpening(cal, '2026-06-05', '17:00');
    expect(next).toEqual({ date: '2026-06-08', time: '08:00' });
  });

  it('átugorja az ünnepnapi zárást', () => {
    const withHoliday: OpeningCalendar = {
      weekly: DEFAULT_WEEKLY_SCHEDULE,
      overrides: [
        { date: '2026-06-08', kind: 'closed', label: 'Pünkösdhétfő' },
      ],
    };
    // péntek zárás után: hétfő zárva (ünnep) → kedd 08:00
    const next = nextOpening(withHoliday, '2026-06-05', '17:00');
    expect(next).toEqual({ date: '2026-06-09', time: '08:00' });
  });
});
