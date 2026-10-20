import { describe, expect, it } from 'vitest';

import { buildObjectKey } from './s3.service';

describe('buildObjectKey', () => {
  it('uses a short URL-safe random identifier and preserves namespacing', () => {
    const key = buildObjectKey('user-1', 'images', 'my photo.png');

    expect(key).toMatch(/^images\/user-1\/[A-Za-z0-9_-]{16}-my_photo\.png$/);
  });

  it('generates distinct identifiers for repeated uploads', () => {
    const keys = new Set(Array.from({ length: 100 }, () => buildObjectKey('u1', 'files', 'a.png')));
    expect(keys.size).toBe(100);
  });
});
