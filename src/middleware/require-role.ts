import type { NextFunction, Request, RequestHandler, Response } from "express";
import { AppError } from "../errors/app-error";
import type { AuthUser } from "../services/auth.service";

export function requireRole(...allowedRoles: AuthUser["role"][]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new AppError(401, "AUTH_REQUIRED", "Debes iniciar sesión."));
      return;
    }

    if (!allowedRoles.includes(req.auth.user.role)) {
      next(
        new AppError(
          403,
          "ROLE_FORBIDDEN",
          "No tienes el rol necesario para acceder a este recurso."
        )
      );
      return;
    }

    next();
  };
}
