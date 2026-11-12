import { invalidateCatalogOnMutation } from "./middleware/catalog-cache";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { corsOptions } from "./config/cors";
import { env } from "./config/env";
import { errorHandler } from "./middleware/error-handler";
import { notFound } from "./middleware/not-found";
import { apiRateLimiter } from "./middleware/rate-limit";
import { requestContext } from "./middleware/request-context";
import apiRoutes from "./routes";

/**
 * Crea y configura la aplicación Express, sin arrancarla.
 * Separada de server.ts para poder importarla desde los tests
 * (Supertest) sin tener que levantar un puerto real.
 */
export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");

  app.set("trust proxy", env.TRUST_PROXY_HOPS === 0 ? false : env.TRUST_PROXY_HOPS);
  app.use(requestContext);

  // Cabeceras de seguridad básicas (no es autenticación ni autorización,
  // solo buenas prácticas de cabeceras HTTP).
  app.use(helmet());

  // Solo el frontend autorizado puede llamar a esta API desde el navegador.
  // FRONTEND_URL es obligatoria (ver config/env.ts): nunca usamos "*".
  app.use(cors(corsOptions));

  // Body parser JSON con límite de payload para evitar solicitudes
  // maliciosas o accidentales de tamaño excesivo.
  app.use(express.json({ limit: "1mb" }));

  // Protección general por IP. Los preflights OPTIONS no consumen cuota.
  app.use("/api/v1", apiRateLimiter);

  // Todas las rutas de la API viven bajo /api/v1.
  app.use("/api/v1", invalidateCatalogOnMutation, apiRoutes);

  // Cualquier ruta que no haya sido manejada arriba.
  app.use(notFound);

  // SIEMPRE al final: Express lo reconoce como error handler por su
  // firma de 4 argumentos.
  app.use(errorHandler);

  return app;
}
