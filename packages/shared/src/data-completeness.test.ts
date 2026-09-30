import { describe, it, expect } from 'vitest';
import {
  checkCompleteness,
  selfServiceUpdateSchema,
} from './data-completeness.js';

describe('checkCompleteness — hiányzó kötelező mezők (I/F)', () => {
  it('teljes, ha mindhárom mező ki van töltve', () => {
    const r = checkCompleteness({
      email: 'a@b.hu',
      mobile: '+36 30 123 4567',
      taj: '123456789',
    });
    expect(r.complete).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it('jelzi a hiányzó e-mailt és TAJ-t', () => {
    const r = checkCompleteness({ mobile: '+36 30 123 4567' });
    expect(r.complete).toBe(false);
    expect(r.missing).toContain('email');
    expect(r.missing).toContain('taj');
    expect(r.missing).not.toContain('mobile');
  });

  it('az üres string is hiányzónak számít', () => {
    const r = checkCompleteness({ email: '  ', mobile: '', taj: null });
    expect(r.complete).toBe(false);
    expect(r.missing).toEqual(['email', 'mobile', 'taj']);
  });
});

describe('selfServiceUpdateSchema — önkiszolgáló frissítés (I/F "B")', () => {
  it('elfogad egyetlen mezőt is', () => {
    expect(
      selfServiceUpdateSchema.safeParse({ email: 'uj@example.com' }).success,
    ).toBe(true);
  });

  it('elutasítja az üres beküldést (nincs egy adat sem)', () => {
    expect(selfServiceUpdateSchema.safeParse({}).success).toBe(false);
  });

  it('validálja a formátumot (hibás TAJ)', () => {
    expect(
      selfServiceUpdateSchema.safeParse({ taj: '123' }).success,
    ).toBe(false);
  });
});
