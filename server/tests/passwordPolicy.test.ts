import { describe, expect, it } from 'vitest';
import { isCommonPassword } from '../src/lib/passwordPolicy.js';

describe('isCommonPassword', () => {
  it('flags well-known passwords that pass the length, letter and digit rule', () => {
    for (const pw of ['password1', 'password123', 'qwerty123', 'abc12345', 'admin123', 'welcome1', 'letmein1', 'iloveyou1', '1q2w3e4r', 'zaq12wsx', 'passw0rd', 'p@ssw0rd']) {
      expect(isCommonPassword(pw), pw).toBe(true);
    }
  });

  it('flags the published demo password and gym-themed ones', () => {
    for (const pw of ['pulse123', 'pulsefit1', 'pulsefit123', 'gym12345', 'fitness1']) expect(isCommonPassword(pw), pw).toBe(true);
  });

  it('ignores letter case', () => {
    expect(isCommonPassword('Password1')).toBe(true);
    expect(isCommonPassword('PULSE123')).toBe(true);
    expect(isCommonPassword('QwErTy123')).toBe(true);
  });

  it('accepts passwords that are not on the list', () => {
    for (const pw of ['Stronger2026', 'tangerine-kettle-41', 'pulse1234x!', 'password1 ', 'Zq8#mv2Lp']) expect(isCommonPassword(pw), pw).toBe(false);
  });
});
