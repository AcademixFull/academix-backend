import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";
import { updateProfileSchema } from "../schemas/profile.schemas";
import { profileService } from "../services/profile.service";
import { successResponse } from "../utils/api-response";

export async function getMyProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Debes iniciar sesión.");
    res.json(successResponse(await profileService.get(req.auth.user)));
  } catch (error) {
    next(error);
  }
}

export async function updateMyProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Debes iniciar sesión.");
    const input = updateProfileSchema.parse(req.body);
    res.json(successResponse(await profileService.update(req.auth.user, input)));
  } catch (error) {
    next(error);
  }
}
