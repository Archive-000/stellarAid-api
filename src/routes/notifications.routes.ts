/**
 * Notifications routes (v1) — list, mark read, mark all read, unread count
 * (#842).
 */

import { createFeatureRouter } from './router-factory';
import {
  getNotifications,
  getUnreadNotificationsCount,
  patchAllNotificationsRead,
  patchNotificationRead,
} from '@/controllers/notifications.controller';
import { authenticate, validate } from '@/middlewares';
import {
  listNotificationsQuerySchema,
  notificationIdParamsSchema,
} from '@/validators/notifications.schemas';

export const notificationsRouter = createFeatureRouter('notifications');

notificationsRouter.get(
  '/',
  authenticate,
  validate({ query: listNotificationsQuerySchema }),
  getNotifications,
);

// Static paths are registered before `/:id/...` so they can never be
// shadowed by a parameterised match.
notificationsRouter.get('/unread-count', authenticate, getUnreadNotificationsCount);
notificationsRouter.patch('/read-all', authenticate, patchAllNotificationsRead);
notificationsRouter.patch(
  '/:id/read',
  authenticate,
  validate({ params: notificationIdParamsSchema }),
  patchNotificationRead,
);
