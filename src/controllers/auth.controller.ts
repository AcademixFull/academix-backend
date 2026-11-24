import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";
import {
  passwordResetSchema,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
} from "../schemas/auth.schemas";
import { authService } from "../services/auth.service";
import { successResponse } from "../utils/api-response";

export async function signUp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.signUp(signUpSchema.parse(req.body));
    res.status(201).json(successResponse(result));
  } catch (error) {
    next(error);
  }
}

export async function signIn(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.signIn(signInSchema.parse(req.body));
    res.json(successResponse(result));
  } catch (error) {
    next(error);
  }
}

export async function requestPasswordReset(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email } = passwordResetSchema.parse(req.body);
    await authService.requestPasswordReset(email);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Debes iniciar sesión.");
    res.json(successResponse({ user: req.auth.user }));
  } catch (error) {
    next(error);
  }
}

export async function signOut(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Debes iniciar sesión.");
    await authService.signOut(req.auth.accessToken);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function updatePassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Debes iniciar sesión.");
    await authService.updatePassword(
      req.auth.user.id,
      req.auth.accessToken,
      updatePasswordSchema.parse(req.body)
    );
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
