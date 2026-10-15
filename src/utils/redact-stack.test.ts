import { describe, expect, it } from 'vitest';

import { redactStack } from './redact-stack';

describe('redactStack', () => {
  it('redacts credentials in connection URLs but keeps the host', () => {
    const out = redactStack('Error: connect failed postgresql://admin:hunter2@db.internal:5432/app');
    expect(out).not.toContain('hunter2');
    expect(out).not.toContain('admin:');
    expect(out).toContain('db.internal:5432/app');
  });

  it('redacts bearer tokens and JWTs', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl';
    const out = redactStack(`Error: bad header Bearer ${jwt}\\n    at x (y.ts:1:1)`);
    expect(out).not.toContain(jwt);
    expect(out).toContain('at x (y.ts:1:1)');
  });

  it('redacts secret-looking key/value pairs', () => {
    const out = redactStack('Error: body {"password":"s3cret","title":"ok"} password=abc123&x=1');
    expect(out).not.toContain('s3cret');
    expect(out).not.toContain('abc123');
    expect(out).toContain('"title":"ok"');
  });

  it('redacts emails, long hex strings and Stellar seeds', () => {
    const seed = `S${'A'.repeat(55)}`;
    const hex = 'a'.repeat(64);
    const out = redactStack(`Error for ada@example.com ${hex} ${seed}`);
    expect(out).not.toMatch(/ada@example\.com|a{64}|SA{55}/);
  });

  it('leaves ordinary stack frames untouched', () => {
    const stack = 'TypeError: x is not a function\n    at handler (/app/src/index.ts:10:5)';
    expect(redactStack(stack)).toBe(stack);
  });
});
