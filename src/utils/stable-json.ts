/**
 * Deterministic JSON serialization: object keys are sorted recursively and
 * `undefined` properties are dropped, so structurally equal values always
 * produce the same string. Used to build stable cache keys.
 */

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) {
        sorted[key] = normalize(entry);
      }
    }
    return sorted;
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}
