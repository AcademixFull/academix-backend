import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { accountDeletionService } from "../services/account-deletion.runtime";
import { successResponse } from "../utils/api-response";

const requestSchema = z.object({ password: z.string().min(1).max(1024), confirmation: z.literal("ELIMINAR MI CUENTA") }).strict();
export async function getAccountDeletion(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Debes iniciar sesión.");
    res.json(successResponse(await accountDeletionService.get(req.auth.user.id)));
  } catch (error) { next(error); }
}
export async function requestAccountDeletion(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Debes iniciar sesión.");
    const input = requestSchema.parse(req.body);
    res.status(201).json(successResponse(await accountDeletionService.request(req.auth.user, input.password)));
  } catch (error) { next(error); }
}
export async function cancelAccountDeletion(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Debes iniciar sesión.");
    await accountDeletionService.cancel(req.auth.user.id);
    res.json(successResponse({ cancelled: true }));
  } catch (error) { next(error); }
}
