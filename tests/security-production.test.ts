import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { createRateLimiter } from "../src/middleware/rate-limit";

describe("controles HTTP de producción", () => {
  it("conserva un X-Request-Id válido enviado por el cliente", async () => {
    const response = await request(createApp())
      .get("/api/v1/health")
      .set("X-Request-Id", "academix-test-123");

    expect(response.headers["x-request-id"]).toBe("academix-test-123");
  });

  it("reemplaza un X-Request-Id inválido", async () => {
    const response = await request(createApp())
      .get("/api/v1/health")
      .set("X-Request-Id", "valor con espacios");

    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("marca las respuestas de autenticación como no almacenables", async () => {
    const response = await request(createApp()).get("/api/v1/auth/me");

    expect(response.status).toBe(401);
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("responde 429 con el contrato común y cabeceras estándar", async () => {
    const app = express();
    app.use(createRateLimiter(1, "test-policy"));
    app.get("/resource", (_req, res) => res.status(200).json({ ok: true }));

    await request(app).get("/resource").expect(200);
    const response = await request(app).get("/resource");

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe("RATE_LIMITED");
    expect(response.headers).toHaveProperty("ratelimit");
    expect(response.headers).not.toHaveProperty("x-ratelimit-limit");
  });

  it("autoriza la cabecera necesaria para cargar archivos desde el navegador", async () => {
    const response = await request(createApp())
      .options("/api/v1/authoring/courses/11111111-1111-4111-8111-111111111111/files")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "authorization,content-type,x-file-name");
    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-headers"].toLowerCase()).toContain("x-file-name");
  });

  it("no penaliza respuestas exitosas cuando el limitador se configura para autenticación", async () => {
    const app = express();
    app.use(createRateLimiter(1, "auth-test", { skipSuccessfulRequests: true }));
    app.get("/login", (_req, res) => res.status(200).json({ ok: true }));

    await request(app).get("/login").expect(200);
    await request(app).get("/login").expect(200);
  });
});
