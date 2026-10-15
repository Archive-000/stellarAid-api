/**
 * Notifications controller (#842) — paginated list, mark read, mark all
 * read, unread count.
 */

import type { Response } from 'express';

import { catchAsync, getAuthUser, getValidated } from '@/middlewares';
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/services/notifications.service';
import type { ApiResponse } from '@/types';
import type {
  ListNotificationsQuerySchema,
  NotificationIdParamsSchema,
} from '@/validators/notifications.schemas';

/** GET /api/v1/notifications — paginated list, optional `unreadOnly` filter. */
export const getNotifications = catchAsync(async (req, res: Response) => {
  const { sub } = getAuthUser(req);
  const { query } = getValidated<unknown, unknown, ListNotificationsQuerySchema>(req);
  const page = await listNotifications(sub, {
    page: query.page,
    limit: query.limit,
    unreadOnly: query.unreadOnly,
  });
  res.status(200).json({ success: true, data: page } satisfies ApiResponse<typeof page>);
});

/** PATCH /api/v1/notifications/:id/read — mark one notification as read. */
export const patchNotificationRead = catchAsync(async (req, res: Response) => {
  const { sub } = getAuthUser(req);
  const { params } = getValidated<unknown, NotificationIdParamsSchema, unknown>(req);
  const notification = await markNotificationRead(sub, params.id);
  res
    .status(200)
    .json({ success: true, data: notification } satisfies ApiResponse<typeof notification>);
});

/** PATCH /api/v1/notifications/read-all — mark every unread notification as read. */
export const patchAllNotificationsRead = catchAsync(async (req, res: Response) => {
  const { sub } = getAuthUser(req);
  const result = await markAllNotificationsRead(sub);
  res.status(200).json({ success: true, data: result } satisfies ApiResponse<typeof result>);
});

/** GET /api/v1/notifications/unread-count — accurate, cached unread count. */
export const getUnreadNotificationsCount = catchAsync(async (req, res: Response) => {
  const { sub } = getAuthUser(req);
  const count = await getUnreadCount(sub);
  res
    .status(200)
    .json({ success: true, data: { unreadCount: count } } satisfies ApiResponse<unknown>);
});
