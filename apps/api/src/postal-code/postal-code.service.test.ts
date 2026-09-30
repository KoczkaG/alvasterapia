import { describe, it, expect } from 'vitest';
import { PostalCodeService } from './postal-code.service';

describe('PostalCodeService — irányítószám → település (I/A 4. pont)', () => {
  const service = new PostalCodeService();

  it('feloldja a budapesti irányítószámot', () => {
    const res = service.resolve('1145');
    expect(res).not.toBeNull();
    expect(res?.city).toBe('Budapest');
  });

  it('feloldja Debrecent (4025)', () => {
    expect(service.resolve('4025')?.city).toBe('Debrecen');
  });

  it('több települést is visszaad, ha az irányítószám osztott', () => {
    // 2066 → Szár / Újbarok (a dataset szerint több település)
    const res = service.resolve('2066');
    expect(res).not.toBeNull();
    expect(res!.alternatives.length).toBeGreaterThan(1);
    // az elsődleges city szerepel az alternatívák között
    expect(res!.alternatives).toContain(res!.city);
  });

  it('null-t ad nem létező irányítószámra', () => {
    expect(service.resolve('0000')).toBeNull();
  });

  it('null-t ad rossz formátumra', () => {
    expect(service.resolve('abc')).toBeNull();
    expect(service.resolve('123')).toBeNull();
    expect(service.resolve('12345')).toBeNull();
  });
});
