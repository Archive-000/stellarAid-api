import { describe, expect, it } from 'vitest';

import { stableStringify } from './stable-json';

describe('stableStringify', () => {
  it('ignores object key order, including nested objects', () => {
    expect(stableStringify({ a: 1, b: { c: 2, d: 3 } })).toBe(
      stableStringify({ b: { d: 3, c: 2 }, a: 1 }),
    );
  });

  it('drops undefined properties but keeps array order', () => {
    expect(stableStringify({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(stableStringify([2, 1])).not.toBe(stableStringify([1, 2]));
  });
});
