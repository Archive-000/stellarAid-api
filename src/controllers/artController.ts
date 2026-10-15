/**
 * Health controller.
 *
 * Controllers stay thin: they map requests to service calls and shape the
 * HTTP response.
 */

import type { Request, Response } from 'express';
import {
  getHealthStatus,
  getLivenessStatus,
  getReadinessStatus,
  type HealthStatus,
  type ReadinessStatus,
} from '@/services';

/** GET /health — liveness probe. */
export function getHealth(_req: Request, res: Response<HealthStatus>): void {
  res.status(200).json(getHealthStatus());
}

/** GET /health/live — always 200 while the process runs. */
export function getLiveness(_req: Request, res: Response<{ status: 'ok' }>): void {
  res.status(200).json(getLivenessStatus());
}

/** GET /health/ready — 200 when DB/Redis are reachable, otherwise 503. */
export async function getReadiness(_req: Request, res: Response<ReadinessStatus>): Promise<void> {
  const status = await getReadinessStatus();
  res.status(status.status === 'ready' ? 200 : 503).json(status);
}
