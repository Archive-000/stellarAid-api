import { describe, expect, it } from 'vitest';

import { calculatePlatformFee } from './fee';

const fee = (amount: string | number, bps: number): string =>
  calculatePlatformFee(amount, bps).toFixed(2);

describe('calculatePlatformFee', () => {
  it('computes exact divisions', () => {
    expect(fee('100.00', 500)).toBe('5.00');
    expect(fee('19.99', 1000)).toBe('2.00'); // 1.999 -> 2.00
    expect(fee('250', 100)).toBe('2.50');
  });

  it('rounds half up at the cent boundary', () => {
    expect(fee('0.10', 500)).toBe('0.01'); // 0.005 -> 0.01
    expect(fee('0.30', 500)).toBe('0.02'); // 0.015 -> 0.02
    expect(fee('19.99', 250)).toBe('0.50'); // 0.49975 -> 0.50
  });

  it('rounds below the half-cent down, so tiny amounts yield no fee', () => {
    expect(fee('0.09', 500)).toBe('0.00'); // 0.0045 -> 0.00
    expect(fee('0.01', 500)).toBe('0.00');
  });

  it('handles the bounds of the rate', () => {
    expect(fee('42.42', 0)).toBe('0.00');
    expect(fee('42.42', 10000)).toBe('42.42');
  });

  it('does not accumulate floating-point error', () => {
    // 0.1 + 0.2 style inputs must be treated as decimals, not binary floats.
    expect(fee('0.30', 500)).toBe(calculatePlatformFee(0.3, 500).toFixed(2));
    expect(fee('1234567890.12', 500)).toBe('61728394.51'); // 61728394.506 -> .51
  });

  it('rejects invalid input', () => {
    expect(() => calculatePlatformFee(-1, 500)).toThrow(RangeError);
    expect(() => calculatePlatformFee(1, -1)).toThrow(RangeError);
    expect(() => calculatePlatformFee(1, 10001)).toThrow(RangeError);
    expect(() => calculatePlatformFee(1, 5.5)).toThrow(RangeError);
  });
});
