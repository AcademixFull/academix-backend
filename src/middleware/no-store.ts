import type { NextFunction, Request, Response } from "express";

/** Evita almacenar respuestas que puedan contener sesión o datos de usuario. */
export function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Cache-Control", "no-store");
  next();
}
