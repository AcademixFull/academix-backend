import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { isProduction } from "../config/env";

const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/** Asigna X-Request-Id y emite un log HTTP estructurado en producción. */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.get("x-request-id");
  req.requestId = incoming && requestIdPattern.test(incoming) ? incoming : randomUUID();
  res.setHeader("X-Request-Id", req.requestId);

  if (isProduction) {
    const startedAt = process.hrtime.bigint();

    res.once("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      console.log(
        JSON.stringify({
          event: "http_request",
          timestamp: new Date().toISOString(),
          requestId: req.requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs: Number(durationMs.toFixed(2)),
        })
      );
    });
  }

  next();
}
