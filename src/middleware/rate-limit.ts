import { rateLimit } from "express-rate-limit";
import { env } from "../config/env";
import { errorResponse } from "../utils/api-response";

const sharedOptions = {
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  standardHeaders: "draft-8" as const,
  legacyHeaders: false,
  skip: (req: { method: string }) => req.method === "OPTIONS",
  handler: (_req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }) => {
    res
      .status(429)
      .json(errorResponse("RATE_LIMITED", "Se realizaron demasiadas solicitudes. Intenta nuevamente más tarde."));
  },
};

export function createRateLimiter(
  limit: number,
  identifier: string,
  options: { skipSuccessfulRequests?: boolean } = {}
) {
  return rateLimit({ ...sharedOptions, limit, identifier, ...options });
}

/** Límite general por proceso/IP para toda la API. */
export const apiRateLimiter = createRateLimiter(env.RATE_LIMIT_MAX, "academix-api");

/** Límite adicional para operaciones públicas sensibles de autenticación. */
export const authRateLimiter = createRateLimiter(env.AUTH_RATE_LIMIT_MAX, "academix-auth", {
  // Solo los intentos fallidos deben agotar la cuota sensible de autenticación.
  skipSuccessfulRequests: true,
});
