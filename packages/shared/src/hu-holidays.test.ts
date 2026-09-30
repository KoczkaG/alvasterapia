import { describe, it, expect } from 'vitest';
import { easterSunday, hungarianPublicHolidays } from './hu-holidays.js';

describe('easterSunday — ismert évek', () => {
  it('2024 → március 31.', () => {
    expect(easterSunday(2024)).toEqual({ month: 3, day: 31 });
  });
  it('2025 → április 20.', () => {
    expect(easterSunday(2025)).toEqual({ month: 4, day: 20 });
  });
  it('2026 → április 5.', () => {
    expect(easterSunday(2026)).toEqual({ month: 4, day: 5 });
  });
});

describe('hungarianPublicHolidays — 2026', () => {
  const holidays = hungarianPublicHolidays(2026);
  const dates = holidays.map((h) => h.date);

  it('tartalmazza a fix ünnepeket', () => {
    expect(dates).toContain('2026-01-01'); // Újév
    expect(dates).toContain('2026-03-15');
    expect(dates).toContain('2026-05-01');
    expect(dates).toContain('2026-08-20');
    expect(dates).toContain('2026-10-23');
    expect(dates).toContain('2026-11-01');
    expect(dates).toContain('2026-12-25');
    expect(dates).toContain('2026-12-26');
  });

  it('a húsvéthoz kötött mozgó ünnepeket helyesen számolja (2026, húsvét ápr. 5.)', () => {
    expect(dates).toContain('2026-04-03'); // Nagypéntek
    expect(dates).toContain('2026-04-05'); // Húsvétvasárnap
    expect(dates).toContain('2026-04-06'); // Húsvéthétfő
    expect(dates).toContain('2026-05-24'); // Pünkösdvasárnap (húsvét + 49)
    expect(dates).toContain('2026-05-25'); // Pünkösdhétfő (húsvét + 50)
  });

  it('minden javaslat "closed" típusú és dátum szerint rendezett', () => {
    expect(holidays.every((h) => h.kind === 'closed')).toBe(true);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });
});
