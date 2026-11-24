import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { notificationService } from "../services/notification.service";
import { successResponse } from "../utils/api-response";

const identifierSchema = z.object({ notificationId: z.string().uuid() });
const listSchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(30) });

function userId(req: Request): string {
  if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Debes iniciar sesión.");
  return req.auth.user.id;
}

export async function listNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const { limit } = listSchema.parse(req.query);
    res.json(successResponse(await notificationService.list(userId(req), limit)));
  } catch (error) { next(error); }
}

export async function unreadNotificationCount(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(successResponse({ count: await notificationService.unreadCount(userId(req)) }));
  } catch (error) { next(error); }
}

export async function markNotificationRead(req: Request, res: Response, next: NextFunction) {
  try {
    const { notificationId } = identifierSchema.parse(req.params);
    res.json(successResponse(await notificationService.markRead(userId(req), notificationId)));
  } catch (error) { next(error); }
}

export async function markAllNotificationsRead(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(successResponse(await notificationService.markAllRead(userId(req))));
  } catch (error) { next(error); }
}
