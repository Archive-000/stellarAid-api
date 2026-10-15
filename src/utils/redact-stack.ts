/**
 * Best-effort scrubbing of secrets that can leak into error messages and stack
 * traces (the first line of a stack is the message, which often embeds request
 * data or connection strings). Used before logging stacks in production.
 */

const REPLACEMENT = '[REDACTED]';

const RULES: readonly [RegExp, string][] = [
  // Credentials embedded in URLs: postgresql://user:pass@host -> postgresql://[REDACTED]@host
  [/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+(?::[^\s/@]*)?@/gi, `$1${REPLACEMENT}@`],
  // Authorization header values
  [/\b(Bearer|Basic)\s+[A-Za-z0-9\-._~+/]+=*/gi, `$1 ${REPLACEMENT}`],
  // JSON web tokens
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, REPLACEMENT],
  // key=value / key: value / "key":"value" for secret-looking keys
  [
    /(["']?(?:password|passwd|pass|secret|token|api[-_]?key|authorization|private[-_]?key)["']?\s*[:=]\s*)(["']?)[^\s"',;&]+\2/gi,
    `$1${REPLACEMENT}`,
  ],
  // Email addresses
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, REPLACEMENT],
  // Long hex strings (hashes, raw secrets, Stellar-style seeds are covered below)
  [/\b[a-f0-9]{32,}\b/gi, REPLACEMENT],
  // Stellar secret seeds
  [/\bS[A-Z2-7]{55}\b/g, REPLACEMENT],
];

export function redactStack(stack: string): string {
  return RULES.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), stack);
}
