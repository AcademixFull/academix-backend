import type { Request, Response } from "express";
import { env } from "../config/env";
import { APP_VERSION } from "../config/version";
import { checkSupabaseReadiness } from "../services/health.service";
import { errorResponse, successResponse } from "../utils/api-response";

/**
 * GET /api/v1/health
 *
 * Endpoint público sin autenticación. Sirve para comprobar que
 * academix-backend está vivo, tanto en pruebas manuales como desde
 * academix-frontend (Fase 4).
 *
 * Campos adicionales incluidos (todos seguros de exponer):
 * - environment: útil para confirmar contra qué entorno se está
 *   probando (development/production), sin revelar configuración.
 * - uptime: segundos desde que arrancó el proceso; útil para monitoreo
 *   básico, no expone información sensible.
 * - timestamp: hora del servidor al responder, útil para detectar
 *   problemas de reloj/caché.
 *
 * NO se incluyen: variables de entorno, rutas internas, versión de
 * dependencias, ni ningún dato de configuración o secretos.
 */
export function getHealth(_req: Request, res: Response): void {
  res.status(200).json(
    successResponse({
      status: "ok",
      version: APP_VERSION,
      environment: env.NODE_ENV,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    })
  );
}

/** GET /api/v1/health/ready: comprueba la dependencia de base de datos. */
export async function getReadiness(req: Request, res: Response): Promise<void> {
  try {
    await checkSupabaseReadiness();

    res.status(200).json(
      successResponse({
        status: "ready",
        checks: { database: "ok" },
        timestamp: new Date().toISOString(),
      })
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "readiness_failed",
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
        errorName: error instanceof Error ? error.name : "UnknownError",
      })
    );

    res
      .status(503)
      .json(errorResponse("SERVICE_UNAVAILABLE", "El servicio no está disponible temporalmente."));
  }
}
