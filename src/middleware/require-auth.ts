import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";
import { authService } from "../services/auth.service";

function bearerToken(header: string | undefined): string {
  if (!header) {
    throw new AppError(401, "AUTH_REQUIRED", "Debes iniciar sesión para acceder a este recurso.");
  }

  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match?.[1]) {
    throw new AppError(401, "INVALID_AUTH_HEADER", "La cabecera Authorization no es válida.");
  }

  return match[1];
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  res.setHeader("Cache-Control", "no-store");

  try {
    const accessToken = bearerToken(req.header("authorization"));
    const user = await authService.verifyAccessToken(accessToken);
    req.auth = { accessToken, user };
    next();
  } catch (error) {
    next(error);
  }
}
