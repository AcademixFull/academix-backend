import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { AppError } from "../src/errors/app-error";
import { errorHandler } from "../src/middleware/error-handler";
import { paginatedResponse } from "../src/utils/api-response";

describe("base HTTP de la API", () => {
  const app = createApp();

  it.each(["http://localhost:5173", "http://localhost:4173"])("permite el origen configurado %s y responde el preflight", async (origin) => {
    const response = await request(app)
      .options("/api/v1/health")
      .set("Origin", origin)
      .set("Access-Control-Request-Method", "GET");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(origin);
  });

  it("rechaza un origen no autorizado con el contrato común", async () => {
    const response = await request(app)
      .get("/api/v1/health")
      .set("Origin", "https://origen-no-autorizado.example");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: "CORS_ORIGIN_DENIED",
        message: "El origen de la solicitud no está autorizado.",
      },
    });
  });

  it("responde JSON controlado cuando el body está mal formado", async () => {
    const response = await request(app)
      .post("/api/v1/ruta-inexistente")
      .set("Content-Type", "application/json")
      .send('{"incompleto":');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_JSON");
  });

  it("no expone la cabecera de tecnología de Express", async () => {
    const response = await request(app).get("/api/v1/health");

    expect(response.headers).not.toHaveProperty("x-powered-by");
  });
});

describe("errores y respuestas compartidas", () => {
  it("serializa errores operativos conocidos", async () => {
    const app = express();
    app.get("/forbidden", () => {
      throw new AppError(403, "FORBIDDEN", "No tienes acceso a este recurso.");
    });
    app.use(errorHandler);

    const response = await request(app).get("/forbidden");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("responde 413 cuando el parser rechaza un archivo demasiado grande", async () => {
    const app = express();
    app.get("/too-large", (_req, _res, next) => {
      next(Object.assign(new Error("too large"), { type: "entity.too.large" }));
    });
    app.use(errorHandler);

    const response = await request(app).get("/too-large");

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("construye el sobre paginado esperado por el frontend", () => {
    expect(
      paginatedResponse([{ id: "course-1" }], {
        page: 1,
        limit: 12,
        total: 1,
        totalPages: 1,
      })
    ).toEqual({
      success: true,
      data: [{ id: "course-1" }],
      pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
    });
  });
});
