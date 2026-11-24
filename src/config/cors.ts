import type { CorsOptions } from "cors";
import { frontendOrigins } from "./env";
import { AppError } from "../errors/app-error";

const allowedOrigins = new Set(frontendOrigins);

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Las solicitudes sin Origin corresponden a clientes servidor-a-servidor,
    // curl, herramientas de monitoreo o las pruebas de integración.
    if (!origin || allowedOrigins.has(origin.replace(/\/$/, ""))) {
      callback(null, true);
      return;
    }

    callback(
      new AppError(
        403,
        "CORS_ORIGIN_DENIED",
        "El origen de la solicitud no está autorizado."
      )
    );
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type", "X-File-Name"],
  maxAge: 600,
};
