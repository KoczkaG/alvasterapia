import { describe, it, expect } from 'vitest';
import {
  checkClosingRules,
  isDuplicateCode,
  validateCode,
  type InvoiceLine,
} from './billing-validation.js';

describe('validateCode — kód-szintű elírás-gátló (II/D)', () => {
  it('vénykód: elfogadja a 27-tel kezdődőt', () => {
    expect(validateCode('prescription', '27123456').valid).toBe(true);
  });
  it('vénykód: elutasítja, ha nem 27-tel kezdődik', () => {
    const r = validateCode('prescription', '21123456');
    expect(r.valid).toBe(false);
    expect(r.message).toContain('Vénykód');
  });
  it('matrica: elfogadja a 21-gyel kezdődőt', () => {
    expect(validateCode('matrica', '21999888').valid).toBe(true);
  });
  it('matrica: elutasítja a 27-tel kezdődőt (felső sor tévesztés)', () => {
    expect(validateCode('matrica', '27999888').valid).toBe(false);
  });
  it('orvoskód: elfogadja a 99-cel kezdődőt', () => {
    expect(validateCode('doctor', '99123').valid).toBe(true);
  });
  it('orvoskód: elutasítja a más prefixet', () => {
    expect(validateCode('doctor', '12345').valid).toBe(false);
  });
  it('elutasítja a nem-szám karaktereket', () => {
    expect(validateCode('prescription', '27ABC').valid).toBe(false);
  });
  it('elutasítja az üres kódot', () => {
    expect(validateCode('prescription', '   ').valid).toBe(false);
  });
  it('levágja a whitespace-t', () => {
    expect(validateCode('prescription', '  27123  ').valid).toBe(true);
  });
});

describe('isDuplicateCode — Ctrl+V duplikáció szűrő', () => {
  it('igaz, ha a kód már szerepel', () => {
    expect(isDuplicateCode(['27111', '27222'], '27222')).toBe(true);
  });
  it('whitespace-től függetlenül szűr', () => {
    expect(isDuplicateCode(['27111'], '  27111 ')).toBe(true);
  });
  it('hamis új kódra', () => {
    expect(isDuplicateCode(['27111'], '27333')).toBe(false);
  });
});

describe('checkClosingRules — kétirányú logikai zárási szűrő', () => {
  const withPostage: InvoiceLine[] = [
    { code: 'A1', name: 'Maszk' },
    { code: 'POST', name: 'Postaköltség', isPostage: true },
  ];
  const noPostage: InvoiceLine[] = [{ code: 'A1', name: 'Maszk' }];

  it('postaköltség + készpénz → tiltott', () => {
    const r = checkClosingRules(withPostage, 'cash');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('POSTAGE_REQUIRES_REMOTE_PAYMENT');
  });
  it('postaköltség + bankkártya → tiltott', () => {
    expect(checkClosingRules(withPostage, 'card').ok).toBe(false);
  });
  it('postaköltség + átutalás → OK', () => {
    expect(checkClosingRules(withPostage, 'transfer').ok).toBe(true);
  });
  it('postaköltség + utánvét → OK', () => {
    expect(checkClosingRules(withPostage, 'cod').ok).toBe(true);
  });
  it('utánvét postaköltség nélkül → hiányzó tétel', () => {
    const r = checkClosingRules(noPostage, 'cod');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('MISSING_POSTAGE');
  });
  it('készpénz postaköltség nélkül → OK', () => {
    expect(checkClosingRules(noPostage, 'cash').ok).toBe(true);
  });
});
