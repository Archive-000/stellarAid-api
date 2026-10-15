/**
 * Platform fee calculation.
 *
 * The one place a fee is derived from an amount, so every caller rounds the
 * same way. Order amounts and fees are stored as `Decimal(12, 2)`, so the fee
 * is rounded to 2 decimal places with an explicit ROUND_HALF_UP (not whatever
 * the global Decimal rounding happens to be). Amounts too small to earn a
 * cent at the configured rate therefore yield a fee of `0.00`.
 */

import { Prisma } from '@prisma/client';

const BPS_DIVISOR = 10_000;
const FEE_DECIMAL_PLACES = 2;

export function calculatePlatformFee(
  amount: Prisma.Decimal.Value,
  feeBps: number,
): Prisma.Decimal {
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > BPS_DIVISOR) {
    throw new RangeError(`Fee must be an integer between 0 and ${BPS_DIVISOR} basis points.`);
  }
  const decimal = new Prisma.Decimal(amount);
  if (decimal.isNegative()) {
    throw new RangeError('Amount cannot be negative.');
  }
  // Multiply before dividing so the division by a power of ten stays exact.
  return decimal
    .mul(feeBps)
    .div(BPS_DIVISOR)
    .toDecimalPlaces(FEE_DECIMAL_PLACES, Prisma.Decimal.ROUND_HALF_UP);
}
