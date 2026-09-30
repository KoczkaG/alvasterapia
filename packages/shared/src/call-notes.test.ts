import { describe, it, expect } from 'vitest';
import { callNoteSchema, CALL_TOPIC_LABELS } from './call-notes.js';

describe('callNoteSchema — hívásvégi jegyzet validáció', () => {
  const valid = {
    topics: ['maszkbeallitas'],
    summary: 'Egyeztetve a maszkméret.',
    followUpNeeded: false,
  };

  it('elfogad egy érvényes jegyzetet', () => {
    expect(callNoteSchema.safeParse(valid).success).toBe(true);
  });

  it('elfogad több témát és opcionális küldő intézményt', () => {
    expect(
      callNoteSchema.safeParse({
        ...valid,
        topics: ['maszkbeallitas', 'szerviz_garancia'],
        referrerId: 'lab_koranyi',
      }).success,
    ).toBe(true);
  });

  it('elutasítja, ha nincs megjelölt téma', () => {
    expect(
      callNoteSchema.safeParse({ ...valid, topics: [] }).success,
    ).toBe(false);
  });

  it('elutasítja az üres összefoglalót', () => {
    expect(
      callNoteSchema.safeParse({ ...valid, summary: '  ' }).success,
    ).toBe(false);
  });

  it('elutasítja az ismeretlen témát', () => {
    expect(
      callNoteSchema.safeParse({ ...valid, topics: ['ismeretlen'] }).success,
    ).toBe(false);
  });
});

describe('CALL_TOPIC_LABELS', () => {
  it('minden témához van magyar címke', () => {
    expect(CALL_TOPIC_LABELS.panaszkezeles).toBe('Panaszkezelés');
    expect(CALL_TOPIC_LABELS.venybevaltas).toBe('Vénybeváltás');
  });
});
